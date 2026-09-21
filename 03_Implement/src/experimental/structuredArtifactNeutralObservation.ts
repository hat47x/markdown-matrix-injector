import { createHash } from 'node:crypto';

export const STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA =
  'hat47x.structured-artifact-observation/v0' as const;

export const STRUCTURED_ARTIFACT_FEATURE_NAMES = [
  'geometry.border_closure',
  'geometry.grid_alignment',
  'geometry.merge_ambiguity',
  'geometry.topology_consistency',
  'geometry.non_empty_ratio',
  'geometry.merged_cell_count',
  'pattern.repeated_row_signal',
  'pattern.repeated_column_signal',
  'role.header_candidate_signal',
  'role.body_candidate_signal',
] as const;

export const STRUCTURED_ARTIFACT_LABEL_NAMES = [
  'region.table_like',
  'region.header_boundary',
  'region.repeated_block',
  'region.hierarchy_relation',
  'region.ambiguous_or_non_table',
] as const;

export type StructuredArtifactFeatureName =
  typeof STRUCTURED_ARTIFACT_FEATURE_NAMES[number];

export type StructuredArtifactLabelName =
  typeof STRUCTURED_ARTIFACT_LABEL_NAMES[number];

export type StructuredArtifactFeatureV0 = {
  value: number | string | boolean | null;
  kind: 'measured' | 'derived' | 'categorical' | 'unknown';
  method: string;
  confidence: number | null;
};

export type StructuredArtifactLabelV0 = {
  value: number | string | boolean;
  label_source:
    | 'deterministic'
    | 'human_annotation'
    | 'adjudication'
    | 'teacher_candidate';
  labeler_or_rule_version: string;
  blind_to_candidate_model: boolean;
  confidence: number | null;
};

export type StructuredArtifactObservationV0 = {
  schema: typeof STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA;
  observation_id: string;
  producer: {
    repository: string;
    producer_schema: string;
    producer_version_or_git_sha: string;
    adapter_version: string;
  };
  source: {
    source_digest: string;
    source_format: 'xlsx' | 'csv' | 'tsv' | 'xml' | 'synthetic';
    source_family_id: string;
    sheet_or_entity_id: string;
    privacy_class: 'public' | 'internal' | 'restricted' | 'unknown';
    synthetic: boolean;
  };
  region: {
    coordinate_system: 'one_based_inclusive';
    row_start: number | null;
    row_end: number | null;
    col_start: number | null;
    col_end: number | null;
    row_count: number | null;
    col_count: number | null;
    parent_region_id: string | null;
    region_role_hint:
      | 'unknown'
      | 'sheet'
      | 'block'
      | 'table_candidate'
      | 'entity_candidate';
  };
  features: Partial<
    Record<StructuredArtifactFeatureName, StructuredArtifactFeatureV0>
  >;
  labels: Partial<
    Record<StructuredArtifactLabelName, StructuredArtifactLabelV0>
  >;
  split: {
    split: 'train' | 'valid' | 'test' | 'unassigned';
    group_keys: {
      source_family: string;
      workbook_or_document: string;
      mutation_family: string | null;
    };
  };
  provenance: {
    source_observation_ref: string;
    source_observation_digest: string;
    adapter_config_digest: string;
  };
};

const TOP_LEVEL_KEYS = [
  'schema',
  'observation_id',
  'producer',
  'source',
  'region',
  'features',
  'labels',
  'split',
  'provenance',
] as const;

const PRODUCER_KEYS = [
  'repository',
  'producer_schema',
  'producer_version_or_git_sha',
  'adapter_version',
] as const;

const SOURCE_KEYS = [
  'source_digest',
  'source_format',
  'source_family_id',
  'sheet_or_entity_id',
  'privacy_class',
  'synthetic',
] as const;

const REGION_KEYS = [
  'coordinate_system',
  'row_start',
  'row_end',
  'col_start',
  'col_end',
  'row_count',
  'col_count',
  'parent_region_id',
  'region_role_hint',
] as const;

const FEATURE_KEYS = [
  'value',
  'kind',
  'method',
  'confidence',
] as const;

const LABEL_KEYS = [
  'value',
  'label_source',
  'labeler_or_rule_version',
  'blind_to_candidate_model',
  'confidence',
] as const;

const SPLIT_KEYS = ['split', 'group_keys'] as const;
const GROUP_KEYS = [
  'source_family',
  'workbook_or_document',
  'mutation_family',
] as const;

const PROVENANCE_KEYS = [
  'source_observation_ref',
  'source_observation_digest',
  'adapter_config_digest',
] as const;

const SOURCE_FORMATS = new Set([
  'xlsx',
  'csv',
  'tsv',
  'xml',
  'synthetic',
]);

const PRIVACY_CLASSES = new Set([
  'public',
  'internal',
  'restricted',
  'unknown',
]);

const REGION_ROLE_HINTS = new Set([
  'unknown',
  'sheet',
  'block',
  'table_candidate',
  'entity_candidate',
]);

const FEATURE_KINDS = new Set([
  'measured',
  'derived',
  'categorical',
  'unknown',
]);

const LABEL_SOURCES = new Set([
  'deterministic',
  'human_annotation',
  'adjudication',
  'teacher_candidate',
]);

const SPLITS = new Set([
  'train',
  'valid',
  'test',
  'unassigned',
]);

const FEATURE_NAMES =
  new Set<string>(STRUCTURED_ARTIFACT_FEATURE_NAMES);
const LABEL_NAMES =
  new Set<string>(STRUCTURED_ARTIFACT_LABEL_NAMES);

export function assertStructuredArtifactObservation(
  value: unknown,
): asserts value is StructuredArtifactObservationV0 {
  const observation = requireRecord(
    value,
    'structured artifact observation',
  );
  assertExactKeys(
    observation,
    TOP_LEVEL_KEYS,
    'structured artifact observation',
  );

  if (
    observation.schema !==
    STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA
  ) {
    throw new Error(
      'Invalid structured artifact observation schema.',
    );
  }
  assertNonEmpty(
    observation.observation_id,
    'observation_id',
  );

  assertProducer(observation.producer);
  assertSource(observation.source);
  assertRegion(observation.region);
  assertFeatures(observation.features);
  assertLabels(observation.labels);
  assertSplit(observation.split);
  assertProvenance(observation.provenance);
}

export function assertNoStructuredArtifactSplitLeakage(
  values: readonly unknown[],
): void {
  const seen = new Map<string, string>();

  for (const value of values) {
    assertStructuredArtifactObservation(value);
    if (value.split.split === 'unassigned') {
      continue;
    }

    const groups = value.split.group_keys;
    for (const [kind, groupValue] of [
      ['source_family', groups.source_family],
      ['workbook_or_document', groups.workbook_or_document],
      ['mutation_family', groups.mutation_family],
    ] as const) {
      if (groupValue === null) {
        continue;
      }
      const key = kind + ':' + groupValue;
      const previous = seen.get(key);
      if (
        previous !== undefined
        && previous !== value.split.split
      ) {
        throw new Error(
          'Structured artifact split leakage for '
          + key
          + ': '
          + previous
          + ' vs '
          + value.split.split
          + '.',
        );
      }
      seen.set(key, value.split.split);
    }
  }
}

export function canonicalStructuredArtifactObservationJson(
  value: unknown,
): string {
  assertStructuredArtifactObservation(value);
  return JSON.stringify(canonicalize(value)) + '\n';
}

export function structuredArtifactObservationDigest(
  value: unknown,
): string {
  return 'sha256:' + createHash('sha256')
    .update(canonicalStructuredArtifactObservationJson(value))
    .digest('hex');
}

function assertProducer(value: unknown): void {
  const producer = requireRecord(value, 'producer');
  assertExactKeys(producer, PRODUCER_KEYS, 'producer');
  assertRepository(producer.repository);
  assertNonEmpty(producer.producer_schema, 'producer_schema');
  assertNonEmpty(
    producer.producer_version_or_git_sha,
    'producer_version_or_git_sha',
  );
  assertNonEmpty(producer.adapter_version, 'adapter_version');
}

function assertSource(value: unknown): void {
  const source = requireRecord(value, 'source');
  assertExactKeys(source, SOURCE_KEYS, 'source');
  assertDigest(source.source_digest, 'source_digest');

  if (
    typeof source.source_format !== 'string'
    || !SOURCE_FORMATS.has(source.source_format)
  ) {
    throw new Error('Invalid source_format.');
  }
  assertNonEmpty(source.source_family_id, 'source_family_id');
  assertNonEmpty(source.sheet_or_entity_id, 'sheet_or_entity_id');

  if (
    typeof source.privacy_class !== 'string'
    || !PRIVACY_CLASSES.has(source.privacy_class)
  ) {
    throw new Error('Invalid privacy_class.');
  }
  if (typeof source.synthetic !== 'boolean') {
    throw new Error('source.synthetic must be boolean.');
  }
  if (
    source.source_format === 'synthetic'
    && source.synthetic !== true
  ) {
    throw new Error(
      'Synthetic source_format requires source.synthetic=true.',
    );
  }
}

function assertRegion(value: unknown): void {
  const region = requireRecord(value, 'region');
  assertExactKeys(region, REGION_KEYS, 'region');

  if (region.coordinate_system !== 'one_based_inclusive') {
    throw new Error(
      'region.coordinate_system must be one_based_inclusive.',
    );
  }

  for (const key of [
    'row_start',
    'row_end',
    'col_start',
    'col_end',
  ] as const) {
    assertNullablePositiveInteger(region[key], 'region.' + key);
  }
  for (const key of [
    'row_count',
    'col_count',
  ] as const) {
    assertNullableNonNegativeInteger(
      region[key],
      'region.' + key,
    );
  }

  if (
    region.parent_region_id !== null
    && (
      typeof region.parent_region_id !== 'string'
      || region.parent_region_id.length === 0
    )
  ) {
    throw new Error(
      'region.parent_region_id must be null or a non-empty string.',
    );
  }

  if (
    typeof region.region_role_hint !== 'string'
    || !REGION_ROLE_HINTS.has(region.region_role_hint)
  ) {
    throw new Error('Invalid region.region_role_hint.');
  }

  assertAxisConsistency(
    'row',
    region.row_start,
    region.row_end,
    region.row_count,
  );
  assertAxisConsistency(
    'col',
    region.col_start,
    region.col_end,
    region.col_count,
  );
}

function assertFeatures(value: unknown): void {
  const features = requireRecord(value, 'features');
  for (const [name, rawFeature] of Object.entries(features)) {
    if (!FEATURE_NAMES.has(name)) {
      throw new Error(
        'Unknown structured artifact feature: ' + name + '.',
      );
    }

    const feature = requireRecord(
      rawFeature,
      'feature ' + name,
    );
    assertExactKeys(
      feature,
      FEATURE_KEYS,
      'feature ' + name,
    );

    if (
      typeof feature.kind !== 'string'
      || !FEATURE_KINDS.has(feature.kind)
    ) {
      throw new Error(
        'Invalid structured artifact feature kind: '
        + name
        + '.',
      );
    }
    assertNonEmpty(
      feature.method,
      'feature ' + name + '.method',
    );
    assertNullableProbability(
      feature.confidence,
      'feature ' + name + '.confidence',
    );

    if (
      feature.kind === 'measured'
      || feature.kind === 'derived'
    ) {
      assertFiniteNumber(
        feature.value,
        'feature ' + name + '.value',
      );
    } else if (feature.kind === 'categorical') {
      if (
        typeof feature.value !== 'string'
        && typeof feature.value !== 'boolean'
      ) {
        throw new Error(
          'Categorical feature '
          + name
          + ' must be string or boolean.',
        );
      }
    } else if (feature.value !== null) {
      throw new Error(
        'Unknown feature ' + name + ' must use value=null.',
      );
    }
  }
}

function assertLabels(value: unknown): void {
  const labels = requireRecord(value, 'labels');
  for (const [name, rawLabel] of Object.entries(labels)) {
    if (!LABEL_NAMES.has(name)) {
      throw new Error(
        'Unknown structured artifact label: ' + name + '.',
      );
    }

    const label = requireRecord(rawLabel, 'label ' + name);
    assertExactKeys(label, LABEL_KEYS, 'label ' + name);

    if (
      !isFiniteNumber(label.value)
      && typeof label.value !== 'string'
      && typeof label.value !== 'boolean'
    ) {
      throw new Error(
        'Invalid structured artifact label value: '
        + name
        + '.',
      );
    }

    if (
      typeof label.label_source !== 'string'
      || !LABEL_SOURCES.has(label.label_source)
    ) {
      throw new Error(
        'Invalid structured artifact label source: '
        + name
        + '.',
      );
    }

    assertNonEmpty(
      label.labeler_or_rule_version,
      'label ' + name + '.labeler_or_rule_version',
    );

    if (typeof label.blind_to_candidate_model !== 'boolean') {
      throw new Error(
        'label '
        + name
        + '.blind_to_candidate_model must be boolean.',
      );
    }

    if (
      (
        label.label_source === 'human_annotation'
        || label.label_source === 'adjudication'
      )
      && label.blind_to_candidate_model !== true
    ) {
      throw new Error(
        'Human/adjudicated label '
        + name
        + ' must be blind to the candidate model.',
      );
    }

    assertNullableProbability(
      label.confidence,
      'label ' + name + '.confidence',
    );
  }
}

function assertSplit(value: unknown): void {
  const split = requireRecord(value, 'split');
  assertExactKeys(split, SPLIT_KEYS, 'split');

  if (
    typeof split.split !== 'string'
    || !SPLITS.has(split.split)
  ) {
    throw new Error('Invalid structured artifact split.');
  }

  const groups = requireRecord(
    split.group_keys,
    'split.group_keys',
  );
  assertExactKeys(groups, GROUP_KEYS, 'split.group_keys');

  assertNonEmpty(
    groups.source_family,
    'split.group_keys.source_family',
  );
  assertNonEmpty(
    groups.workbook_or_document,
    'split.group_keys.workbook_or_document',
  );
  if (
    groups.mutation_family !== null
    && (
      typeof groups.mutation_family !== 'string'
      || groups.mutation_family.length === 0
    )
  ) {
    throw new Error(
      'split.group_keys.mutation_family must be null or a non-empty string.',
    );
  }
}

function assertProvenance(value: unknown): void {
  const provenance = requireRecord(value, 'provenance');
  assertExactKeys(
    provenance,
    PROVENANCE_KEYS,
    'provenance',
  );
  assertNonEmpty(
    provenance.source_observation_ref,
    'provenance.source_observation_ref',
  );
  assertDigest(
    provenance.source_observation_digest,
    'provenance.source_observation_digest',
  );
  assertDigest(
    provenance.adapter_config_digest,
    'provenance.adapter_config_digest',
  );
}

function assertAxisConsistency(
  axis: 'row' | 'col',
  start: unknown,
  end: unknown,
  count: unknown,
): void {
  const populated =
    start !== null || end !== null || count !== null;
  if (!populated) {
    return;
  }
  if (
    typeof start !== 'number'
    || typeof end !== 'number'
    || typeof count !== 'number'
  ) {
    throw new Error(
      'region '
      + axis
      + ' coordinates must be all null or all populated.',
    );
  }
  if (end < start) {
    throw new Error(
      'region '
      + axis
      + '_end must be >= '
      + axis
      + '_start.',
    );
  }
  if (count !== end - start + 1) {
    throw new Error(
      'region '
      + axis
      + '_count does not match one-based inclusive coordinates.',
    );
  }
}

function assertRepository(value: unknown): void {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)
  ) {
    throw new Error(
      'producer.repository must use owner/repository form.',
    );
  }
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

function assertNullablePositiveInteger(
  value: unknown,
  field: string,
): void {
  if (value === null) {
    return;
  }
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 1
  ) {
    throw new Error(
      field + ' must be null or a positive integer.',
    );
  }
}

function assertNullableNonNegativeInteger(
  value: unknown,
  field: string,
): void {
  if (value === null) {
    return;
  }
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new Error(
      field + ' must be null or a non-negative integer.',
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (!isFiniteNumber(value)) {
    throw new Error(field + ' must be a finite number.');
  }
}

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isFinite(value)
  );
}

function assertNullableProbability(
  value: unknown,
  field: string,
): void {
  if (value === null) {
    return;
  }
  if (
    !isFiniteNumber(value)
    || value < 0
    || value > 1
  ) {
    throw new Error(
      field
      + ' must be null or a finite number in [0,1].',
    );
  }
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
          left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          canonicalize(entry),
        ]),
    );
  }
  return value;
}
