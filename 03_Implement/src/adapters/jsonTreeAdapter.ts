/**
 * Source Adapter: JSON -> Tree (issue-0199). The nesting of objects and
 * arrays is stated by the format, so the hierarchy is `observed` (M0) and
 * deterministic.
 *
 * A small parser of its own instead of `JSON.parse`, because JSON.parse
 *   - reorders integer-like keys (`{"2":..,"1":..}` comes back as 1, 2),
 *   - silently keeps only the last of duplicate keys, and
 *   - gives no line numbers.
 * Here keys keep source order, duplicates are kept and reported, numbers keep
 * their source text, and every node has a line/column and a JSON Pointer.
 *
 * Depth and node count are bounded. Crossing a bound yields no tree and a
 * diagnostic -- never a silently truncated one.
 */
import { DEFAULT_TREE_LIMITS, type Tree, type TreeLimits, type TreeNode } from '../core/tree.js';
import {
  limitDiagnostic,
  lineIndex,
  stripBom,
  TreeLimitError,
  treeCandidate,
  type ExplicitTreeResult,
  type TreeDiagnostic,
} from './treeCandidates.js';
import type { Candidate } from '../core/candidate.js';

export const JSON_TREE_ALGORITHM = 'mmi.json-tree';
/** Bump when parsing or mapping rules change in a way that can change output. */
export const JSON_TREE_VERSION = '1';

class JsonSyntaxError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
  }
}

const pointerToken = (key: string): string => key.replace(/~/gu, '~0').replace(/\//gu, '~1');

export function readJsonTree(text: string, limits: TreeLimits = DEFAULT_TREE_LIMITS): ExplicitTreeResult {
  const src = stripBom(text);
  const position = lineIndex(src);
  const diagnostics: TreeDiagnostic[] = [];
  let i = 0;
  let nodes = 0;

  const skipWhitespace = (): void => {
    while (i < src.length) {
      const c = src.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i += 1;
      else break;
    }
  };
  const fail = (message: string, at = i): never => {
    throw new JsonSyntaxError(message, at);
  };
  const make = (depth: number, at: number): { line: number; column: number } => {
    const where = position(at);
    if (depth > limits.maxDepth) throw new TreeLimitError('MMI_TREE_LIMIT_DEPTH', limits.maxDepth, where.line);
    nodes += 1;
    if (nodes > limits.maxNodes) throw new TreeLimitError('MMI_TREE_LIMIT_NODES', limits.maxNodes, where.line);
    return where;
  };
  const readString = (): string => {
    const start = i;
    i += 1;
    while (i < src.length) {
      const c = src.charCodeAt(i);
      if (c === 0x22) break;
      if (c === 0x5c) i += 2;
      else if (c < 0x20) fail('control character in string');
      else i += 1;
    }
    if (i >= src.length) fail('unterminated string', start);
    i += 1;
    try {
      return JSON.parse(src.slice(start, i)) as string;
    } catch {
      return fail('invalid escape in string', start);
    }
  };

  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;

  const readValue = (label: string, path: string, depth: number): TreeNode => {
    skipWhitespace();
    const at = i;
    const ch = src[i];
    if (ch === '{') {
      const where = make(depth, at);
      i += 1;
      const children: TreeNode[] = [];
      const seen = new Set<string>();
      skipWhitespace();
      if (src[i] === '}') i += 1;
      else {
        for (;;) {
          skipWhitespace();
          if (src[i] !== '"') fail('expected a string key');
          const keyAt = i;
          const key = readString();
          if (seen.has(key)) {
            const p = position(keyAt);
            diagnostics.push({ code: 'MMI_TREE_JSON_DUPLICATE_KEY', severity: 'warning', message: `duplicate key "${key}" in ${path || '/'}; both are kept in source order`, line: p.line, column: p.column });
          }
          seen.add(key);
          skipWhitespace();
          if (src[i] !== ':') fail('expected ":"');
          i += 1;
          children.push(readValue(key, `${path}/${pointerToken(key)}`, depth + 1));
          skipWhitespace();
          if (src[i] === ',') i += 1;
          else if (src[i] === '}') {
            i += 1;
            break;
          } else fail('expected "," or "}"');
        }
      }
      return { kind: 'object', label, children, locator: { ...where, path: path || '/' } };
    }
    if (ch === '[') {
      const where = make(depth, at);
      i += 1;
      const children: TreeNode[] = [];
      skipWhitespace();
      if (src[i] === ']') i += 1;
      else {
        for (;;) {
          const index = children.length;
          children.push(readValue(`[${index}]`, `${path}/${index}`, depth + 1));
          skipWhitespace();
          if (src[i] === ',') i += 1;
          else if (src[i] === ']') {
            i += 1;
            break;
          } else fail('expected "," or "]"');
        }
      }
      return { kind: 'array', label, children, locator: { ...where, path: path || '/' } };
    }
    if (ch === '"') {
      const where = make(depth, at);
      const value = readString();
      return { kind: 'value', label, value, valueType: 'string', children: [], locator: { ...where, path: path || '/' } };
    }
    for (const [literal, valueType] of [['true', 'boolean'], ['false', 'boolean'], ['null', 'null']] as const) {
      if (src.startsWith(literal, i)) {
        const where = make(depth, at);
        i += literal.length;
        return { kind: 'value', label, value: literal, valueType, children: [], locator: { ...where, path: path || '/' } };
      }
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(src);
    if (number) {
      const where = make(depth, at);
      i += number[0].length;
      return { kind: 'value', label, value: number[0], valueType: 'number', children: [], locator: { ...where, path: path || '/' } };
    }
    return fail(i >= src.length ? 'unexpected end of input' : `unexpected character "${src[i]}"`);
  };

  try {
    const root = readValue('$', '', 1);
    skipWhitespace();
    if (i < src.length) fail('unexpected content after the top-level value');
    const tree: Tree = { roots: [root] };
    return { tree, diagnostics };
  } catch (error) {
    if (error instanceof TreeLimitError) return { diagnostics: [...diagnostics, limitDiagnostic(error)] };
    if (error instanceof JsonSyntaxError) {
      const p = position(error.offset);
      return { diagnostics: [...diagnostics, { code: 'MMI_TREE_JSON_SYNTAX', severity: 'error', message: `JSON syntax: ${error.message}`, line: p.line, column: p.column }] };
    }
    throw error;
  }
}

export interface JsonTreeCandidateInput {
  source: string;
  sourceDigest: string;
  tree: Tree;
  limits?: TreeLimits;
}

export function jsonTreeCandidate(input: JsonTreeCandidateInput): Candidate {
  const limits = input.limits ?? DEFAULT_TREE_LIMITS;
  return treeCandidate({
    source: input.source,
    sourceDigest: input.sourceDigest,
    algorithm: JSON_TREE_ALGORITHM,
    implementationVersion: JSON_TREE_VERSION,
    config: { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes },
    status: 'observed',
    method: 'M0',
    reasonCode: 'json-object-array-nesting',
    evidence: [{ code: 'key-order', detail: 'source order' }],
    tree: input.tree,
  });
}
