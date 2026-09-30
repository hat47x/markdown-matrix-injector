import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const RECOVERY =
  'structured-artifact-sai2-mmi-only-ordinal-1-payload-recovery-evidence-v0.json';
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v4.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('recovery evidence is bound to authoritative MMI-only attempt-003 state', () => {
  const evidence = j(RECOVERY);
  const freeze = j(FREEZE);

  assert.equal(
    evidence.authority.continuation_freeze_git_blob_sha,
    '4432d7829425b9739b8502753c57437dc385483a',
  );
  assert.equal(
    evidence.authority.authoritative_progress_snapshot_git_blob_sha,
    freeze.authority.authoritative_progress_snapshot_git_blob_sha,
  );
  assert.equal(
    evidence.authority.authoritative_progress_snapshot_id,
    'sai-2b-real-source-primary-materialization-run-01-attempt-003',
  );
  assert.equal(evidence.authority.frozen_ordinal, 1);
  assert.equal(evidence.authority.frozen_source_id, 'sai2b-primary-ons-x01');
});

test('fresh server-side import confirms source reachability but not byte identity', () => {
  const evidence = j(RECOVERY);
  const observation = evidence.refreshed_transport_observation;

  assert.equal(observation.import_status, 'uploaded');
  assert.equal(observation.reported_filename, 'x01sep2026.xlsx');
  assert.equal(
    observation.reported_content_type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.equal(observation.reported_content_length, 422304);
  assert.equal(observation.exact_frozen_request_url_supplied, true);
  assert.equal(observation.verifier_readable_raw_bytes_returned, false);
  assert.equal(observation.frozen_receipt_schema_artifact_returned, false);
  assert.equal(observation.locally_recomputed_sha256_available, false);

  assert.equal(
    evidence.evidence_limits.content_length_and_mime_do_not_establish_exact_byte_identity,
    true,
  );
  assert.equal(
    evidence.evidence_limits.external_upload_success_does_not_advance_stage_a_authority,
    true,
  );
  assert.equal(
    evidence.evidence_limits.connector_specific_object_identifiers_persisted,
    false,
  );
});

test('transport recovery observation cannot classify source failure or advance ordinal order', () => {
  const evidence = j(RECOVERY);

  assert.deepEqual(evidence.decision, {
    source_failure_classified: false,
    frozen_replacement_reason_invoked: false,
    reserve_consumed: false,
    attempt_count_incremented: false,
    new_progress_snapshot_created: false,
    ordinal_2_admitted: false,
    scientific_authority_advanced: false,
  });
  assert.deepEqual(evidence.current_evidence, {
    payload_bytes_present_in_mmi: false,
    receipt_present_in_mmi: false,
    source_digest_present_in_mmi: false,
    authoritative_progress_snapshot: 'attempt-003',
  });
});

test('next gate remains verifier-readable exact bytes plus conformant receipt only', () => {
  const evidence = j(RECOVERY);

  assert.equal(
    evidence.next_gate.name,
    'mmi_only_recover_verifier_readable_frozen_ordinal_1_payload',
  );
  assert.equal(evidence.next_gate.source_identity_change_admitted, false);
  assert.equal(evidence.next_gate.reserve_substitution_admitted, false);
  assert.equal(
    evidence.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
  assert.equal(evidence.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(evidence.next_gate.target_authoring_admitted, false);
  assert.equal(evidence.next_gate.candidate_generation_admitted, false);
  assert.equal(evidence.next_gate.feature_capture_admitted, false);
  assert.equal(evidence.next_gate.scoring_admitted, false);
  assert.equal(evidence.next_gate.metrics_admitted, false);
});
