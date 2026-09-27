import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V2 =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const CLOSURE =
  'structured-artifact-sai2-real-source-asset-identity-v2-closure-v0.json';
const PROTOCOL =
  'structured-artifact-sai2-real-source-primary-materialization-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('materialization protocol binds exact discovery and identity closures', () => {
  const protocol = j(PROTOCOL);

  assert.equal(
    protocol.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
  assert.equal(
    protocol.terms_closure_git_blob_sha,
    'f2601cab28b89ef5bf100dbc40fcdb048d602eea',
  );
  assert.equal(
    protocol.identity_closure_git_blob_sha,
    'f35659e8674d923174dac2de863e2b130bf2f236',
  );
});

test('initial materialization scope is exactly the sixteen frozen primaries', () => {
  const v2 = j(V2);
  const protocol = j(PROTOCOL);

  assert.equal(protocol.initial_scope.primary_count, 16);
  assert.equal(protocol.initial_scope.reserve_count, 8);
  assert.deepEqual(
    protocol.initial_scope.ordered_primary_source_ids,
    v2.primary_sources.map((x: any) => x.source_id),
  );
  assert.deepEqual(
    protocol.initial_scope.reserves,
    v2.reserve_sources.map((x: any) => ({
      source_id: x.source_id,
      requested_stratum: x.requested_stratum,
      reserve_rank: x.reserve_rank,
      publisher_id: x.publisher_id,
    })),
  );
  assert.equal(
    protocol.initial_scope.reserve_materialization,
    'only_after_a_frozen_replacement_reason_invokes_that_reserve',
  );
});

test('materialization may hash bytes but cannot inspect workbook semantics', () => {
  const protocol = j(PROTOCOL);

  assert.equal(
    protocol.acquisition_rules.semantic_workbook_inspection_during_materialization,
    false,
  );
  assert.deepEqual(protocol.acquisition_rules.binary_validation, [
    'payload_non_empty',
    'xlsx_or_zip_container_signature_consistent',
    'container_readable_without_semantic_worksheet_inspection',
  ]);
  assert.ok(protocol.acquisition_rules.record_on_success.includes('sha256'));
  assert.ok(protocol.acquisition_rules.record_on_success.includes('byte_size'));
  assert.equal(
    protocol.acquisition_rules.new_source_discovery_after_first_successful_primary_byte,
    false,
  );
});

test('replacement remains frozen/model-blind and exhaustion aborts the run', () => {
  const protocol = j(PROTOCOL);

  assert.equal(
    protocol.replacement_rules.candidate_ranker_metric_behavior_may_influence_replacement,
    false,
  );
  assert.equal(
    protocol.replacement_rules.reserve_exhaustion,
    'abort_current_sai2b_run_no_adaptive_source_discovery',
  );
  assert.deepEqual(protocol.primary_materialization_failure_reasons, [
    'frozen_identity_unresolvable_or_http_unavailable',
    'not_exactly_xlsx_or_bytes_unreadable',
    'duplicate_workbook_identity',
  ]);
  assert.deepEqual(protocol.blind_review_replacement_reasons, [
    'pii_or_confidential_content',
    'blind_target_authority_unresolved',
    'blind_target_review_stratum_mismatch',
  ]);
});

test('stage order freezes acquisition before blind target review and targets before candidates', () => {
  const protocol = j(PROTOCOL);

  assert.deepEqual(
    protocol.stage_order.map((x: any) => x.stage),
    [
      'A_primary_materialization',
      'B_materialization_manifest_freeze_and_cross_repo_mirror',
      'C_blind_workbook_and_target_review',
      'D_final_source_target_manifest_freeze_and_cross_repo_mirror',
    ],
  );
  assert.equal(
    protocol.leakage_controls.candidate_generator_code_or_output_visible_during_source_or_target_review,
    false,
  );
  assert.equal(
    protocol.leakage_controls.portable_feature_capture_before_final_target_manifest,
    false,
  );
  assert.equal(
    protocol.leakage_controls.metric_computation_before_final_target_manifest,
    false,
  );
});

test('protocol fixture itself still forbids source-byte opening until exact Excel mirror', () => {
  const protocol = j(PROTOCOL);
  const closure = j(CLOSURE);

  assert.equal(
    closure.boundary.all_current_v2_asset_identities_resolved,
    true,
  );
  assert.equal(protocol.current_boundary.source_bytes_opened, false);
  assert.equal(protocol.current_boundary.source_digests_computed, false);
  assert.equal(protocol.current_boundary.targets_authored, false);
  assert.equal(protocol.current_boundary.candidate_generation_performed, false);
  assert.deepEqual(protocol.next_gate, {
    name: 'merge_protocol_in_mmi_then_exact_excel_mirror',
    source_byte_open_admitted: false,
    after_exact_excel_mirror: 'stage_A_primary_materialization_only',
    workbook_semantic_inspection_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
