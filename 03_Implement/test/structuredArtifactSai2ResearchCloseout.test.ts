import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const CLOSEOUT =
  'structured-artifact-sai2-research-closeout-v0.json';
const EVALUATION =
  'structured-artifact-sai2-final-holdout-evaluation-v0.json';
const WINNER =
  'structured-artifact-sai2-model-selection-winner-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('SAI-2A synthetic research closeout binds the frozen winner and final evaluation', () => {
  const closeout = j(CLOSEOUT);
  const evaluation = j(EVALUATION);
  const winner = j(WINNER);

  assert.equal(
    closeout.frozen_result.winner,
    winner.winner.candidate_id,
  );
  assert.equal(closeout.frozen_result.winner, 'rules-v0');
  assert.deepEqual(
    closeout.frozen_result.final_holdout_metrics,
    evaluation.metrics,
  );
  assert.equal(
    closeout.evidence.final_holdout_evaluation_git_blob,
    'c8af3165377cec8cae88c4c977b626a4139a251c',
  );
});

test('SAI-2A closeout accounts for all consumed synthetic groups and candidate rows', () => {
  const closeout = j(CLOSEOUT);

  assert.deepEqual(closeout.evaluated_groups, {
    fit: 10,
    model_selection: 4,
    final_holdout: 4,
    total: 18,
    source_class: 'synthetic_only',
  });
  assert.deepEqual(closeout.evaluated_candidate_rows, {
    fit: 16,
    model_selection: 8,
    final_holdout: 7,
    total: 31,
  });
});

test('synthetic closeout cannot promote runtime authority or reopen holdout', () => {
  const closeout = j(CLOSEOUT);

  assert.deepEqual(closeout.decision, {
    sai_2a_research_evaluation_complete: true,
    product_runtime_admission_performed: false,
    synthetic_result_may_not_be_promoted_to_runtime_authority: true,
    sai_2a_does_not_satisfy_sai_1_real_source_runtime_gate: true,
    standalone_shared_repository_required: false,
  });
  assert.equal(closeout.boundary.final_holdout_open_count, 1);
  assert.equal(
    closeout.boundary.additional_final_holdout_evaluation,
    false,
  );
  assert.equal(closeout.boundary.product_runtime_authority, false);
  assert.equal(
    closeout.next_gate.name,
    'real_source_external_validity_preregistration',
  );
  assert.equal(
    closeout.next_gate.product_runtime_admission_admitted,
    false,
  );
});
