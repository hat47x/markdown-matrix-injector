/**
 * Source Adapter: generic XML -> Tree (issue-0199). Element nesting is
 * stated by the format, so the hierarchy is `observed` (M0) and
 * deterministic.
 *
 * What is kept: elements (qualified names as written), attributes in source
 * order (namespace declarations included), text, CDATA sections, comments
 * and processing instructions, each as its own node in document order.
 * Whitespace-only text between markup is dropped (recorded in the config).
 *
 * What is refused, with a diagnostic and no tree:
 *   - XML Spreadsheet 2003. It is a table format and the existing table
 *     loader is authoritative for it; reading it as a tree would compete
 *     with `inspect` / references (MMI_TREE_XML_SPREADSHEET).
 *   - A DOCTYPE with an external identifier (SYSTEM / PUBLIC), or an internal
 *     subset declaring entities. Nothing outside the file is ever fetched and
 *     no entity is expanded beyond the five predefined ones and character
 *     references (XXE / entity-expansion safety).
 *   - Encodings other than UTF-8, malformed markup, and crossing the depth /
 *     node limits.
 *
 * A minimal parser of its own: no dependency, and none of the resolution
 * features a general XML library would have to be configured to turn off.
 */
import type { Candidate } from '../core/candidate.js';
import { DEFAULT_TREE_LIMITS, type Tree, type TreeAttribute, type TreeLimits, type TreeNode, type TreeNodeKind } from '../core/tree.js';
import {
  limitDiagnostic,
  lineIndex,
  stripBom,
  TreeLimitError,
  treeCandidate,
  type ExplicitTreeResult,
  type TreeDiagnostic,
  type TreeDiagnosticCode,
} from './treeCandidates.js';

export const XML_TREE_ALGORITHM = 'mmi.xml-tree';
/** Bump when parsing or mapping rules change in a way that can change output. */
export const XML_TREE_VERSION = '1';

/**
 * The same test the workbook loader uses to accept a `.xml` as a table
 * (`core/workbookLoader.ts`): anything it would load is not a tree.
 */
const XML_SPREADSHEET_SIGNATURES = ['<?mso-application progid="Excel.Sheet"?>', 'urn:schemas-microsoft-com:office:spreadsheet'];

export function isXmlSpreadsheet2003(text: string): boolean {
  return XML_SPREADSHEET_SIGNATURES.some((signature) => text.includes(signature));
}

class XmlRefusal extends Error {
  constructor(readonly code: TreeDiagnosticCode, message: string, readonly offset: number) {
    super(message);
  }
}

const NAME = /[A-Za-z_:À-￿][\w.\-:·À-￿]*/uy;

interface Frame {
  node: TreeNode & { children: TreeNode[] };
  name: string;
  path: string;
  counts: Map<string, number>;
}

export function readXmlTree(text: string, limits: TreeLimits = DEFAULT_TREE_LIMITS): ExplicitTreeResult {
  const src = stripBom(text).replace(/\r\n?/gu, '\n');
  const position = lineIndex(src);
  const diagnostics: TreeDiagnostic[] = [];
  if (isXmlSpreadsheet2003(src)) {
    return {
      diagnostics: [
        {
          code: 'MMI_TREE_XML_SPREADSHEET',
          severity: 'error',
          message: 'this is XML Spreadsheet 2003, a table format: use `mmi inspect` and table references, not `mmi tree`',
        },
      ],
    };
  }

  let i = 0;
  let nodes = 0;
  const roots: TreeNode[] = [];
  const stack: Frame[] = [];
  let sawRoot = false;
  let sawDoctype = false;

  const refuse = (code: TreeDiagnosticCode, message: string, at = i): never => {
    throw new XmlRefusal(code, message, at);
  };
  const malformed = (message: string, at = i): never => refuse('MMI_TREE_XML_MALFORMED', message, at);
  const decode = (raw: string, at: number): string =>
    raw.replace(/&([^;&\s<]*);?/gu, (match, name: string, offset: number) => {
      if (!match.endsWith(';')) return malformed('"&" must start an entity or character reference', at + offset);
      if (name === 'lt') return '<';
      if (name === 'gt') return '>';
      if (name === 'amp') return '&';
      if (name === 'quot') return '"';
      if (name === 'apos') return "'";
      const code = /^#x([0-9a-fA-F]+)$/u.exec(name)?.[1] ?? /^#(\d+)$/u.exec(name)?.[1];
      if (code !== undefined) {
        const cp = name.startsWith('#x') ? parseInt(code, 16) : Number(code);
        if (cp > 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
        return malformed(`invalid character reference &${name};`, at + offset);
      }
      return refuse('MMI_TREE_XML_DTD_UNSUPPORTED', `entity &${name}; is not one of the predefined ones; DTD entities are never resolved`, at + offset);
    });
  const add = (kind: TreeNodeKind, label: string, at: number, extra: Partial<TreeNode> = {}): TreeNode & { children: TreeNode[] } => {
    const where = position(at);
    const depth = stack.length + 1;
    if (depth > limits.maxDepth) throw new TreeLimitError('MMI_TREE_LIMIT_DEPTH', limits.maxDepth, where.line);
    nodes += 1;
    if (nodes > limits.maxNodes) throw new TreeLimitError('MMI_TREE_LIMIT_NODES', limits.maxNodes, where.line);
    const parent = stack[stack.length - 1];
    const node: TreeNode & { children: TreeNode[] } = { kind, label, ...extra, children: [], locator: { ...(extra.locator ?? {}), line: where.line, column: where.column } };
    if (parent) parent.node.children.push(node);
    else roots.push(node);
    return node;
  };
  const name = (): string => {
    NAME.lastIndex = i;
    const match = NAME.exec(src);
    if (!match) return malformed('expected a name');
    i += match[0].length;
    return match[0];
  };
  const skipSpace = (): number => {
    const start = i;
    while (i < src.length && /\s/u.test(src[i])) i += 1;
    return i - start;
  };
  const quoted = (): string => {
    const quote = src[i];
    if (quote !== '"' && quote !== "'") return malformed('expected a quoted value');
    const end = src.indexOf(quote, i + 1);
    if (end < 0) return malformed('unterminated quoted value');
    const value = src.slice(i + 1, end);
    i = end + 1;
    return value;
  };

  try {
    const declaration = /^<\?xml\s([^?]*)\?>/u.exec(src);
    if (declaration) {
      const encoding = /encoding\s*=\s*["']([^"']+)["']/u.exec(declaration[1])?.[1];
      if (encoding && !/^utf-?8$/iu.test(encoding)) {
        refuse('MMI_TREE_XML_ENCODING_UNSUPPORTED', `encoding "${encoding}" is not supported; save the file as UTF-8`, 0);
      }
      i = declaration[0].length;
    }

    while (i < src.length) {
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i + 4);
        if (end < 0) malformed('unterminated comment');
        add('comment', '#comment', i, { value: src.slice(i + 4, end) });
        i = end + 3;
      } else if (src.startsWith('<![CDATA[', i)) {
        if (stack.length === 0) malformed('CDATA outside the root element');
        const end = src.indexOf(']]>', i + 9);
        if (end < 0) malformed('unterminated CDATA section');
        add('cdata', '#cdata', i, { value: src.slice(i + 9, end) });
        i = end + 3;
      } else if (src.startsWith('<!DOCTYPE', i)) {
        if (sawRoot || sawDoctype || stack.length > 0) malformed('DOCTYPE must come once, before the root element');
        sawDoctype = true;
        const at = i;
        i += 9;
        skipSpace();
        name();
        skipSpace();
        if (src.startsWith('SYSTEM', i) || src.startsWith('PUBLIC', i)) {
          refuse('MMI_TREE_XML_EXTERNAL_DTD', 'DOCTYPE refers to an external DTD; MMI never fetches or resolves it (XXE safety)', at);
        }
        if (src[i] === '[') {
          const close = src.indexOf(']', i);
          if (close < 0) malformed('unterminated DOCTYPE internal subset', at);
          const subset = src.slice(i + 1, close);
          if (/<!ENTITY/u.test(subset)) {
            refuse('MMI_TREE_XML_DTD_UNSUPPORTED', 'DOCTYPE declares entities; MMI does not expand DTD entities (entity-expansion safety)', at);
          }
          if (/SYSTEM|PUBLIC|%/u.test(subset)) {
            refuse('MMI_TREE_XML_EXTERNAL_DTD', 'DOCTYPE internal subset refers to external or parameter entities; not resolved', at);
          }
          i = close + 1;
          skipSpace();
          const p = position(at);
          diagnostics.push({ code: 'MMI_TREE_XML_DTD_IGNORED', severity: 'warning', message: 'DOCTYPE internal subset is ignored: default attribute values and declarations are not applied', line: p.line, column: p.column });
        }
        if (src[i] !== '>') malformed('expected ">" to close DOCTYPE', at);
        i += 1;
      } else if (src.startsWith('<?', i)) {
        const at = i;
        const end = src.indexOf('?>', i + 2);
        if (end < 0) malformed('unterminated processing instruction');
        i += 2;
        const target = name();
        if (target.toLowerCase() === 'xml') malformed('XML declaration is only allowed at the very start', at);
        add('processing-instruction', target, at, { value: src.slice(i, end).trim() });
        i = end + 2;
      } else if (src.startsWith('</', i)) {
        const at = i;
        i += 2;
        const closing = name();
        skipSpace();
        if (src[i] !== '>') malformed('expected ">" in end tag');
        i += 1;
        const open = stack.pop();
        if (!open) malformed(`end tag </${closing}> without a start tag`, at);
        else if (open.name !== closing) malformed(`end tag </${closing}> does not match <${open.name}>`, at);
      } else if (src[i] === '<') {
        const at = i;
        i += 1;
        const tag = name();
        if (stack.length === 0) {
          if (sawRoot) malformed('more than one root element', at);
          sawRoot = true;
        }
        const attributes: TreeAttribute[] = [];
        for (;;) {
          const spaced = skipSpace();
          if (src.startsWith('/>', i) || src[i] === '>') break;
          if (!spaced) malformed('expected whitespace between attributes');
          const attrAt = i;
          const attr = name();
          skipSpace();
          if (src[i] !== '=') malformed(`attribute ${attr} needs a value`);
          i += 1;
          skipSpace();
          const valueAt = i + 1;
          const raw = quoted();
          if (raw.includes('<')) malformed(`"<" in the value of attribute ${attr}`, valueAt);
          if (attributes.some((a) => a.name === attr)) malformed(`duplicate attribute ${attr}`, attrAt);
          attributes.push({ name: attr, value: decode(raw, valueAt).replace(/[\t\n]/gu, ' ') });
        }
        const parent = stack[stack.length - 1];
        const count = (parent?.counts.get(tag) ?? 0) + 1;
        parent?.counts.set(tag, count);
        const path = `${parent?.path ?? ''}/${tag}[${count}]`;
        const node = add('element', tag, at, { ...(attributes.length > 0 ? { attributes } : {}), locator: { line: 1, path } });
        if (src.startsWith('/>', i)) i += 2;
        else {
          i += 1;
          stack.push({ node, name: tag, path, counts: new Map() });
        }
      } else {
        const at = i;
        const end = src.indexOf('<', i);
        const raw = src.slice(i, end < 0 ? src.length : end);
        i = end < 0 ? src.length : end;
        if (raw.trim() === '') continue;
        if (stack.length === 0) malformed('text outside the root element', at);
        if (raw.includes(']]>')) malformed('"]]>" is not allowed in text', at + raw.indexOf(']]>'));
        const leading = raw.length - raw.trimStart().length;
        add('text', '#text', at + leading, { value: decode(raw, at) });
      }
    }
    if (stack.length > 0) malformed(`<${stack[stack.length - 1].name}> is never closed`);
    if (!sawRoot) malformed('no root element');
    const tree: Tree = { roots };
    return { tree, diagnostics };
  } catch (error) {
    if (error instanceof TreeLimitError) return { diagnostics: [...diagnostics, limitDiagnostic(error)] };
    if (error instanceof XmlRefusal) {
      const p = position(Math.min(error.offset, src.length));
      return { diagnostics: [...diagnostics, { code: error.code, severity: 'error', message: error.message, line: p.line, column: p.column }] };
    }
    throw error;
  }
}

export interface XmlTreeCandidateInput {
  source: string;
  sourceDigest: string;
  tree: Tree;
  limits?: TreeLimits;
}

export function xmlTreeCandidate(input: XmlTreeCandidateInput): Candidate {
  const limits = input.limits ?? DEFAULT_TREE_LIMITS;
  const counts = new Map<TreeNodeKind, number>();
  const stack = [...input.tree.roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    stack.push(...node.children);
  }
  const kinds = (['element', 'text', 'cdata', 'comment', 'processing-instruction'] as const).map((kind) => `${kind}=${counts.get(kind) ?? 0}`).join(' ');
  return treeCandidate({
    source: input.source,
    sourceDigest: input.sourceDigest,
    algorithm: XML_TREE_ALGORITHM,
    implementationVersion: XML_TREE_VERSION,
    config: { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes, whitespaceOnlyText: 'dropped', dtd: 'never-resolved' },
    status: 'observed',
    method: 'M0',
    reasonCode: 'xml-element-nesting',
    evidence: [{ code: 'node-kinds', detail: kinds }],
    tree: input.tree,
  });
}
