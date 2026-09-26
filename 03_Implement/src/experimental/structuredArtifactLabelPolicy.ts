import { createHash } from 'node:crypto';

export const STRUCTURED_ARTIFACT_LABEL_POLICY_SCHEMA =
  'hat47x.structured-artifact-label-policy/v0' as const;
export const STRUCTURED_ARTIFACT_HOLDOUT_CORPUS_SCHEMA =
  'hat47x.structured-artifact-holdout-corpus/v0' as const;

const EXPECTED_POLICY_ID = 'sai-0f-table-like-semantics-v0';
const EXPECTED_LEGACY_EXCLUSION = 'sai-h2-non-table-kv-pairs-v0';
const LEAKAGE_SENSITIVE_HEADER_FEATURE = 'role.header_candidate_signal';

export function assertStructuredArtifactLabelPolicy(
  value: unknown,
): void {
  const policy = requireRecord(value, 'label policy');
  assertExactKeys(policy, [
    'schema',
    'policy_id',
    'phase',
    'target_label',
    'ambiguity_label',
    'statuses',
    'legacy_design_exclusions',
    'boundary',
  ], 'label policy');

  if (policy.schema !== STRUCTURED_ARTIFACT_LABEL_POLICY_SCHEMA) {
    throw new Error('Invalid structured artifact label policy schema.');
  }
  if (policy.policy_id !== EXPECTED_POLICY_ID || policy.phase !== 'SAI-0F') {
    throw new Error('Label policy identity must remain frozen for SAI-0F.');
  }
  if (
    policy.target_label !== 'region.table_like'
    || policy.ambiguity_label !== 'region.ambiguous_or_non_table'
  ) {
    throw new Error('Label policy must bind the preregistered neutral labels.');
  }

  const statuses = requireRecord(policy.statuses, 'statuses');
  assertExactKeys(statuses, [
    'clear_positive',
    'clear_negative',
    'ambiguous',
  ], 'statuses');
  assertStatus(
    statuses.clear_positive,
    'true',
    'omit',
    'clear_positive',
  );
  assertStatus(
    statuses.clear_negative,
    'false',
    'true',
    'clear_negative',
  );
  assertStatus(
    statuses.ambiguous,
    'omit',
    'true',
    'ambiguous',
  );

  if (
    !Array.isArray(policy.legacy_design_exclusions)
    || policy.legacy_design_exclusions.length !== 1
    || policy.legacy_design_exclusions[0] !== EXPECTED_LEGACY_EXCLUSION
  ) {
    throw new Error(
      'SAI-0F must preserve the historical KV target but exclude it from future table_like fitting.',
    );
  }

  const boundary = requireRecord(policy.boundary, 'boundary');
  assertExactKeys(boundary, [
    'historical_targets_rewritten',
    'training_performed',
    'feature_scoring_performed',
    'product_runtime_authority',
  ], 'boundary');
  if (
    boundary.historical_targets_rewritten !== false
    || boundary.training_performed !== false
    || boundary.feature_scoring_performed !== false
    || boundary.product_runtime_authority !== false
  ) {
    throw new Error(
      'SAI-0F label policy forbids target rewriting, scoring, training, and runtime authority.',
    );
  }
}

export function assertStructuredArtifactHoldoutCorpus(
  value: unknown,
): void {
  const corpus = requireRecord(value, 'holdout corpus');
  assertExactKeys(corpus, [
    'schema',
    'corpus_id',
    'phase',
    'label_policy_ref',
    'cases',
    'boundary',
  ], 'holdout corpus');

  if (corpus.schema !== STRUCTURED_ARTIFACT_HOLDOUT_CORPUS_SCHEMA) {
    throw new Error('Invalid structured artifact holdout corpus schema.');
  }
  if (
    corpus.corpus_id !== 'sai-0f-table-like-holdout-v0'
    || corpus.phase !== 'SAI-0F'
  ) {
    throw new Error('Holdout corpus identity must remain frozen for SAI-0F.');
  }
  if (
    corpus.label_policy_ref !==
    '03_Implement/test/fixtures/structured-artifact-label-policy-v0.json'
  ) {
    throw new Error('Holdout corpus must bind the frozen label policy.');
  }

  if (!Array.isArray(corpus.cases) || corpus.cases.length !== 8) {
    throw new Error('SAI-0F holdout corpus requires exactly eight cases.');
  }

  const caseIds = new Set<string>();
  const familyIds = new Set<string>();
  const counts = new Map<string, number>([
    ['clear_positive', 0],
    ['clear_negative', 0],
    ['ambiguous', 0],
  ]);

  for (const rawCase of corpus.cases) {
    const entry = requireRecord(rawCase, 'holdout case');
    assertExactKeys(entry, [
      'case_id',
      'source_family_id',
      'source_ref',
      'target_ref',
      'group_key',
      'label_status',
      'observation_generation',
    ], 'holdout case');

    for (const key of [
      'case_id',
      'source_family_id',
      'source_ref',
      'target_ref',
      'group_key',
    ] as const) {
      assertNonEmpty(entry[key], key);
    }
    if (caseIds.has(entry.case_id as string)) {
      throw new Error('Duplicate SAI-0F holdout case_id.');
    }
    if (familyIds.has(entry.source_family_id as string)) {
      throw new Error('Duplicate SAI-0F source_family_id.');
    }
    caseIds.add(entry.case_id as string);
    familyIds.add(entry.source_family_id as string);

    if (
      entry.group_key !== entry.source_family_id
    ) {
      throw new Error('Holdout group_key must equal source_family_id.');
    }
    if (
      typeof entry.label_status !== 'string'
      || !counts.has(entry.label_status)
    ) {
      throw new Error('Invalid SAI-0F label_status.');
    }
    counts.set(
      entry.label_status,
      (counts.get(entry.label_status) ?? 0) + 1,
    );

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
      throw new Error('SAI-0F observation generation must be target-independent.');
    }
    if (
      !Array.isArray(generation.excluded_portable_features)
      || generation.excluded_portable_features.length !== 1
      || generation.excluded_portable_features[0]
        !== LEAKAGE_SENSITIVE_HEADER_FEATURE
    ) {
      throw new Error(
        'SAI-0F holdout must retain the header-candidate exclusion.',
      );
    }
  }

  if (
    counts.get('clear_positive') !== 3
    || counts.get('clear_negative') !== 3
    || counts.get('ambiguous') !== 2
  ) {
    throw new Error('SAI-0F holdout must remain 3 positive / 3 negative / 2 ambiguous.');
  }

  const boundary = requireRecord(corpus.boundary, 'boundary');
  assertExactKeys(boundary, [
    'observations_generated',
    'feature_scoring_performed',
    'training_performed',
    'split_assignment_performed',
    'product_runtime_authority',
  ], 'boundary');
  if (Object.values(boundary).some((entry) => entry !== false)) {
    throw new Error(
      'SAI-0F holdout must be frozen before observations, scoring, splitting, training, or runtime use.',
    );
  }
}

export function canonicalStructuredArtifactLabelPolicyJson(
  value: unknown,
): string {
  assertStructuredArtifactLabelPolicy(value);
  return JSON.stringify(canonicalize(value)) + '\n';
}

export function structuredArtifactLabelPolicyDigest(
  value: unknown,
): string {
  return 'sha256:' + createHash('sha256')
    .update(canonicalStructuredArtifactLabelPolicyJson(value))
    .digest('hex');
}

export function canonicalStructuredArtifactHoldoutCorpusJson(
  value: unknown,
): string {
  assertStructuredArtifactHoldoutCorpus(value);
  return JSON.stringify(canonicalize(value)) + '\n';
}

export function structuredArtifactHoldoutCorpusDigest(
  value: unknown,
): string {
  return 'sha256:' + createHash('sha256')
    .update(canonicalStructuredArtifactHoldoutCorpusJson(value))
    .digest('hex');
}

function assertStatus(
  value: unknown,
  tableLikeRequirement: 'true' | 'false' | 'omit',
  ambiguityRequirement: 'true' | 'omit',
  label: string,
): void {
  const status = requireRecord(value, label);
  assertExactKeys(status, [
    'table_like_requirement',
    'ambiguity_requirement',
  ], label);
  if (
    status.table_like_requirement !== tableLikeRequirement
    || status.ambiguity_requirement !== ambiguityRequirement
  ) {
    throw new Error('Invalid SAI-0F label status: ' + label + '.');
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
