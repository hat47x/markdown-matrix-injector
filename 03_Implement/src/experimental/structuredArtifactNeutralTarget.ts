import { createHash } from 'node:crypto';
import {
  STRUCTURED_ARTIFACT_LABEL_NAMES,
  assertStructuredArtifactObservation,
  type StructuredArtifactLabelName,
  type StructuredArtifactLabelV0,
  type StructuredArtifactObservationV0,
} from './structuredArtifactNeutralObservation.js';

export const STRUCTURED_ARTIFACT_REFERENCE_TARGET_SCHEMA =
  'hat47x.structured-artifact-reference-target/v0' as const;

export type StructuredArtifactReferenceTargetV0 = {
  schema: typeof STRUCTURED_ARTIFACT_REFERENCE_TARGET_SCHEMA;
  target_id: string;
  source: {
    source_digest: string;
    source_family_id: string;
    sheet_or_entity_id: string;
    workbook_or_document: string;
  };
  labels: Partial<
    Record<StructuredArtifactLabelName, StructuredArtifactLabelV0>
  >;
  provenance: {
    authority: 'synthetic_fixture_contract';
    target_version: string;
    source_ref: string;
  };
  boundary: {
    applies_only_to_exact_source_digest: true;
    product_runtime_authority: false;
    generated_from_product_prediction: false;
    training_performed: false;
  };
};

const TOP_LEVEL_KEYS = [
  'schema',
  'target_id',
  'source',
  'labels',
  'provenance',
  'boundary',
] as const;

const SOURCE_KEYS = [
  'source_digest',
  'source_family_id',
  'sheet_or_entity_id',
  'workbook_or_document',
] as const;

const LABEL_KEYS = [
  'value',
  'label_source',
  'labeler_or_rule_version',
  'blind_to_candidate_model',
  'confidence',
] as const;

const PROVENANCE_KEYS = [
  'authority',
  'target_version',
  'source_ref',
] as const;

const BOUNDARY_KEYS = [
  'applies_only_to_exact_source_digest',
  'product_runtime_authority',
  'generated_from_product_prediction',
  'training_performed',
] as const;

const LABEL_NAMES = new Set<string>(
  STRUCTURED_ARTIFACT_LABEL_NAMES,
);

export function assertStructuredArtifactReferenceTarget(
  value: unknown,
): asserts value is StructuredArtifactReferenceTargetV0 {
  const target = requireRecord(
    value,
    'structured artifact reference target',
  );
  assertExactKeys(
    target,
    TOP_LEVEL_KEYS,
    'structured artifact reference target',
  );

  if (
    target.schema
      !== STRUCTURED_ARTIFACT_REFERENCE_TARGET_SCHEMA
  ) {
    throw new Error(
      'Invalid structured artifact reference target schema.',
    );
  }
  assertNonEmpty(target.target_id, 'target_id');

  const source = requireRecord(target.source, 'source');
  assertExactKeys(source, SOURCE_KEYS, 'source');
  assertDigest(source.source_digest, 'source.source_digest');
  assertNonEmpty(
    source.source_family_id,
    'source.source_family_id',
  );
  assertNonEmpty(
    source.sheet_or_entity_id,
    'source.sheet_or_entity_id',
  );
  assertNonEmpty(
    source.workbook_or_document,
    'source.workbook_or_document',
  );

  const labels = requireRecord(target.labels, 'labels');
  if (Object.keys(labels).length === 0) {
    throw new Error(
      'Structured artifact reference target requires at least one label.',
    );
  }

  for (const [name, rawLabel] of Object.entries(labels)) {
    if (!LABEL_NAMES.has(name)) {
      throw new Error(
        'Unknown structured artifact reference target label: '
          + name
          + '.',
      );
    }
    const label = requireRecord(
      rawLabel,
      'reference target label ' + name,
    );
    assertExactKeys(
      label,
      LABEL_KEYS,
      'reference target label ' + name,
    );

    if (
      !isFiniteNumber(label.value)
      && typeof label.value !== 'string'
      && typeof label.value !== 'boolean'
    ) {
      throw new Error(
        'Invalid structured artifact reference target label value: '
          + name
          + '.',
      );
    }
    if (label.label_source !== 'deterministic') {
      throw new Error(
        'Synthetic fixture reference target labels must use label_source=deterministic.',
      );
    }
    assertNonEmpty(
      label.labeler_or_rule_version,
      'reference target label '
        + name
        + '.labeler_or_rule_version',
    );
    if (label.blind_to_candidate_model !== true) {
      throw new Error(
        'Synthetic fixture reference target labels must be blind to the candidate model.',
      );
    }
    if (label.confidence !== null) {
      throw new Error(
        'Synthetic fixture reference target labels must not claim confidence.',
      );
    }
  }

  const provenance = requireRecord(
    target.provenance,
    'provenance',
  );
  assertExactKeys(
    provenance,
    PROVENANCE_KEYS,
    'provenance',
  );
  if (
    provenance.authority !== 'synthetic_fixture_contract'
  ) {
    throw new Error(
      'Reference target provenance.authority must be synthetic_fixture_contract.',
    );
  }
  assertNonEmpty(
    provenance.target_version,
    'provenance.target_version',
  );
  assertNonEmpty(
    provenance.source_ref,
    'provenance.source_ref',
  );

  const boundary = requireRecord(
    target.boundary,
    'boundary',
  );
  assertExactKeys(boundary, BOUNDARY_KEYS, 'boundary');
  if (
    boundary.applies_only_to_exact_source_digest !== true
    || boundary.product_runtime_authority !== false
    || boundary.generated_from_product_prediction !== false
    || boundary.training_performed !== false
  ) {
    throw new Error(
      'Structured artifact reference target boundary must remain exact-source/no-authority/no-product-prediction/no-training.',
    );
  }
}

export function applyStructuredArtifactReferenceTarget(
  observation: StructuredArtifactObservationV0,
  target: StructuredArtifactReferenceTargetV0,
): StructuredArtifactObservationV0 {
  assertStructuredArtifactObservation(observation);
  assertStructuredArtifactReferenceTarget(target);

  if (observation.source.synthetic !== true) {
    throw new Error(
      'Synthetic fixture reference target may only be applied to source.synthetic=true observations.',
    );
  }

  const identityPairs: ReadonlyArray<
    readonly [string, string, string]
  > = [
    [
      'source_digest',
      observation.source.source_digest,
      target.source.source_digest,
    ],
    [
      'source_family_id',
      observation.source.source_family_id,
      target.source.source_family_id,
    ],
    [
      'sheet_or_entity_id',
      observation.source.sheet_or_entity_id,
      target.source.sheet_or_entity_id,
    ],
    [
      'workbook_or_document',
      observation.split.group_keys.workbook_or_document,
      target.source.workbook_or_document,
    ],
  ];

  for (const [field, observed, expected] of identityPairs) {
    if (observed !== expected) {
      throw new Error(
        'Structured artifact reference target '
          + field
          + ' must match the observation.',
      );
    }
  }

  if (Object.keys(observation.labels).length !== 0) {
    throw new Error(
      'Structured artifact reference target refuses to overwrite or merge existing observation labels.',
    );
  }

  const projected = structuredClone(observation);
  projected.labels = structuredClone(target.labels);
  assertStructuredArtifactObservation(projected);
  return projected;
}

export function canonicalStructuredArtifactReferenceTargetJson(
  value: unknown,
): string {
  assertStructuredArtifactReferenceTarget(value);
  return JSON.stringify(canonicalize(value)) + '\n';
}

export function structuredArtifactReferenceTargetDigest(
  value: unknown,
): string {
  return 'sha256:' + createHash('sha256')
    .update(
      canonicalStructuredArtifactReferenceTargetJson(value),
    )
    .digest('hex');
}

function assertDigest(
  value: unknown,
  field: string,
): void {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      field
        + ' must be a lowercase sha256:<64 hex> digest.',
    );
  }
}

function assertNonEmpty(
  value: unknown,
  field: string,
): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      field + ' must be a non-empty string.',
    );
  }
}

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isFinite(value)
  );
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(label + ' must be an object.');
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      throw new Error(
        'Unknown ' + label + ' field: ' + key + '.',
      );
    }
  }
  for (const key of expected) {
    if (!(key in value)) {
      throw new Error(
        'Missing ' + label + ' field: ' + key + '.',
      );
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (
    value !== null
    && typeof value === 'object'
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      )
        .sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [
          key,
          canonicalize(entry),
        ]),
    );
  }
  return value;
}
