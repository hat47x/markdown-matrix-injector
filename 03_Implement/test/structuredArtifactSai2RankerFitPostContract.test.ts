import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const REPLAY =
  'structured-artifact-sai2-ranker-fit-post-contract-v0.json';
const CONTRACT =
  'structured-artifact-sai2-ranker-fit-execution-contract-v0.json';
const DATASET =
  'structured-artifact-sai2-fit-labeled-candidate-dataset-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('canonical post-contract replay is bound to frozen MMI inputs', () => {
  const replay = readJson(REPLAY);
  const contract = readJson(CONTRACT);
  const dataset = readJson(DATASET);

  assert.equal(
    replay.execution_contract_id,
    contract.contract_id,
  );
  assert.equal(
    replay.execution_contract_git_blob_sha,
    '9fa42403b4ba3e1b3b67954c17469f92810794c3',
  );
  assert.equal(
    replay.labeled_dataset_id,
    dataset.dataset_id,
  );
  assert.equal(
    replay.labeled_dataset_git_blob_sha,
    'a7f755e499a3e66781d31dbb39118bb14266ca35',
  );
  assert.equal(
    replay.replay_execution.candidate_row_count,
    dataset.aggregate.candidate_row_count,
  );
});

test('chronology repair changes provenance only, not fitted identities', () => {
  const replay = readJson(REPLAY);

  assert.deepEqual(replay.comparison_to_prior_fit, {
    dataset_identity_equal: true,
    candidate_set_equal: true,
    logistic_standardization_equal: true,
    logistic_parameters_equal: true,
    logistic_objective_equal: true,
    logistic_iterations_equal: true,
    lightgbm_model_text_sha256_equal: true,
    all_fit_identities_equal: true,
  });
  assert.equal(
    replay.replay_execution.candidates['logistic-l2-v0']
      .final_objective,
    4.76922712791972,
  );
  assert.equal(
    replay.replay_execution.candidates['lightgbm-gbdt-v0']
      .model_text_sha256,
    'sha256:e3a69f4ef14376a128794f08ae761f5311452c62afe4283b7688efdbac7ca3ce',
  );
  assert.equal(
    replay.prior_fit.provenance_status,
    'superseded_by_post_contract_replay',
  );
});

test('MMI mirror closes fit provenance but leaves selection and holdout closed', () => {
  const replay = readJson(REPLAY);

  assert.deepEqual(replay.boundary, {
    execution_contract_mirrored_before_replay: true,
    candidate_changed: false,
    feature_changed: false,
    label_changed: false,
    threshold_changed: false,
    hyperparameter_changed: false,
    model_selection_sources_materialized: false,
    selection_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(replay.next_gate, {
    name:
      'mirror_canonical_post_contract_fit_to_mmi_then_materialize_model_selection_sources',
    canonical_fit_mirror_required: true,
    model_selection_materialization_admitted: false,
    selection_scoring_admitted: false,
    final_holdout_open_admitted: false,
  });
});
