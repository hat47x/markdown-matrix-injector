import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA,
  assertNoStructuredArtifactSplitLeakage,
  assertStructuredArtifactObservation,
  canonicalStructuredArtifactObservationJson,
  structuredArtifactObservationDigest,
  type StructuredArtifactObservationV0,
} from '../src/experimental/structuredArtifactNeutralObservation.js';

function digest(fill: string): string {
  return 'sha256:' + fill.repeat(64);
}

function observation(
  id = 'mmi/fixture-a/sheet-1/table-1',
): StructuredArtifactObservationV0 {
  return {
    schema: STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA,
    observation_id: id,
    producer: {
      repository: 'hat47x/markdown-matrix-injector',
      producer_schema: 'mmi-worksheet-format-v6',
      producer_version_or_git_sha: 'fixture',
      adapter_version: 'sai-neutral-v0',
    },
    source: {
      source_digest: digest('a'),
      source_format: 'xlsx',
      source_family_id: 'fixture-family-a',
      sheet_or_entity_id: 'Sheet1',
      privacy_class: 'public',
      synthetic: false,
    },
    region: {
      coordinate_system: 'one_based_inclusive',
      row_start: 2,
      row_end: 5,
      col_start: 1,
      col_end: 3,
      row_count: 4,
      col_count: 3,
      parent_region_id: null,
      region_role_hint: 'table_candidate',
    },
    features: {
      'geometry.non_empty_ratio': {
        value: 0.83,
        kind: 'measured',
        method: 'mmi-fixture-density-v1',
        confidence: null,
      },
      'role.header_candidate_signal': {
        value: true,
        kind: 'categorical',
        method: 'mmi-header-candidate-v1',
        confidence: 0.9,
      },
    },
    labels: {},
    split: {
      split: 'train',
      group_keys: {
        source_family: 'fixture-family-a',
        workbook_or_document: 'fixture-a.xlsx',
        mutation_family: null,
      },
    },
    provenance: {
      source_observation_ref: 'fixture:worksheet-format:table-1',
      source_observation_digest: digest('b'),
      adapter_config_digest: digest('c'),
    },
  };
}

test('accepts a minimal neutral observation and serializes it deterministically', () => {
  const value = observation();

  assert.doesNotThrow(
    () => assertStructuredArtifactObservation(value),
  );

  const first =
    canonicalStructuredArtifactObservationJson(value);
  const reordered = {
    ...value,
    labels: value.labels,
    features: {
      'role.header_candidate_signal':
        value.features['role.header_candidate_signal'],
      'geometry.non_empty_ratio':
        value.features['geometry.non_empty_ratio'],
    },
  };

  assert.equal(
    canonicalStructuredArtifactObservationJson(reordered),
    first,
  );
  assert.match(
    structuredArtifactObservationDigest(value),
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test('rejects unknown product-runtime fields instead of silently extending the research contract', () => {
  const value =
    structuredClone(observation()) as unknown as Record<string, unknown>;
  value.mmiReviewRoute = 'inspect';

  assert.throws(
    () => assertStructuredArtifactObservation(value),
    /Unknown structured artifact observation field/,
  );
});

test('rejects invalid source identity and synthetic identity mismatches', () => {
  const badDigest = structuredClone(observation());
  badDigest.source.source_digest = 'not-a-digest';

  assert.throws(
    () => assertStructuredArtifactObservation(badDigest),
    /source_digest/,
  );

  const synthetic = structuredClone(observation());
  synthetic.source.source_format = 'synthetic';
  synthetic.source.synthetic = false;

  assert.throws(
    () => assertStructuredArtifactObservation(synthetic),
    /requires source.synthetic=true/,
  );
});

test('rejects boolean, NaN and infinity as numeric measured features', () => {
  for (const invalid of [
    true,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    const value = structuredClone(observation()) as any;
    value.features['geometry.non_empty_ratio'].value = invalid;

    assert.throws(
      () => assertStructuredArtifactObservation(value),
      /must be a finite number/,
    );
  }
});

test('preserves missing features instead of coercing them to zero', () => {
  const value = observation();
  delete value.features['geometry.non_empty_ratio'];

  assert.doesNotThrow(
    () => assertStructuredArtifactObservation(value),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      value.features,
      'geometry.non_empty_ratio',
    ),
    false,
  );
});

test('rejects unknown features and inconsistent inclusive region geometry', () => {
  const unknown = structuredClone(observation()) as any;
  unknown.features['mmi.review_route'] = {
    value: 1,
    kind: 'derived',
    method: 'bad',
    confidence: null,
  };

  assert.throws(
    () => assertStructuredArtifactObservation(unknown),
    /Unknown structured artifact feature/,
  );

  const badCount = structuredClone(observation());
  badCount.region.row_count = 3;

  assert.throws(
    () => assertStructuredArtifactObservation(badCount),
    /row_count does not match/,
  );
});

test('requires human and adjudicated labels to remain blind to the candidate model', () => {
  const value = observation();
  value.labels['region.table_like'] = {
    value: true,
    label_source: 'human_annotation',
    labeler_or_rule_version: 'human-protocol-v1',
    blind_to_candidate_model: false,
    confidence: 0.9,
  };

  assert.throws(
    () => assertStructuredArtifactObservation(value),
    /must be blind to the candidate model/,
  );

  value.labels['region.table_like']!
    .blind_to_candidate_model = true;

  assert.doesNotThrow(
    () => assertStructuredArtifactObservation(value),
  );
});

test('rejects source, workbook and mutation groups that cross train/valid/test', () => {
  const train = observation('train');
  const valid = structuredClone(train);
  valid.observation_id = 'valid';
  valid.split.split = 'valid';

  assert.throws(
    () => assertNoStructuredArtifactSplitLeakage([
      train,
      valid,
    ]),
    /split leakage/,
  );

  const other = observation('other');
  other.source.source_family_id = 'fixture-family-b';
  other.split = {
    split: 'valid',
    group_keys: {
      source_family: 'fixture-family-b',
      workbook_or_document: 'fixture-b.xlsx',
      mutation_family: 'mutation-b',
    },
  };

  assert.doesNotThrow(
    () => assertNoStructuredArtifactSplitLeakage([
      train,
      other,
    ]),
  );

  const mutatedTest = structuredClone(other);
  mutatedTest.observation_id = 'mutated-test';
  mutatedTest.source.source_family_id = 'fixture-family-c';
  mutatedTest.split = {
    split: 'test',
    group_keys: {
      source_family: 'fixture-family-c',
      workbook_or_document: 'fixture-c.xlsx',
      mutation_family: 'mutation-b',
    },
  };

  assert.throws(
    () => assertNoStructuredArtifactSplitLeakage([
      other,
      mutatedTest,
    ]),
    /mutation_family:mutation-b/,
  );
});

test('permits independent producers to retain divergent observations in the same split', () => {
  const mmi = observation('mmi');
  const normalizer = structuredClone(mmi);
  normalizer.observation_id = 'normalizer';
  normalizer.producer.repository =
    'hat47x/excel-houganshi-normalizer';
  normalizer.producer.producer_schema =
    'excel-normalizer-layout-v1';
  normalizer.features = {
    'geometry.border_closure': {
      value: 0.61,
      kind: 'derived',
      method: 'normalizer-border-closure-v1',
      confidence: null,
    },
  };

  assert.doesNotThrow(
    () => assertNoStructuredArtifactSplitLeakage([
      mmi,
      normalizer,
    ]),
  );
});

test('validation and canonical serialization do not mutate the source object', () => {
  const value = observation();
  const before = structuredClone(value);

  assertStructuredArtifactObservation(value);
  canonicalStructuredArtifactObservationJson(value);
  structuredArtifactObservationDigest(value);

  assert.deepEqual(value, before);
});
