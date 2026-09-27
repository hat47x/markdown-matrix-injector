import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const SPEC = 'structured-artifact-sai1-candidate-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-1 candidate specification consumes one row per source family', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.training_row_contract, {
    unit: 'source_family_id',
    one_row_per_source_family: true,
    paired_producers_collapsed: true,
    canonical_feature_producer:
      'hat47x/markdown-matrix-injector',
    canonical_feature_use_requires_cross_producer_parity: true,
    target_source: 'frozen_reference_target',
    duplicate_producer_rows_forbidden: true,
  });
  assert.deepEqual(spec.input_contract.ordered_features, [
    'region.row_count',
    'region.col_count',
    'geometry.non_empty_ratio',
    'geometry.merged_cell_count',
    'role.body_candidate_signal',
  ]);
  assert.deepEqual(
    spec.input_contract.excluded_features,
    ['role.header_candidate_signal'],
  );
  assert.deepEqual(spec.input_contract.body_candidate_encoding, {
    absent: 0,
    present: 1,
  });
});

test('candidate identities and decision thresholds are frozen before fit', () => {
  const spec = readJson(SPEC);
  assert.deepEqual(
    spec.candidates.map(
      (candidate: any) => candidate.candidate_id,
    ),
    [
      'rules-v0',
      'logistic-l2-v0',
      'lightgbm-gbdt-v0',
    ],
  );

  const rules = spec.candidates[0];
  assert.equal(rules.fit_behavior, 'no_parameter_fit');
  assert.deepEqual(rules.rule, {
    positive_when: 'role.body_candidate_signal == present',
    otherwise: 'negative',
  });
  assert.equal(rules.decision_threshold, null);

  const logistic = spec.candidates[1];
  assert.equal(logistic.objective.l2_lambda, 1);
  assert.equal(
    logistic.optimizer.method,
    'deterministic_full_batch_newton',
  );
  assert.equal(logistic.decision_threshold, 0.5);
  assert.equal(logistic.positive_comparison, '>=');

  const lightgbm = spec.candidates[2];
  assert.deepEqual(lightgbm.implementation, {
    package: 'lightgbm',
    version: '4.6.0',
    api: 'train',
  });
  assert.equal(lightgbm.num_boost_round, 20);
  assert.equal(lightgbm.parameters.deterministic, true);
  assert.equal(lightgbm.parameters.num_threads, 1);
  assert.equal(lightgbm.parameters.seed, 0);
  assert.equal(lightgbm.decision_threshold, 0.5);
});

test('fit cannot tune thresholds or hyperparameters from selection data', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.fit_policy, {
    split: 'fit',
    fit_group_count: 10,
    model_selection_data_visible_during_fit: false,
    final_holdout_data_visible_during_fit: false,
    threshold_tuning_allowed: false,
    hyperparameter_search_allowed: false,
    candidate_addition_after_fit_forbidden: true,
  });
  assert.deepEqual(spec.selection_policy, {
    split: 'model_selection',
    group_count: 4,
    fit_on_selection_data: false,
    primary_metric: 'balanced_accuracy',
    secondary_metric: 'accuracy',
    metric_scope: 'source_family_groups',
    tie_break_order: [
      'rules-v0',
      'logistic-l2-v0',
      'lightgbm-gbdt-v0',
    ],
    winner_record_must_precede_final_holdout_open: true,
  });
});

test('final holdout remains single-open after winner freeze', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.final_holdout_policy, {
    split: 'final_holdout',
    group_count: 4,
    open_count: 1,
    open_only_after_winner_frozen: true,
    refit_after_open: false,
    threshold_change_after_open: false,
    winner_change_after_open: false,
  });
  assert.deepEqual(spec.boundary, {
    candidate_specification_frozen: true,
    model_fit_performed: false,
    threshold_tuning_performed: false,
    model_selection_split_materialized: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(spec.next_gate, {
    name:
      'model_selection_source_materialization_and_cross_producer_observation_capture',
    training_admitted: true,
    selection_scoring_admitted: false,
  });
});
