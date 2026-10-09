import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE = new URL(
  './fixtures/structured-artifact-sai2-product-value-preregistration-v0.json',
  import.meta.url,
);

function readPreregistration(): any {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

test('product-value pilot does not reopen consumed SAI-2A holdout', () => {
  const prereg = readPreregistration();

  assert.equal(prereg.status, 'preregistered_before_product_value_fixture_open');
  assert.equal(prereg.upstream.existing_sai2a_final_holdout_reused, false);
  assert.equal(prereg.product_value_fixture_split.existing_sai2a_fit_selection_holdout_groups_forbidden, true);
  assert.equal(prereg.boundary.final_holdout_reopen, false);
  assert.equal(prereg.boundary.threshold_tuning_after_open, false);
  assert.equal(prereg.boundary.target_redesign_after_open, false);
});

test('pilot targets common SIer worksheet families and binds source identity', () => {
  const prereg = readPreregistration();

  assert.deepEqual(prereg.product_value_fixture_split.fixture_families, [
    'requirements-list',
    'permission-matrix',
    'interface-list',
    'screen-field-list',
    'test-case-list',
  ]);
  assert.equal(prereg.product_value_fixture_split.minimum_source_family_groups, 15);
  assert.equal(prereg.product_value_fixture_split.minimum_groups_per_fixture_family, 3);
  assert.deepEqual(prereg.product_value_fixture_split.source_binding_required, [
    'source_family_id',
    'source_digest',
  ]);
  assert.equal(prereg.product_value_fixture_split.raw_cell_text_required, false);
});

test('pilot compares the simplest no-ranking baseline before adding learned complexity', () => {
  const prereg = readPreregistration();

  assert.deepEqual(
    prereg.methods.map((method: any) => method.method_id),
    ['first-candidate-v0', 'rules-v0'],
  );
  assert.equal(prereg.methods.every((method: any) => method.parameter_fit === false), true);
  assert.equal(prereg.promotion_rule.runtime_promotion_performed, false);
  assert.match(
    prereg.promotion_rule.learned_method_admission,
    /material advantage over the simpler deterministic winner/,
  );
});

test('metric order keeps safety and omission ahead of convenience proxies', () => {
  const prereg = readPreregistration();
  assert.deepEqual(
    prereg.metric_order.map((entry: any) => entry.metric),
    [
      'false_proposal_rate_on_abstain',
      'abstention_rate_on_clear_targets',
      'exact_range_recall_at_1',
      'mean_under_selected_cell_count',
      'mean_boundary_edit_distance',
      'mean_over_selected_cell_count',
      'mean_context_expansion_ratio',
    ],
  );
  assert.equal(prereg.boundary.source_read_only, true);
  assert.equal(prereg.boundary.product_runtime_authority, false);
  assert.equal(
    prereg.human_value_followup.geometric_proxy_must_not_be_reported_as_human_time_saving,
    true,
  );
});
