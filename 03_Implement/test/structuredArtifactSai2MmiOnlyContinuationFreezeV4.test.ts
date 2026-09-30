import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v4.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v4 records raw-evidence binding correction', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '222f7690714e1b2a6d7ed5efa2b55df1b1ee9fde',
  );
  assert.equal(value.predecessor_freeze.retained_for_audit, true);
  assert.equal(
    value.correction.defect,
    'returned_snapshot_and_receipt_raw_hashes_were_not_bound_to_the_objects_actually_verified',
  );
  assert.equal(
    value.correction.active_verifier_schema,
    'hat47x.structured-artifact-sai2-returned-ordinal1-evidence-verification/v4',
  );
});

test('MMI-only freeze v4 binds current verifier and attempt-003 authority', () => {
  const value = freeze();

  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    '742d36ff07ab189e8c25d96a6ea9aa7e25d5101b',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'f863a92ecb3caf9808c35dcdb2f1d1335a5a4896',
  );
});

test('MMI-only freeze v4 requires verified object/raw hash binding', () => {
  const value = freeze();

  assert.equal(
    value.verifier_guards.returned_snapshot_raw_must_exactly_match_verified_object,
    true,
  );
  assert.equal(
    value.verifier_guards.receipt_raw_must_exactly_match_verified_object,
    true,
  );
  assert.equal(
    value.verifier_guards.reported_returned_snapshot_sha256_binds_verified_raw,
    true,
  );
  assert.equal(
    value.verifier_guards.reported_receipt_sha256_binds_verified_raw,
    true,
  );
});

test('MMI-only freeze v4 preserves frozen Excel and scientific stop-lines', () => {
  const value = freeze();

  assert.equal(value.excel_freeze.repository_access_admitted, false);
  assert.equal(value.excel_freeze.mirror_updates_admitted, false);
  assert.equal(
    value.excel_freeze.cross_repo_equivalence_extension_admitted,
    false,
  );
  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(
    value.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
});
