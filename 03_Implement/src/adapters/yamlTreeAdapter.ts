import { parseAllDocuments } from 'yaml';

import {
  assertPortableJsonValue,
  readStructuredValueTree,
  type JsonTreeDocument,
  type JsonValue,
  type StructuredTreeSemantics,
} from './jsonTreeAdapter.js';

export const YAML_TREE_ADAPTER_VERSION = '1';

const YAML_TREE_SEMANTICS: StructuredTreeSemantics = {
  algorithm: 'mmi.yaml-tree-adapter',
  implementationVersion: YAML_TREE_ADAPTER_VERSION,
  format: 'yaml',
  fingerprintRepresentation: 'yaml-subtree-canonical-v1',
  structuralPathReasonCode: 'yaml-json-pointer',
  nodeTypeReasonCode: 'yaml-container-type',
  childrenReasonCode: 'yaml-parent-child',
  scalarChildReasonCode: 'yaml-scalar-child',
  provenanceConfig: {
    format: 'yaml',
    yamlVersion: '1.2',
    schema: 'core-json-compatible-subset',
    aliases: 'disabled',
    mergeKeys: 'disabled',
    mappingKeys: 'string-only',
    objectKeyOrder: 'lexicographic',
  },
};

export function decodeYamlUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('YAML source must be valid UTF-8');
  }
}

export function readYamlTree(
  text: string,
  source: string,
  sourceDigest: string,
): JsonTreeDocument {
  const documents = parseAllDocuments(text, {
    version: '1.2',
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
    merge: false,
    resolveKnownTags: false,
    logLevel: 'error',
  });

  if (documents.length !== 1) {
    throw new Error(
      `YAML Tree source must contain exactly one document; got ${documents.length}`,
    );
  }

  const document = documents[0];
  if (document.errors.length > 0) {
    throw new Error(
      `YAML Tree source is invalid: ${document.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  if (document.warnings.length > 0) {
    throw new Error(
      `YAML Tree source uses unsupported YAML features: ${document.warnings
        .map((warning) => warning.message)
        .join('; ')}`,
    );
  }

  if (
    document.directives.yaml.explicit
    && document.directives.yaml.version !== '1.2'
  ) {
    throw new Error(
      `YAML Tree source must use YAML 1.2; got ${document.directives.yaml.version}`,
    );
  }

  let value: unknown;
  try {
    value = document.toJS({
      mapAsMap: false,
      maxAliasCount: 0,
    });
  } catch (error) {
    throw new Error(
      `YAML Tree source uses unsupported aliases or values: ${error instanceof Error
        ? error.message
        : String(error)}`,
    );
  }

  assertPortableJsonValue(value);
  rejectMergeLikeKeys(value);

  return readStructuredValueTree(
    value as JsonValue,
    source,
    sourceDigest,
    YAML_TREE_SEMANTICS,
  );
}

function rejectMergeLikeKeys(value: JsonValue): void {
  if (Array.isArray(value)) {
    value.forEach(rejectMergeLikeKeys);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === '<<') {
      throw new Error(
        'YAML Tree source must not use the << merge key; expand the mapping explicitly',
      );
    }
    rejectMergeLikeKeys(child);
  }
}
