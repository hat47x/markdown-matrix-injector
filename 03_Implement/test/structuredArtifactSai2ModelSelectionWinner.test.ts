import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const WINNER =
  'structured-artifact-sai2-model-selection-winner-v0.json';
const SCORING =
  'structured-artifact-sai2-model-selection-scoring-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-2A winner binds exact frozen scoring and specification artifacts', () => {
  const winner = readJson(WINNER);
  const scoring = readJson(SCORING);
  const spec = readJson(SPEC);

  assert.equal(
    winner.scoring_id,
    scoring.scoring_id,
  );
  assert.equal(
    winner.scoring_git_blob_sha,
    '238f35f1ae87fb691cc545e81254325dd2d6ad63',
  );
  assert.equal(
    winner.ranker_specification_id,
    spec.specification_id,
  );
  assert.equal(
    winner.ranker_specification_git_blob_sha,
    '83641c3be4a60de892ee9e92e5fe669f33dd3611',
  );
  assert.deepEqual(
    winner.metric_order,
    spec.selection_policy.metric_order,
  );
  assert.deepEqual(
    winner.tie_break_order,
    spec.selection_policy.tie_break_order,
  );
});

test('all preregistered metrics tie before the fixed tie-break is applied', () => {
  const winner = readJson(WINNER);
  const scoring = readJson(SCORING);
  const candidateIds =
    winner.tie_break_order;

  const reference =
    scoring.metrics[candidateIds[0]];
  for (const candidateId of candidateIds) {
    assert.deepEqual(
      scoring.metrics[candidateId],
      reference,
    );
  }
  assert.deepEqual(
    new Set(winner.tied_candidates),
    new Set(candidateIds),
  );
  assert.equal(
    winner.winner.tied_on_all_preregistered_metrics,
    true,
  );
});

test('winner follows only the preregistered tie-break after the full metric tie', () => {
  const winner = readJson(WINNER);
  const scoring = readJson(SCORING);

  assert.equal(
    scoring.interpretation.all_preregistered_selection_metrics_tied,
    true,
  );
  assert.equal(
    scoring.interpretation.tie_break_required,
    true,
  );
  assert.equal(
    winner.winner.candidate_id,
    winner.tie_break_order[0],
  );
  assert.equal(
    winner.winner.candidate_id,
    'rules-v0',
  );
  assert.equal(
    winner.winner.selected_by,
    'preregistered_tie_break_order_after_full_metric_tie',
  );
  assert.deepEqual(
    winner.winner_metrics,
    scoring.metrics['rules-v0'],
  );
});

test('winner freeze precedes final holdout opening and forbids post-open changes', () => {
  const winner = readJson(WINNER);

  assert.deepEqual(winner.boundary, {
    scoring_artifact_changed: false,
    candidate_scores_recomputed: false,
    ranker_refit_performed: false,
    threshold_tuning_performed: false,
    hyperparameter_search_performed: false,
    winner_selection_performed: true,
    final_holdout_opened: false,
    final_holdout_scoring_performed: false,
    winner_change_after_holdout_forbidden: true,
    refit_after_holdout_forbidden: true,
    threshold_change_after_holdout_forbidden: true,
    product_runtime_authority: false,
  });
  assert.deepEqual(winner.next_gate, {
    name:
      'excel_exact_winner_record_mirror_then_final_holdout_semantic_freeze',
    winner_mirror_required_before_holdout_open: true,
    final_holdout_materialization_admitted: false,
    final_holdout_scoring_admitted: false,
  });
});
