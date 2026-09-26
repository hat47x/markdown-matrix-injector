import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG = 'structured-artifact-sai1-preregistration-v0.json';
const DESIGN = 'structured-artifact-prospective-corpus-v0.json';
const HOLDOUT = 'structured-artifact-holdout-corpus-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

test('SAI-1 preregistration uses only unconsumed source families', () => {
  const prereg = readJson(PREREG);
  const design = readJson(DESIGN);
  const holdout = readJson(HOLDOUT);
  const consumed = new Set([
    ...design.cases.map((entry: any) => entry.source_family_id),
    ...holdout.cases.map((entry: any) => entry.source_family_id),
  ]);
  const planned = prereg.groups.map((entry: any) => entry.source_family_id);

  assert.equal(planned.length, 18);
  assert.equal(new Set(planned).size, 18);
  for (const id of planned) {
    assert.match(id, /^sai-f2-/);
    assert.equal(consumed.has(id), false);
  }
  assert.equal(prereg.consumed_data_exclusions.fit_eligible, false);
});

test('group split is frozen, disjoint, balanced, and producer-safe', () => {
  const prereg = readJson(PREREG);
  const expected = { fit: 10, model_selection: 4, final_holdout: 4 };

  for (const [split, count] of Object.entries(expected)) {
    const groups = prereg.groups.filter((entry: any) => entry.split === split);
    assert.equal(groups.length, count);
    assert.equal(groups.filter((entry: any) => entry.target_value === true).length, count / 2);
    assert.equal(groups.filter((entry: any) => entry.target_value === false).length, count / 2);
    assert.equal(groups.every((entry: any) => entry.materialized === false), true);
  }

  assert.deepEqual(prereg.split_policy, {
    group_key: 'source_family_id',
    same_source_cross_repo_same_group: true,
    cross_producer_pairing_required: true,
    assignment_frozen_before_materialization: true,
    fit_group_count: 10,
    model_selection_group_count: 4,
    final_holdout_group_count: 4,
    final_holdout_locked_until_model_selected: true,
    final_holdout_open_count: 1,
  });
});

test('SAI-1 remains pre-fit and excludes the nonportable header signal', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.portable_inputs, [
    'region.row_count',
    'region.col_count',
    'geometry.non_empty_ratio',
    'geometry.merged_cell_count',
    'role.body_candidate_signal',
  ]);
  assert.deepEqual(prereg.excluded_inputs, ['role.header_candidate_signal']);
  assert.deepEqual(prereg.model_comparison.candidates, [
    'rules',
    'logistic',
    'lightgbm',
  ]);
  assert.equal(prereg.model_comparison.final_holdout_used_for_selection, false);
  assert.deepEqual(prereg.boundary, {
    source_materialization_performed: false,
    observations_generated: false,
    model_fit_performed: false,
    threshold_tuning_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(prereg.next_gate, {
    name: 'independent_source_materialization_and_cross_producer_observation_capture',
    training_admitted: false,
    requires_byte_frozen_preregistration: true,
  });
});
