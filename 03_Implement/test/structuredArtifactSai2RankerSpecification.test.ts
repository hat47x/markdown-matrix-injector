import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const SPEC = 'structured-artifact-sai2-ranker-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

test('SAI-2 ranker feature contract uses only the five portable candidate-local inputs', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.input_contract.ordered_features, [
    'region.row_count',
    'region.col_count',
    'geometry.non_empty_ratio',
    'geometry.merged_cell_count',
    'role.body_candidate_signal',
  ]);
  assert.equal(
    spec.input_contract.candidate_local_cross_producer_parity_required_before_fit,
    true,
  );
  assert.equal(
    spec.input_contract.excluded_inputs.includes('role.header_candidate_signal'),
    true,
  );
  for (const name of [
    'detector.header_confidence',
    'detector.title_present',
    'raw_cell_text',
    'title_text',
    'mmi_reference_expression',
    'sai1_prediction',
  ]) {
    assert.equal(spec.input_contract.excluded_inputs.includes(name), true);
  }
  assert.deepEqual(spec.input_contract.body_candidate_encoding, {
    absent: 0,
    present: 1,
  });
});

test('candidate labels are attached only after source-only features freeze', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.candidate_row_contract, {
    unit: 'source_family_id+candidate_ordinal',
    producer_rows_duplicated: false,
    canonical_feature_producer: 'hat47x/markdown-matrix-injector',
    canonical_feature_use_requires_candidate_local_cross_producer_parity: true,
    fit_candidate_row_count: 16,
    positive_label_definition:
      'clear_target group and candidate rectangle exactly equals frozen target range',
    negative_label_definition:
      'all other candidates including every candidate from abstain groups',
    target_fields_supplied_to_feature_extractor: false,
    labels_attached_only_after_source_only_features_are_frozen: true,
  });
});

test('rules logistic and LightGBM ranker candidates are frozen before fit', () => {
  const spec = readJson(SPEC);
  assert.deepEqual(
    spec.candidates.map((candidate: any) => candidate.candidate_id),
    ['rules-v0', 'logistic-l2-v0', 'lightgbm-gbdt-v0'],
  );

  const rules = spec.candidates[0];
  assert.equal(rules.fit_behavior, 'no_parameter_fit');
  assert.deepEqual(rules.candidate_score, {
    one_when:
      'role.body_candidate_signal == present AND region.row_count >= 2 AND region.col_count >= 2',
    otherwise: 0,
  });

  const logistic = spec.candidates[1];
  assert.equal(logistic.objective.l2_lambda, 1);
  assert.equal(logistic.optimizer.method, 'deterministic_full_batch_newton');
  assert.equal(logistic.sheet_decision, 'learned_proposal_rule');

  const lightgbm = spec.candidates[2];
  assert.deepEqual(lightgbm.implementation, {
    package: 'lightgbm',
    version: '4.6.0',
    api: 'train',
  });
  assert.equal(lightgbm.parameters.deterministic, true);
  assert.equal(lightgbm.parameters.num_threads, 1);
  assert.equal(lightgbm.num_boost_round, 20);
});

test('sheet proposal and abstention rules are frozen independently of selection data', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.sheet_decision_contract, {
    stable_candidate_order: 'candidate ordinal from sai2-occupancy-blocks-v0',
    learned_score_ranking:
      'score descending then stable candidate ordinal ascending',
    learned_proposal_threshold: 0.5,
    learned_top_tie_tolerance: 1e-12,
    learned_proposal_rule:
      'propose the unique top-scoring candidate only when its score >= 0.5 and no second candidate is within tie tolerance of the top score; otherwise abstain',
    rules_proposal_rule:
      'propose only when exactly one candidate has rules score 1; otherwise abstain',
  });
});

test('selection policy uses only preregistered effectiveness metrics with fixed tie-break', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.selection_policy.metric_order, [
    { metric: 'exact_range_recall_at_1', direction: 'descending' },
    { metric: 'false_proposal_rate_on_abstain', direction: 'ascending' },
    { metric: 'abstention_rate_on_clear_targets', direction: 'ascending' },
    {
      metric: 'mean_iou_non_abstained_clear_targets',
      direction: 'descending',
    },
    { metric: 'exact_range_recall_at_3', direction: 'descending' },
  ]);
  assert.deepEqual(spec.selection_policy.latency_metrics_descriptive_only, [
    'p50_latency_ms',
    'p95_latency_ms',
  ]);
  assert.deepEqual(spec.selection_policy.tie_break_order, [
    'rules-v0',
    'logistic-l2-v0',
    'lightgbm-gbdt-v0',
  ]);
  assert.equal(spec.fit_policy.threshold_tuning_allowed, false);
  assert.equal(spec.fit_policy.hyperparameter_search_allowed, false);
});

test('ranker spec freezes before feature capture and keeps selection and holdout closed', () => {
  const spec = readJson(SPEC);

  assert.deepEqual(spec.boundary, {
    ranker_specification_frozen: true,
    candidate_local_feature_capture_performed: false,
    candidate_local_cross_producer_parity_closed: false,
    ranker_fit_performed: false,
    model_selection_sources_materialized: false,
    selection_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(spec.next_gate, {
    name:
      'fit_candidate_local_portable_feature_capture_and_cross_producer_parity',
    training_admitted: false,
    model_selection_materialization_admitted: false,
    ranking_admitted: false,
  });
});
