import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
} from 'yaml';

import {
  readStructuredValueTree,
  type JsonTreeDocument,
  type JsonValue,
  type StructuredTreeSemantics,
} from './jsonTreeAdapter.js';

export const YAML_TREE_ADAPTER_VERSION = '2';

export type YamlTreeDocument = JsonTreeDocument;

const YAML_TREE_SEMANTICS: StructuredTreeSemantics = {
  algorithm: 'mmi.yaml-tree-adapter',
  implementationVersion: YAML_TREE_ADAPTER_VERSION,
  format: 'yaml',
  fingerprintRepresentation: 'yaml-json-compatible-subtree-v1',
  structuralPathReasonCode: 'yaml-json-pointer',
  nodeTypeReasonCode: 'yaml-json-compatible-container-type',
  childrenReasonCode: 'yaml-parent-child',
  scalarChildReasonCode: 'yaml-scalar-child',
  provenanceConfig: {
    format: 'yaml',
    profile: 'json-compatible-explicit-tree-v1',
    objectKeyOrder: 'lexicographic',
  },
};

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
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error(
        `YAML Tree integers must be within the JavaScript safe-integer range at ${where || '(root)'}`,
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
  return readStructuredValueTree(
    value,
    source,
    sourceDigest,
    YAML_TREE_SEMANTICS,
  );
}
