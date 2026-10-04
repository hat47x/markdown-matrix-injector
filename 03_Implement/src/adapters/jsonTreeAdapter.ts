import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
} from '../core/candidate.js';

export const JSON_TREE_ADAPTER_VERSION = '1';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JsonTreeNode {
  /** RFC 6901 JSON Pointer. The document root is the empty string. */
  pointer: string;
  nodeType: 'object' | 'array';
  childPointers: readonly string[];
  /** Immediate scalar children, rendered as `<pointer>=<canonical JSON value>`. */
  leafValues: readonly string[];
  candidate: Candidate;
}

export interface JsonTreeDocument {
  value: JsonValue;
  nodes: readonly JsonTreeNode[];
  candidates: readonly Candidate[];
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isContainer(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return Array.isArray(value) || isObject(value);
}

function canonicalJson(value: JsonValue): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('JSON Tree numbers must be finite');
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function pointerToken(value: string): string {
  return value.replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function childPointer(parent: string, token: string): string {
  return `${parent}/${pointerToken(token)}`;
}

function entriesOf(
  value: JsonValue[] | { [key: string]: JsonValue },
): [string, JsonValue][] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  return Object.keys(value)
    .sort()
    .map((key) => [key, value[key]]);
}

function collectNodes(
  value: JsonValue,
  pointer: string,
  source: string,
  sourceDigest: string,
  out: JsonTreeNode[],
): void {
  if (!isContainer(value)) return;

  const entries = entriesOf(value);
  const childPointers = entries.map(([key]) => childPointer(pointer, key));
  const leafValues = entries
    .filter(([, child]) => !isContainer(child))
    .map(([key, child]) =>
      `${childPointer(pointer, key)}=${canonicalJson(child)}`);

  const claims: Candidate['claims'] = [
    {
      aspect: 'structural-path',
      value: pointer,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'json-pointer',
    },
    {
      aspect: 'node-type',
      value: Array.isArray(value) ? 'array' : 'object',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'json-container-type',
    },
    {
      aspect: 'children',
      value: childPointers,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'json-parent-child',
    },
    ...(leafValues.length > 0
      ? [{
          aspect: 'leaf-values',
          value: leafValues,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'json-scalar-child',
        }]
      : []),
  ];

  const candidate: Candidate = {
    kind: 'tree',
    locator: {
      source,
      sourceDigest,
      structuralPath: pointer,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: 'mmi.json-tree-adapter',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {
          format: 'json',
          objectKeyOrder: 'lexicographic',
        },
        implementationVersion: JSON_TREE_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'json-subtree-canonical-v1',
      canonicalJson(value),
    ),
    scores: [],
  };

  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(`invalid JSON Tree Candidate at ${pointer || '(root)'}: ${problem}`);
  }

  out.push({
    pointer,
    nodeType: Array.isArray(value) ? 'array' : 'object',
    childPointers,
    leafValues,
    candidate,
  });

  for (const [key, child] of entries) {
    if (isContainer(child)) {
      collectNodes(
        child,
        childPointer(pointer, key),
        source,
        sourceDigest,
        out,
      );
    }
  }
}

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error('JSON Tree strings must not contain unpaired UTF-16 surrogates');
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('JSON Tree strings must not contain unpaired UTF-16 surrogates');
    }
  }
}

function assertPortableJsonValue(value: JsonValue): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('JSON Tree numbers must be finite');
    }
    return;
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertPortableJsonValue);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertUnicodeScalarString(key);
      assertPortableJsonValue(child);
    }
  }
}

export function readJsonTree(
  text: string,
  source: string,
  sourceDigest: string,
): JsonTreeDocument {
  const value = JSON.parse(text) as JsonValue;
  assertPortableJsonValue(value);
  const nodes: JsonTreeNode[] = [];
  collectNodes(value, '', source, sourceDigest, nodes);
  return {
    value,
    nodes,
    candidates: nodes.map((node) => node.candidate),
  };
}

export function decodeJsonPointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new Error(`invalid JSON Pointer: ${pointer}`);
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/gu, '/').replace(/~0/gu, '~'));
}

export function resolveJsonPointer(
  value: JsonValue,
  pointer: string,
): JsonValue | undefined {
  let current: JsonValue = value;
  for (const token of decodeJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/u.test(token)) return undefined;
      const index = Number(token);
      if (index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (isObject(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;
      current = current[token];
      continue;
    }
    return undefined;
  }
  return current;
}

export function canonicalJsonValue(value: JsonValue): string {
  return canonicalJson(value);
}
