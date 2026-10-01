import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const EVALUATION =
  'structured-artifact-sai2-final-holdout-evaluation-v0.json';
const DATASET =
  'structured-artifact-sai2-final-holdout-labeled-candidate-dataset-v0.json';
const WINNER =
  'structured-artifact-sai2-model-selection-winner-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('final holdout evaluation mirror binds exact frozen winner and dataset', () => {
  const evaluation = readJson(EVALUATION);
  const dataset = readJson(DATASET);
  const winner = readJson(WINNER);

  assert.equal(evaluation.winner_id, winner.winner_id);
  assert.equal(evaluation.winner_candidate_id, 'rules-v0');
  assert.deepEqual(evaluation.evaluated_candidate_ids, ['rules-v0']);
  assert.equal(evaluation.labeled_dataset_id, dataset.dataset_id);
  assert.equal(
    evaluation.labeled_dataset_git_blob_sha,
    '07fab820a70989df95bd775129919fc987f6ea1b',
  );
});

test('final sheet decisions reproduce the frozen rules proposal contract', () => {
  const evaluation = readJson(EVALUATION);
  const dataset = readJson(DATASET);
  const spec = readJson(SPEC);
  const byFamily = new Map<string, any[]>();

  assert.equal(
    spec.sheet_decision_contract.rules_proposal_rule,
    'propose only when exactly one candidate has rules score 1; otherwise abstain',
  );

  for (const row of dataset.rows) {
    const values = row.portable_values;
    const score = Number(
      values['role.body_candidate_signal'] === 'present'
      && values['region.row_count'] >= 2
      && values['region.col_count'] >= 2,
    );
    const list = byFamily.get(row.source_family_id) ?? [];
    list.push({ ...row, score });
    byFamily.set(row.source_family_id, list);
  }

  for (const decision of evaluation.sheet_decisions) {
    const rows = byFamily.get(decision.source_family_id) ?? [];
    const positives = rows.filter((row) => row.score === 1);
    assert.equal(
      decision.abstained,
      positives.length !== 1,
    );
    assert.equal(
      decision.proposed_ordinal,
      positives.length === 1 ? positives[0].candidate_ordinal : null,
    );
  }
});

test('single final evaluation passes all preregistered metrics without reopening', () => {
  const evaluation = readJson(EVALUATION);

  assert.deepEqual(evaluation.metrics, {
    exact_range_recall_at_1: 1,
    false_proposal_rate_on_abstain: 0,
    abstention_rate_on_clear_targets: 0,
    mean_iou_non_abstained_clear_targets: 1,
    exact_range_recall_at_3: 1,
  });
  assert.deepEqual(evaluation.boundary, {
    final_holdout_open_count: 1,
    frozen_winner_only_evaluated: true,
    non_winner_candidates_evaluated: false,
    ranker_refit_performed: false,
    threshold_change_performed: false,
    hyperparameter_search_performed: false,
    winner_change_performed: false,
    source_or_target_redesign_performed: false,
    final_holdout_evaluation_performed: true,
    final_holdout_evaluation_repeat_forbidden: true,
    product_runtime_authority: false,
  });
});
