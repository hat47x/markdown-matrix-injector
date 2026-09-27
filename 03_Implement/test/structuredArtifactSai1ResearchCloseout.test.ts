import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const CLOSEOUT =
  'structured-artifact-sai1-research-closeout-v0.json';
const FINAL =
  'structured-artifact-sai1-final-holdout-result-v0.json';
const SELECTION =
  'structured-artifact-sai1-model-selection-result-v0.json';
const PREREG =
  'structured-artifact-sai1-preregistration-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-1 closeout binds the frozen winner and final result', () => {
  const closeout = readJson(CLOSEOUT);
  const finalResult = readJson(FINAL);
  const selection = readJson(SELECTION);

  assert.equal(
    selection.selection.winner.candidate_id,
    'rules-v0',
  );
  assert.equal(finalResult.winner.candidate_id, 'rules-v0');
  assert.equal(closeout.frozen_result.winner, 'rules-v0');
  assert.deepEqual(
    closeout.frozen_result.rule,
    finalResult.winner.rule,
  );
  assert.equal(
    closeout.frozen_result.final_holdout_balanced_accuracy,
    finalResult.metrics.balanced_accuracy,
  );
  assert.equal(
    closeout.frozen_result.final_holdout_accuracy,
    finalResult.metrics.accuracy,
  );
  assert.equal(
    closeout.frozen_result.final_holdout_group_count,
    finalResult.metrics.group_count,
  );
});

test('SAI-1 closeout records all preregistered groups as synthetic research evidence', () => {
  const closeout = readJson(CLOSEOUT);
  const prereg = readJson(PREREG);

  assert.equal(prereg.groups.length, 18);
  assert.deepEqual(closeout.evaluated_groups, {
    final_holdout: 4,
    fit: 10,
    model_selection: 4,
    source_class: 'synthetic_only',
    total: 18,
  });
  assert.equal(
    closeout.evaluated_groups.total,
    prereg.groups.length,
  );
});

test('SAI-1 closeout does not turn synthetic evaluation into runtime authority', () => {
  const closeout = readJson(CLOSEOUT);
  const finalResult = readJson(FINAL);

  assert.equal(
    finalResult.decision.sai_1_research_evaluation_complete,
    true,
  );
  assert.equal(
    finalResult.decision.product_runtime_admission_performed,
    false,
  );
  assert.deepEqual(closeout.decision, {
    product_runtime_admission_performed: false,
    sai_1_research_evaluation_complete: true,
    standalone_shared_repository_required: false,
    synthetic_result_may_not_be_promoted_to_runtime_authority:
      true,
  });
  assert.equal(
    closeout.next_gate.name,
    'real_source_external_validity_preregistration',
  );
  assert.equal(closeout.next_gate.model_refit_admitted, false);
  assert.equal(
    closeout.next_gate.product_runtime_admission_admitted,
    false,
  );
  assert.deepEqual(closeout.boundary, {
    candidate_addition_after_final_holdout: false,
    final_holdout_reuse_for_fit: false,
    final_holdout_reuse_for_selection: false,
    product_runtime_authority: false,
    threshold_change_after_final_holdout: false,
    winner_change_after_final_holdout: false,
  });
});
