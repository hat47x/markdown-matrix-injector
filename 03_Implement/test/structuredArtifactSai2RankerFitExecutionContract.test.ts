import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const CONTRACT =
  'structured-artifact-sai2-ranker-fit-execution-contract-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';
const DATASET =
  'structured-artifact-sai2-fit-labeled-candidate-dataset-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-2A fit execution contract binds the frozen spec and labeled dataset', () => {
  const contract = readJson(CONTRACT);
  const spec = readJson(SPEC);
  const dataset = readJson(DATASET);

  assert.equal(
    contract.ranker_specification_id,
    spec.specification_id,
  );
  assert.equal(
    contract.labeled_fit_dataset.dataset_id,
    dataset.dataset_id,
  );
  assert.equal(
    contract.labeled_fit_dataset.git_blob_sha,
    'a7f755e499a3e66781d31dbb39118bb14266ca35',
  );
  assert.deepEqual(
    contract.common_input.ordered_features,
    spec.input_contract.ordered_features,
  );
  assert.deepEqual(
    contract.common_input.body_candidate_encoding,
    spec.input_contract.body_candidate_encoding,
  );
  assert.equal(dataset.rows.length, 16);
  assert.equal(
    dataset.rows.filter((row: any) => row.label === 1).length,
    6,
  );
});

test('logistic numerical convention is frozen before first fit', () => {
  const contract = readJson(CONTRACT);
  const logistic =
    contract.candidates['logistic-l2-v0'];

  assert.deepEqual(logistic, {
    data_term_reduction: 'sum',
    l2_penalty:
      '0.5 * lambda * sum(non_intercept_coefficient^2)',
    intercept_regularized: false,
    gradient:
      'X^T * (p - y) + lambda * beta_regularized_with_zero_intercept',
    hessian:
      'X^T * diag(p*(1-p)) * X + lambda * diag(0,1,...,1)',
    newton_solve: 'H * delta = gradient',
    update: 'theta = theta - delta',
    convergence: 'max_abs(delta) <= 1e-10',
    max_iterations: 100,
    initial_coefficients: 'all_zero',
  });
});

test('execution clarification changes no frozen candidate or hyperparameter', () => {
  const contract = readJson(CONTRACT);
  const spec = readJson(SPEC);

  assert.deepEqual(
    Object.keys(contract.candidates),
    spec.candidates.map((candidate: any) => candidate.candidate_id),
  );
  assert.equal(
    contract.candidates['lightgbm-gbdt-v0'].version,
    spec.candidates.find(
      (candidate: any) =>
        candidate.candidate_id === 'lightgbm-gbdt-v0',
    ).implementation.version,
  );
  assert.deepEqual(contract.boundary, {
    ranker_candidate_set_changed: false,
    feature_set_changed: false,
    labels_changed: false,
    thresholds_changed: false,
    hyperparameters_changed: false,
    ranker_fit_performed: false,
    model_selection_sources_materialized: false,
    selection_scoring_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(contract.next_gate, {
    name:
      'excel_exact_execution_contract_mirror_then_first_ranker_fit',
    exact_mirror_required_before_fit: true,
    training_admitted: false,
    model_selection_materialization_admitted: false,
  });
});
