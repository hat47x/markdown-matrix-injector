import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const SCORING =
  'structured-artifact-sai2-model-selection-scoring-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';
const DATASET =
  'structured-artifact-sai2-model-selection-labeled-candidate-dataset-v0.json';
const REPLAY =
  'structured-artifact-sai2-ranker-fit-post-contract-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('mirrored SAI-2A scoring stays bound to frozen fit and selection identities', () => {
  const scoring = readJson(SCORING);
  const dataset = readJson(DATASET);
  const replay = readJson(REPLAY);

  assert.equal(
    scoring.labeled_dataset_id,
    dataset.dataset_id,
  );
  assert.equal(
    scoring.canonical_fit_replay_id,
    replay.replay_id,
  );
  assert.equal(
    scoring.labeled_dataset_git_blob_sha,
    '55c80f6c0e3ab3246db97cdd6dc74f721d44cfcf',
  );
  assert.equal(
    scoring.canonical_fit_replay_git_blob_sha,
    '9e40ba94ef6ea6d9dca8f2b93ffa32cfe1d398fc',
  );
  assert.equal(
    scoring.lightgbm_reconstruction.identity_match,
    true,
  );
  assert.equal(
    scoring.lightgbm_reconstruction.selection_rows_used_for_fit,
    false,
  );
});

test('all frozen candidates tie on every preregistered model-selection metric', () => {
  const scoring = readJson(SCORING);
  const spec = readJson(SPEC);
  const expected = {
    exact_range_recall_at_1: 1,
    false_proposal_rate_on_abstain: 0,
    abstention_rate_on_clear_targets: 0,
    mean_iou_non_abstained_clear_targets: 1,
    exact_range_recall_at_3: 1,
  };

  assert.deepEqual(
    spec.selection_policy.tie_break_order,
    ['rules-v0', 'logistic-l2-v0', 'lightgbm-gbdt-v0'],
  );
  for (const candidateId of spec.selection_policy.tie_break_order) {
    assert.deepEqual(scoring.metrics[candidateId], expected);
  }
  assert.deepEqual(scoring.interpretation, {
    all_preregistered_selection_metrics_tied: true,
    tie_break_required: true,
    winner_not_selected_in_this_artifact: true,
  });
});

test('scoring mirror keeps winner and final holdout closed', () => {
  const scoring = readJson(SCORING);

  assert.deepEqual(scoring.boundary, {
    canonical_fit_parameters_changed: false,
    canonical_model_reconstruction_for_scoring: true,
    reconstruction_identity_verified: true,
    selection_rows_used_for_fit: false,
    threshold_tuning_performed: false,
    hyperparameter_search_performed: false,
    selection_scoring_performed: true,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(scoring.next_gate, {
    name:
      'freeze_model_selection_winner_using_preregistered_metric_order_and_tie_break',
    winner_selection_admitted: true,
    final_holdout_open_admitted: false,
  });
});
