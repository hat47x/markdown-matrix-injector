import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  applyStructuredArtifactReferenceTarget,
  assertStructuredArtifactReferenceTarget,
  canonicalStructuredArtifactReferenceTargetJson,
  structuredArtifactReferenceTargetDigest,
  type StructuredArtifactReferenceTargetV0,
} from '../src/experimental/structuredArtifactNeutralTarget.js';
import {
  assertStructuredArtifactObservation,
  type StructuredArtifactObservationV0,
} from '../src/experimental/structuredArtifactNeutralObservation.js';

const SOURCE_PATH = new URL(
  './fixtures/structured-artifact-matched-source-v0.json',
  import.meta.url,
);
const OBSERVATION_PATH = new URL(
  './fixtures/structured-artifact-matched-mmi-observation-v0.json',
  import.meta.url,
);
const TARGET_PATH = new URL(
  './fixtures/structured-artifact-matched-target-v0.json',
  import.meta.url,
);

const EXPECTED_SOURCE_DIGEST =
  'sha256:4cc4ebf75a7001f256bb2eb269107cb3cdd390c9c1e05a008aee128450366fe1';
const EXPECTED_TARGET_DIGEST =
  'sha256:fa8ff32002328cb5aba7baa6990a1ea50d4abc226b5fd7328185fbca4bfb2646';

function loadObservation(): StructuredArtifactObservationV0 {
  return JSON.parse(
    readFileSync(OBSERVATION_PATH, 'utf8'),
  ) as StructuredArtifactObservationV0;
}

function loadTarget(): StructuredArtifactReferenceTargetV0 {
  return JSON.parse(
    readFileSync(TARGET_PATH, 'utf8'),
  ) as StructuredArtifactReferenceTargetV0;
}

test('binds the reference target to the exact frozen source bytes', () => {
  const source = readFileSync(SOURCE_PATH);
  const sourceDigest =
    'sha256:' + createHash('sha256')
      .update(source)
      .digest('hex');
  const target = loadTarget();

  assert.equal(sourceDigest, EXPECTED_SOURCE_DIGEST);
  assert.equal(
    target.source.source_digest,
    EXPECTED_SOURCE_DIGEST,
  );
  assert.doesNotThrow(
    () => assertStructuredArtifactReferenceTarget(target),
  );
  assert.equal(
    canonicalStructuredArtifactReferenceTargetJson(target),
    readFileSync(TARGET_PATH, 'utf8'),
  );
  assert.equal(
    structuredArtifactReferenceTargetDigest(target),
    EXPECTED_TARGET_DIGEST,
  );
});

test('projects only source-authored deterministic labels without mutating the producer observation', () => {
  const observation = loadObservation();
  const before = structuredClone(observation);
  const target = loadTarget();

  const projected =
    applyStructuredArtifactReferenceTarget(
      observation,
      target,
    );

  assert.deepEqual(observation, before);
  assert.deepEqual(observation.labels, {});
  assert.deepEqual(projected.labels, {
    'region.header_boundary': {
      value: 2,
      label_source: 'deterministic',
      labeler_or_rule_version:
        'sai-matched-source-authoring-v1',
      blind_to_candidate_model: true,
      confidence: null,
    },
    'region.table_like': {
      value: true,
      label_source: 'deterministic',
      labeler_or_rule_version:
        'sai-matched-source-authoring-v1',
      blind_to_candidate_model: true,
      confidence: null,
    },
  });
  assert.doesNotThrow(
    () => assertStructuredArtifactObservation(projected),
  );
});

test('fails closed when exact source identity does not match', () => {
  const target = loadTarget();

  for (const mutate of [
    (value: StructuredArtifactObservationV0) => {
      value.source.source_digest =
        'sha256:' + 'f'.repeat(64);
    },
    (value: StructuredArtifactObservationV0) => {
      value.source.source_family_id = 'other-family';
      value.split.group_keys.source_family =
        'other-family';
    },
    (value: StructuredArtifactObservationV0) => {
      value.source.sheet_or_entity_id = 'OtherSheet';
    },
    (value: StructuredArtifactObservationV0) => {
      value.split.group_keys.workbook_or_document =
        'other.synthetic';
    },
  ]) {
    const observation = loadObservation();
    mutate(observation);
    assert.throws(
      () => applyStructuredArtifactReferenceTarget(
        observation,
        target,
      ),
      /must match the observation/,
    );
  }
});

test('refuses non-synthetic observations and pre-existing labels', () => {
  const target = loadTarget();

  const nonSynthetic = loadObservation();
  nonSynthetic.source.synthetic = false;
  nonSynthetic.source.source_format = 'xlsx';
  assert.throws(
    () => applyStructuredArtifactReferenceTarget(
      nonSynthetic,
      target,
    ),
    /source.synthetic=true/,
  );

  const alreadyLabeled = loadObservation();
  alreadyLabeled.labels['region.table_like'] = {
    value: false,
    label_source: 'human_annotation',
    labeler_or_rule_version: 'independent-human-v1',
    blind_to_candidate_model: true,
    confidence: null,
  };
  assert.throws(
    () => applyStructuredArtifactReferenceTarget(
      alreadyLabeled,
      target,
    ),
    /refuses to overwrite or merge existing observation labels/,
  );
});

test('rejects product/model-derived authority or relaxed stop lines', () => {
  const teacher = structuredClone(loadTarget()) as any;
  teacher.labels['region.table_like'].label_source =
    'teacher_candidate';
  assert.throws(
    () => assertStructuredArtifactReferenceTarget(teacher),
    /label_source=deterministic/,
  );

  const notBlind = structuredClone(loadTarget()) as any;
  notBlind.labels['region.table_like']
    .blind_to_candidate_model = false;
  assert.throws(
    () => assertStructuredArtifactReferenceTarget(notBlind),
    /blind to the candidate model/,
  );

  const predictionDerived =
    structuredClone(loadTarget()) as any;
  predictionDerived.boundary
    .generated_from_product_prediction = true;
  assert.throws(
    () => assertStructuredArtifactReferenceTarget(
      predictionDerived,
    ),
    /no-product-prediction/,
  );

  const training = structuredClone(loadTarget()) as any;
  training.boundary.training_performed = true;
  assert.throws(
    () => assertStructuredArtifactReferenceTarget(training),
    /no-training/,
  );
});
