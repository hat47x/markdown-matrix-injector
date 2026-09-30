import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v3.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v3 records authoritative baseline pinning correction', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '29aa6ce5398ec98307de67ff2b0bb0d696a18efa',
  );
  assert.equal(value.predecessor_freeze.retained_for_audit, true);
  assert.equal(
    value.correction.defect,
    'returned_evidence_verifier_did_not_pin_supplied_baseline_raw_and_parsed_object_to_authoritative_attempt_003_blob',
  );
  assert.equal(
    value.correction.active_verifier_schema,
    'hat47x.structured-artifact-sai2-returned-ordinal1-evidence-verification/v3',
  );
});

test('MMI-only freeze v3 binds authoritative attempt-003 and current verifier', () => {
  const value = freeze();

  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    value.authority.authoritative_progress_ref,
    '03_Implement/test/fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'f863a92ecb3caf9808c35dcdb2f1d1335a5a4896',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    '1199b9ec391a3ded920a5dd5d9f95e43dd427b55',
  );
});

test('MMI-only freeze v3 requires all authoritative baseline guards', () => {
  const value = freeze();

  assert.equal(
    value.verifier_guards.baseline_ref_must_match_authoritative_fixture,
    true,
  );
  assert.equal(
    value.verifier_guards.baseline_snapshot_id_must_match_attempt_003,
    true,
  );
  assert.equal(
    value.verifier_guards.baseline_raw_git_blob_must_match_authoritative_blob,
    true,
  );
  assert.equal(
    value.verifier_guards
      .baseline_parsed_object_must_exactly_match_baseline_raw_json,
    true,
  );
  assert.equal(value.verifier_guards.ordinal_2_admitted_by_verifier, false);
  assert.equal(value.verifier_guards.semantic_stages_admitted, false);
});

test('MMI-only freeze v3 preserves Excel freeze and scientific stop-lines', () => {
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
  assert.equal(value.next_gate.excel_repository_access_required, false);
  assert.equal(
    value.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
});
