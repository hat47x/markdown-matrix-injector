import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  structuredArtifactObservationDigest,
} from '../src/experimental/structuredArtifactNeutralObservation.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const RESULT =
  'structured-artifact-sai1-final-holdout-result-v0.json';
const WINNER =
  'structured-artifact-sai1-model-selection-result-v0.json';
const CAPTURE =
  'structured-artifact-sai1-final-holdout-mmi-observations-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('final evaluation applies only the frozen rules winner', () => {
  const result = readJson(RESULT);
  const winner = readJson(WINNER);

  assert.equal(
    winner.selection.winner.candidate_id,
    'rules-v0',
  );
  assert.equal(result.winner.candidate_id, 'rules-v0');
  assert.deepEqual(result.winner.rule, {
    positive_when:
      'role.body_candidate_signal == present',
    otherwise: 'negative',
  });
  assert.equal(
    result.winner.frozen_before_final_holdout_open,
    true,
  );
  assert.equal(result.winner.refit_after_open, false);
  assert.equal(
    result.winner.threshold_change_after_open,
    false,
  );
  assert.equal(
    result.winner.winner_change_after_open,
    false,
  );
});

test('final evaluation uses exactly the four parity-closed test observations', () => {
  const result = readJson(RESULT);
  const capture = readJson(CAPTURE);
  const captured = new Set(
    capture.cases.map(
      (entry: any) => entry.source_family_id,
    ),
  );

  assert.equal(result.cases.length, 4);
  assert.equal(captured.size, 4);

  for (const entry of result.cases) {
    assert.equal(
      captured.has(entry.source_family_id),
      true,
    );
    const observationName =
      entry.observation_ref.split('/').at(-1);
    const targetName =
      entry.target_ref.split('/').at(-1);
    assert.ok(observationName);
    assert.ok(targetName);

    const observation = readJson(observationName);
    const target = readJson(targetName);
    assert.equal(
      structuredArtifactObservationDigest(observation),
      entry.observation_digest,
    );
    assert.equal(observation.split.split, 'test');
    assert.equal(
      observation.features[
        'role.body_candidate_signal'
      ].value,
      entry.body_candidate_value,
    );
    assert.equal(
      target.labels['region.table_like'].value,
      entry.target,
    );

    const prediction =
      entry.body_candidate_value === 'present';
    assert.equal(entry.prediction, prediction);
    assert.equal(
      entry.correct,
      prediction === entry.target,
    );
  }
});

test('final holdout metrics reproduce as 2 TP / 2 TN', () => {
  const result = readJson(RESULT);
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const entry of result.cases) {
    if (entry.target && entry.prediction) tp += 1;
    if (!entry.target && !entry.prediction) tn += 1;
    if (!entry.target && entry.prediction) fp += 1;
    if (entry.target && !entry.prediction) fn += 1;
  }

  const balancedAccuracy =
    ((tp / (tp + fn)) + (tn / (tn + fp))) / 2;
  const accuracy =
    (tp + tn) / result.cases.length;

  assert.deepEqual(result.metrics, {
    accuracy,
    balanced_accuracy: balancedAccuracy,
    fn,
    fp,
    group_count: 4,
    tn,
    tp,
  });
  assert.equal(result.metrics.balanced_accuracy, 1);
  assert.equal(result.metrics.accuracy, 1);
});

test('final evaluation preserves the single-open and no-retuning boundaries', () => {
  const result = readJson(RESULT);

  assert.deepEqual(result.cross_producer_parity, {
    capture_id:
      'sai-1-final-holdout-cross-producer-observation-parity-v0',
    commit_sha:
      'fc60cc21d206c235dc04d0f397f9741cddf6fbb4',
    parity_group_count: 4,
    portable_semantic_parity: true,
    repository: 'hat47x/excel-houganshi-normalizer',
  });
  assert.deepEqual(result.boundary, {
    candidate_addition_performed: false,
    final_holdout_logical_open_count: 1,
    final_holdout_scoring_performed: true,
    model_refit_performed: false,
    product_runtime_authority: false,
    threshold_change_performed: false,
    winner_change_performed: false,
    winner_prediction_performed: true,
  });
  assert.deepEqual(result.decision, {
    product_runtime_admission_performed: false,
    sai_1_research_evaluation_complete: true,
    standalone_shared_repository_required: false,
  });
});
