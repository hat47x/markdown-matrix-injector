import { createHash } from 'node:crypto';

export const STRUCTURED_ARTIFACT_PROSPECTIVE_CORPUS_SCHEMA =
  'hat47x.structured-artifact-prospective-corpus/v0' as const;

export type StructuredArtifactProspectiveCorpusCaseV0 = {
  case_id: string;
  source_family_id: string;
  source_ref: string;
  target_ref: string;
  group_key: string;
  observation_generation: {
    target_independent: true;
    target_fields_not_supplied_to_adapter: true;
    excluded_portable_features: readonly string[];
  };
};

export type StructuredArtifactProspectiveCorpusV0 = {
  schema: typeof STRUCTURED_ARTIFACT_PROSPECTIVE_CORPUS_SCHEMA;
  corpus_id: string;
  phase: 'SAI-0E';
  target_labels: readonly [
    'region.header_boundary',
    'region.table_like',
  ];
  cases: readonly StructuredArtifactProspectiveCorpusCaseV0[];
  split_policy: {
    group_before_fit: true;
    same_source_cross_repo_same_group: true;
  };
  boundary: {
    training_performed: false;
    product_runtime_authority: false;
    winner_selection_performed: false;
  };
};

const LEAKAGE_SENSITIVE_HEADER_FEATURE =
  'role.header_candidate_signal';

export function assertStructuredArtifactProspectiveCorpus(
  value: unknown,
): asserts value is StructuredArtifactProspectiveCorpusV0 {
  const corpus = requireRecord(value, 'prospective corpus');
  assertExactKeys(corpus, [
    'schema',
    'corpus_id',
    'phase',
    'target_labels',
    'cases',
    'split_policy',
    'boundary',
  ], 'prospective corpus');

  if (corpus.schema !== STRUCTURED_ARTIFACT_PROSPECTIVE_CORPUS_SCHEMA) {
    throw new Error('Invalid prospective corpus schema.');
  }
  assertNonEmpty(corpus.corpus_id, 'corpus_id');
  if (corpus.phase !== 'SAI-0E') {
    throw new Error('Prospective corpus phase must be SAI-0E.');
  }

  assertExactStringArray(
    corpus.target_labels,
    ['region.header_boundary', 'region.table_like'],
    'target_labels',
  );

  if (!Array.isArray(corpus.cases) || corpus.cases.length < 3) {
    throw new Error(
      'Prospective corpus requires at least three preregistered cases.',
    );
  }

  const caseIds = new Set<string>();
  const familyIds = new Set<string>();
  for (const rawCase of corpus.cases) {
    const entry = requireRecord(rawCase, 'corpus case');
    assertExactKeys(entry, [
      'case_id',
      'source_family_id',
      'source_ref',
      'target_ref',
      'group_key',
      'observation_generation',
    ], 'corpus case');
    assertNonEmpty(entry.case_id, 'case_id');
    assertNonEmpty(entry.source_family_id, 'source_family_id');
    assertNonEmpty(entry.source_ref, 'source_ref');
    assertNonEmpty(entry.target_ref, 'target_ref');
    assertNonEmpty(entry.group_key, 'group_key');

    if (caseIds.has(entry.case_id as string)) {
      throw new Error('Duplicate prospective corpus case_id.');
    }
    if (familyIds.has(entry.source_family_id as string)) {
      throw new Error('Duplicate prospective corpus source_family_id.');
    }
    caseIds.add(entry.case_id as string);
    familyIds.add(entry.source_family_id as string);

    const generation = requireRecord(
      entry.observation_generation,
      'observation_generation',
    );
    assertExactKeys(generation, [
      'target_independent',
      'target_fields_not_supplied_to_adapter',
      'excluded_portable_features',
    ], 'observation_generation');
    if (
      generation.target_independent !== true
      || generation.target_fields_not_supplied_to_adapter !== true
    ) {
      throw new Error(
        'Prospective corpus observation generation must be target-independent.',
      );
    }
    if (!Array.isArray(generation.excluded_portable_features)) {
      throw new Error('excluded_portable_features must be an array.');
    }
    const excluded = generation.excluded_portable_features;
    if (
      !excluded.every((item) => typeof item === 'string')
      || !excluded.includes(LEAKAGE_SENSITIVE_HEADER_FEATURE)
    ) {
      throw new Error(
        'Header-boundary corpus must exclude role.header_candidate_signal from portable model features until target-independent cross-producer evidence exists.',
      );
    }
  }

  const splitPolicy = requireRecord(corpus.split_policy, 'split_policy');
  assertExactKeys(splitPolicy, [
    'group_before_fit',
    'same_source_cross_repo_same_group',
  ], 'split_policy');
  if (
    splitPolicy.group_before_fit !== true
    || splitPolicy.same_source_cross_repo_same_group !== true
  ) {
    throw new Error('Prospective corpus split policy must be leakage-safe.');
  }

  const boundary = requireRecord(corpus.boundary, 'boundary');
  assertExactKeys(boundary, [
    'training_performed',
    'product_runtime_authority',
    'winner_selection_performed',
  ], 'boundary');
  if (
    boundary.training_performed !== false
    || boundary.product_runtime_authority !== false
    || boundary.winner_selection_performed !== false
  ) {
    throw new Error(
      'SAI-0E corpus boundary forbids training, runtime authority, and winner selection.',
    );
  }
}

export function canonicalStructuredArtifactProspectiveCorpusJson(
  value: unknown,
): string {
  assertStructuredArtifactProspectiveCorpus(value);
  return JSON.stringify(canonicalize(value)) + '\n';
}

export function structuredArtifactProspectiveCorpusDigest(
  value: unknown,
): string {
  return 'sha256:' + createHash('sha256')
    .update(canonicalStructuredArtifactProspectiveCorpusJson(value))
    .digest('hex');
}

function assertExactStringArray(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (
    !Array.isArray(value)
    || value.length !== expected.length
    || !value.every((item, index) => item === expected[index])
  ) {
    throw new Error(label + ' must match the preregistered order.');
  }
}

function assertNonEmpty(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(label + ' must be a non-empty string.');
  }
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
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
      throw new Error('Unknown ' + label + ' field: ' + key + '.');
    }
  }
  for (const key of expected) {
    if (!(key in value)) {
      throw new Error('Missing ' + label + ' field: ' + key + '.');
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
