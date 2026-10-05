import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
} from 'yaml';

import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
} from '../core/candidate.js';
import {
  canonicalJsonValue,
  type JsonValue,
} from './jsonTreeAdapter.js';

export const YAML_TREE_ADAPTER_VERSION = '1';

export interface YamlTreeNode {
  /** RFC 6901 JSON Pointer over the accepted JSON-compatible YAML data model. */
  pointer: string;
  nodeType: 'object' | 'array';
  childPointers: readonly string[];
  /** Immediate scalar children as `<pointer>=<canonical JSON value>`. */
  leafValues: readonly string[];
  candidate: Candidate;
}

export interface YamlTreeDocument {
  value: JsonValue;
  nodes: readonly YamlTreeNode[];
  candidates: readonly Candidate[];
}

function pointerToken(value: string): string {
  return value.replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function childPointer(parent: string, token: string): string {
  return `${parent}/${pointerToken(token)}`;
}

function scalarValue(value: unknown, where: string): JsonValue {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `YAML Tree numbers must be finite at ${where || '(root)'}`,
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  throw new Error(
    `YAML Tree scalar type is outside the JSON-compatible profile at ${where || '(root)'}`,
  );
}

function rejectNodeMetadata(
  node: { anchor?: string; tag?: string },
  where: string,
): void {
  if (node.anchor) {
    throw new Error(
      `YAML Tree anchors are not supported at ${where || '(root)'}`,
    );
  }
  if (node.tag) {
    throw new Error(
      `YAML Tree explicit tags are not supported at ${where || '(root)'}`,
    );
  }
}

function yamlNodeToJson(
  node: unknown,
  pointer: string,
): JsonValue {
  if (node === null || node === undefined) return null;
  if (isAlias(node)) {
    throw new Error(
      `YAML Tree aliases are not supported at ${pointer || '(root)'}`,
    );
  }
  if (isScalar(node)) {
    rejectNodeMetadata(node, pointer);
    return scalarValue(node.value, pointer);
  }
  if (isSeq(node)) {
    rejectNodeMetadata(node, pointer);
    return node.items.map((child, index) =>
      yamlNodeToJson(child, childPointer(pointer, String(index))));
  }
  if (isMap(node)) {
    rejectNodeMetadata(node, pointer);
    const record: { [key: string]: JsonValue } = Object.create(null);
    for (const pair of node.items) {
      const keyNode = pair.key;
      if (!isScalar(keyNode)) {
        throw new Error(
          `YAML Tree mapping keys must be scalar strings at ${pointer || '(root)'}`,
        );
      }
      rejectNodeMetadata(keyNode, pointer);
      if (typeof keyNode.value !== 'string') {
        throw new Error(
          `YAML Tree mapping keys must be strings at ${pointer || '(root)'}`,
        );
      }
      const key = keyNode.value;
      if (key === '<<') {
        throw new Error(
          `YAML Tree merge keys are not supported at ${pointer || '(root)'}`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        throw new Error(
          `YAML Tree mapping key is duplicated at ${childPointer(pointer, key)}`,
        );
      }
      record[key] = yamlNodeToJson(
        pair.value,
        childPointer(pointer, key),
      );
    }
    return record;
  }
  throw new Error(
    `YAML Tree node is outside the supported profile at ${pointer || '(root)'}`,
  );
}

function isObject(
  value: JsonValue,
): value is { [key: string]: JsonValue } {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value);
}

function isContainer(
  value: JsonValue,
): value is JsonValue[] | { [key: string]: JsonValue } {
  return Array.isArray(value) || isObject(value);
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
  out: YamlTreeNode[],
): void {
  if (!isContainer(value)) return;
  const entries = entriesOf(value);
  const childPointers = entries.map(([key]) =>
    childPointer(pointer, key));
  const leafValues = entries
    .filter(([, child]) => !isContainer(child))
    .map(([key, child]) =>
      `${childPointer(pointer, key)}=${canonicalJsonValue(child)}`);

  const claims: Candidate['claims'] = [
    {
      aspect: 'structural-path',
      value: pointer,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'yaml-json-pointer',
    },
    {
      aspect: 'node-type',
      value: Array.isArray(value) ? 'array' : 'object',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'yaml-json-compatible-container-type',
    },
    {
      aspect: 'children',
      value: childPointers,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'yaml-parent-child',
    },
    ...(leafValues.length > 0
      ? [{
          aspect: 'leaf-values',
          value: leafValues,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'yaml-scalar-child',
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
      algorithm: 'mmi.yaml-tree-adapter',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {
          format: 'yaml',
          profile: 'json-compatible-explicit-tree-v1',
          objectKeyOrder: 'lexicographic',
        },
        implementationVersion: YAML_TREE_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'yaml-json-compatible-subtree-v1',
      canonicalJsonValue(value),
    ),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(
      `invalid YAML Tree Candidate at ${pointer || '(root)'}: ${problem}`,
    );
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

export function readYamlTree(
  text: string,
  source: string,
  sourceDigest: string,
): YamlTreeDocument {
  const document = parseDocument(text, {
    version: '1.2',
    schema: 'core',
    merge: false,
    resolveKnownTags: false,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(
      `invalid YAML source: ${document.errors.map((error) => error.message).join(' / ')}`,
    );
  }
  if (document.warnings.length > 0) {
    throw new Error(
      `YAML source has unsupported warnings: ${document.warnings.map((warning) => warning.message).join(' / ')}`,
    );
  }
  if (document.directives.yaml.version !== '1.2') {
    throw new Error(
      `YAML Tree supports YAML 1.2 only, not ${document.directives.yaml.version}`,
    );
  }
  const customTagHandles = Object.keys(document.directives.tags)
    .filter((handle) => handle !== '!!');
  if (customTagHandles.length > 0) {
    throw new Error(
      `YAML Tree custom tag directives are not supported: ${customTagHandles.join(', ')}`,
    );
  }

  const value = yamlNodeToJson(document.contents, '');
  const nodes: YamlTreeNode[] = [];
  collectNodes(value, '', source, sourceDigest, nodes);
  return {
    value,
    nodes,
    candidates: nodes.map((node) => node.candidate),
  };
}
