import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
} from '../core/candidate.js';

export const XML_TREE_ADAPTER_VERSION = '1';

export interface XmlAttribute {
  name: string;
  value: string;
}

export type XmlTreeContent =
  | { kind: 'text'; value: string }
  | { kind: 'element'; element: XmlElementNode };

export interface XmlElementNode {
  name: string;
  attributes: readonly XmlAttribute[];
  content: readonly XmlTreeContent[];
}

export interface XmlTreeNode {
  path: string;
  name: string;
  childPaths: readonly string[];
  attributeValues: readonly string[];
  textValues: readonly string[];
  element: XmlElementNode;
  candidate: Candidate;
}

export interface XmlTreeDocument {
  root: XmlElementNode;
  nodes: readonly XmlTreeNode[];
  candidates: readonly Candidate[];
}

function decodeXmlEntities(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '&') {
      output += value[index];
      continue;
    }
    const end = value.indexOf(';', index + 1);
    if (end < 0) {
      throw new Error('unterminated XML entity reference');
    }
    const token = value.slice(index + 1, end);
    const named: Record<string, string> = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      quot: '"',
    };
    if (Object.prototype.hasOwnProperty.call(named, token)) {
      output += named[token];
    } else if (/^#x[0-9a-f]+$/iu.test(token)) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff) {
        throw new Error(`invalid XML character reference: &${token};`);
      }
      output += String.fromCodePoint(codePoint);
    } else if (/^#[0-9]+$/u.test(token)) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff) {
        throw new Error(`invalid XML character reference: &${token};`);
      }
      output += String.fromCodePoint(codePoint);
    } else {
      throw new Error(`unsupported XML entity reference: &${token};`);
    }
    index = end;
  }
  return output;
}

function xmlTagEnd(text: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function parseStartTag(raw: string): {
  name: string;
  attributes: XmlAttribute[];
  selfClosing: boolean;
} {
  if (!raw.startsWith('<') || !raw.endsWith('>')) {
    throw new Error('invalid XML start tag');
  }
  let body = raw.slice(1, -1).trim();
  const selfClosing = body.endsWith('/');
  if (selfClosing) body = body.slice(0, -1).trimEnd();

  const name = /^[A-Za-z_][A-Za-z0-9_.:-]*/u.exec(body)?.[0];
  if (!name) throw new Error('invalid XML element name');

  const attributes: XmlAttribute[] = [];
  const names = new Set<string>();
  let index = name.length;
  while (index < body.length) {
    while (index < body.length && /[\t\n\r ]/u.test(body[index])) index += 1;
    if (index >= body.length) break;

    const attribute = /^[A-Za-z_][A-Za-z0-9_.:-]*/u.exec(
      body.slice(index),
    )?.[0];
    if (!attribute) throw new Error('invalid XML attribute name');
    if (names.has(attribute)) {
      throw new Error(`duplicate XML attribute: ${attribute}`);
    }
    names.add(attribute);
    index += attribute.length;

    while (index < body.length && /[\t\n\r ]/u.test(body[index])) index += 1;
    if (body[index] !== '=') throw new Error(`XML attribute needs '=': ${attribute}`);
    index += 1;
    while (index < body.length && /[\t\n\r ]/u.test(body[index])) index += 1;

    const quote = body[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`XML attribute must be quoted: ${attribute}`);
    }
    index += 1;
    const end = body.indexOf(quote, index);
    if (end < 0) throw new Error(`unterminated XML attribute: ${attribute}`);
    attributes.push({
      name: attribute,
      value: decodeXmlEntities(body.slice(index, end)),
    });
    index = end + 1;
  }

  return { name, attributes, selfClosing };
}

function parseXml(text: string): XmlElementNode {
  const input = text.replace(/^\uFEFF/u, '');
  const stack: {
    name: string;
    attributes: XmlAttribute[];
    content: XmlTreeContent[];
  }[] = [];
  let root: XmlElementNode | undefined;
  let index = 0;

  const appendText = (value: string, decode = true): void => {
    if (value.length === 0) return;
    const actual = decode ? decodeXmlEntities(value) : value;
    if (stack.length === 0) {
      if (actual.trim().length > 0) {
        throw new Error('text is not allowed outside the XML document element');
      }
      return;
    }
    stack[stack.length - 1].content.push({ kind: 'text', value: actual });
  };

  while (index < input.length) {
    const open = input.indexOf('<', index);
    if (open < 0) {
      appendText(input.slice(index));
      break;
    }
    appendText(input.slice(index, open));

    if (input.startsWith('<!--', open)) {
      const end = input.indexOf('-->', open + 4);
      if (end < 0) throw new Error('unterminated XML comment');
      index = end + 3;
      continue;
    }
    if (input.startsWith('<?', open)) {
      const end = input.indexOf('?>', open + 2);
      if (end < 0) throw new Error('unterminated XML processing instruction');
      index = end + 2;
      continue;
    }
    if (input.startsWith('<![CDATA[', open)) {
      const end = input.indexOf(']]>', open + 9);
      if (end < 0) throw new Error('unterminated XML CDATA section');
      appendText(input.slice(open + 9, end), false);
      index = end + 3;
      continue;
    }
    if (input.startsWith('<!', open)) {
      throw new Error('DTD/declaration syntax is not supported for deterministic XML Tree extraction');
    }
    if (input.startsWith('</', open)) {
      const end = input.indexOf('>', open + 2);
      if (end < 0) throw new Error('unterminated XML closing tag');
      const name = input.slice(open + 2, end).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name)) {
        throw new Error('invalid XML closing tag');
      }
      const current = stack.pop();
      if (!current || current.name !== name) {
        throw new Error(`mismatched XML closing tag: ${name}`);
      }
      const element: XmlElementNode = {
        name: current.name,
        attributes: current.attributes,
        content: current.content,
      };
      if (stack.length > 0) {
        stack[stack.length - 1].content.push({ kind: 'element', element });
      } else if (!root) {
        root = element;
      } else {
        throw new Error('XML document contains multiple root elements');
      }
      index = end + 1;
      continue;
    }

    const end = xmlTagEnd(input, open);
    if (end < 0) throw new Error('unterminated XML start tag');
    const parsed = parseStartTag(input.slice(open, end + 1));
    if (parsed.selfClosing) {
      const element: XmlElementNode = {
        name: parsed.name,
        attributes: parsed.attributes,
        content: [],
      };
      if (stack.length > 0) {
        stack[stack.length - 1].content.push({ kind: 'element', element });
      } else if (!root) {
        root = element;
      } else {
        throw new Error('XML document contains multiple root elements');
      }
    } else {
      stack.push({
        name: parsed.name,
        attributes: parsed.attributes,
        content: [],
      });
    }
    index = end + 1;
  }

  if (stack.length > 0) {
    throw new Error(`unclosed XML element: ${stack[stack.length - 1].name}`);
  }
  if (!root) throw new Error('XML document has no root element');
  return root;
}

function canonicalElement(element: XmlElementNode): string {
  const attributes = [...element.attributes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attribute) => [attribute.name, attribute.value]);
  const content = element.content.map((item) =>
    item.kind === 'text'
      ? ['text', item.value]
      : ['element', canonicalElement(item.element)]);
  return JSON.stringify({
    name: element.name,
    attributes,
    content,
  });
}

function pathFor(parent: string, name: string, ordinal: number): string {
  return `${parent}/${name}[${ordinal}]`;
}

function collectNodes(
  element: XmlElementNode,
  path: string,
  source: string,
  sourceDigest: string,
  out: XmlTreeNode[],
): void {
  const childElements = element.content
    .filter((item): item is Extract<XmlTreeContent, { kind: 'element' }> =>
      item.kind === 'element')
    .map((item) => item.element);
  const siblingCounts = new Map<string, number>();
  const childPaths = childElements.map((child) => {
    const ordinal = (siblingCounts.get(child.name) ?? 0) + 1;
    siblingCounts.set(child.name, ordinal);
    return pathFor(path, child.name, ordinal);
  });
  const attributeValues = [...element.attributes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attribute) => `@${attribute.name}=${JSON.stringify(attribute.value)}`);
  const textValues = element.content
    .filter((item): item is Extract<XmlTreeContent, { kind: 'text' }> =>
      item.kind === 'text')
    .map((item) => item.value)
    .filter((value) => value.trim().length > 0);

  const claims: Candidate['claims'] = [
    {
      aspect: 'structural-path',
      value: path,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-element-path',
    },
    {
      aspect: 'node-type',
      value: 'element',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-element',
    },
    {
      aspect: 'element-name',
      value: element.name,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-qualified-name',
    },
    {
      aspect: 'children',
      value: childPaths,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-parent-child',
    },
    ...(attributeValues.length > 0
      ? [{
          aspect: 'attributes',
          value: attributeValues,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'xml-attributes',
        }]
      : []),
    ...(textValues.length > 0
      ? [{
          aspect: 'text',
          value: textValues,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'xml-text',
        }]
      : []),
  ];

  const candidate: Candidate = {
    kind: 'tree',
    locator: {
      source,
      sourceDigest,
      structuralPath: path,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: 'mmi.xml-tree-adapter',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {
          format: 'xml',
          path: 'qualified-name-sibling-index-v1',
          dtd: 'rejected',
        },
        implementationVersion: XML_TREE_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'xml-subtree-canonical-v1',
      canonicalElement(element),
    ),
    scores: [],
  };

  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(`invalid XML Tree Candidate at ${path}: ${problem}`);
  }

  out.push({
    path,
    name: element.name,
    childPaths,
    attributeValues,
    textValues,
    element,
    candidate,
  });

  childElements.forEach((child, index) => {
    collectNodes(
      child,
      childPaths[index],
      source,
      sourceDigest,
      out,
    );
  });
}

export function readXmlTree(
  text: string,
  source: string,
  sourceDigest: string,
): XmlTreeDocument {
  const root = parseXml(text);
  const nodes: XmlTreeNode[] = [];
  collectNodes(
    root,
    pathFor('', root.name, 1),
    source,
    sourceDigest,
    nodes,
  );
  return {
    root,
    nodes,
    candidates: nodes.map((node) => node.candidate),
  };
}

export function resolveXmlTreePath(
  document: XmlTreeDocument,
  structuralPath: string,
): XmlTreeNode | undefined {
  if (structuralPath === '') return document.nodes[0];
  return document.nodes.find((node) => node.path === structuralPath);
}
