import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG =
  'structured-artifact-sai2-real-source-external-validity-preregistration-v0.json';
const CLOSEOUT =
  'structured-artifact-sai2-research-closeout-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-2B real-source preregistration starts from frozen SAI-2A closeout', () => {
  const prereg = readJson(PREREG);
  const closeout = readJson(CLOSEOUT);

  assert.equal(
    prereg.upstream.sai2_closeout_id,
    closeout.closeout_id,
  );
  assert.equal(
    prereg.upstream.sai2_closeout_git_blob_sha,
    '86b9700448a12a49715178593e7bf5269f92fff8',
  );
  assert.equal(prereg.upstream.frozen_winner_candidate_id, 'rules-v0');
  assert.equal(
    prereg.upstream.candidate_generator_id,
    'sai2-occupancy-blocks-v0',
  );
  assert.equal(
    prereg.upstream.sai1_real_source_gate_remains_separate,
    true,
  );
});

test('real-source challenge set is prospectively fixed at 16 independent workbook groups', () => {
  const prereg = readJson(PREREG);
  const acquisition = prereg.source_acquisition;

  assert.equal(acquisition.artifact_kind, 'xlsx');
  assert.equal(acquisition.source_family_group_count, 16);
  assert.equal(acquisition.one_sheet_per_workbook, true);
  assert.equal(acquisition.unique_workbook_per_group, true);
  assert.equal(acquisition.minimum_independent_publishers, 4);
  assert.equal(acquisition.maximum_groups_per_publisher, 4);
  assert.equal(acquisition.public_non_confidential_only, true);
  assert.equal(acquisition.redistribution_required, true);
  assert.equal(acquisition.pii_or_confidential_material_allowed, false);
  assert.equal(acquisition.synthetic_or_generated_sources_allowed, false);
  assert.equal(acquisition.consumed_sai_synthetic_sources_allowed, false);
  assert.deepEqual(
    acquisition.strata.map((item: any) => [
      item.stratum_id,
      item.group_count,
      item.target_mode,
    ]),
    [
      ['clear_single_primary_table', 4, 'clear_target'],
      ['clear_primary_with_context', 4, 'clear_target'],
      ['ambiguous_peer_regions', 4, 'abstain'],
      ['non_tabular_or_form', 4, 'abstain'],
    ],
  );
  assert.equal(
    acquisition.strata.reduce(
      (sum: number, item: any) => sum + item.group_count,
      0,
    ),
    16,
  );
});

test('targets are frozen blind to generator/features/winner before scoring', () => {
  const prereg = readJson(PREREG);
  const target = prereg.target_authority;

  assert.equal(target.review_before_candidate_generation, true);
  assert.equal(target.reviewer_blind_to_candidate_rectangles, true);
  assert.equal(target.reviewer_blind_to_portable_features, true);
  assert.equal(target.reviewer_blind_to_winner_output, true);
  assert.deepEqual(target.allowed_abstain_reasons, [
    'multiple_peer_candidates',
    'non_tabular',
  ]);
  assert.equal(
    target.unresolved_authority_policy,
    'fail_closed_replace_before_candidate_generation_with_recorded_reason',
  );
});

test('external-validity pass criteria are frozen before any source discovery', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.pass_criteria, {
    exact_source_target_identity_parity: {
      numerator_required: 16,
      denominator: 16,
    },
    candidate_rectangle_order_parity: {
      numerator_required: 16,
      denominator: 16,
    },
    portable_candidate_local_feature_parity_rate_min: 1,
    clear_target_generator_ood_max_count: 0,
    total_generator_ood_max_count: 2,
    exact_range_recall_at_1_clear_min_count: 7,
    exact_range_recall_at_1_clear_denominator: 8,
    exact_range_recall_at_3_clear_required_count: 8,
    exact_range_recall_at_3_clear_denominator: 8,
    false_confident_proposal_on_abstain_max_count: 0,
    false_confident_proposal_on_abstain_denominator: 8,
    clear_target_abstention_max_count: 1,
    clear_target_abstention_denominator: 8,
    mean_iou_non_abstained_clear_min: 0.95,
    protocol_violation_max_count: 0,
  });
});

test('preregistration opens only exact Excel mirror, not source discovery or scoring', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.boundary, {
    source_discovery_performed: false,
    source_bytes_opened: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
    standalone_shared_repository_created: false,
  });
  assert.deepEqual(prereg.next_gate, {
    name:
      'excel_exact_preregistration_mirror_then_real_source_discovery',
    source_discovery_admitted: false,
    real_source_materialization_admitted: false,
    scoring_admitted: false,
  });
  assert.equal(
    prereg.admission_interpretation.pass_grants_product_runtime_authority,
    false,
  );
  assert.equal(
    prereg.admission_interpretation.failure_allows_tuning_on_evaluation_set,
    false,
  );
});
