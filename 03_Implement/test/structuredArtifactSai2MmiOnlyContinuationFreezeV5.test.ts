import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v5.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v5 binds the required-raw verifier', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '4432d7829425b9739b8502753c57437dc385483a',
  );
  assert.equal(
    value.correction.defect,
    'returned_evidence_verifier_could_synthesize_raw_json_when_receipt_or_returned_snapshot_raw_artifacts_were_omitted',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    'de8c7d0c9afb6f690edaeda7792a002c84106786',
  );
  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
});

test('MMI-only freeze v5 requires caller-supplied raw evidence', () => {
  const value = freeze();

  assert.equal(value.verifier_guards.receipt_raw_artifact_required, true);
  assert.equal(
    value.verifier_guards.returned_snapshot_raw_artifact_required,
    true,
  );
  assert.equal(
    value.verifier_guards.reported_receipt_sha256_binds_caller_supplied_raw,
    true,
  );
  assert.equal(
    value.verifier_guards
      .reported_returned_snapshot_sha256_binds_caller_supplied_raw,
    true,
  );
  assert.equal(
    value.verifier_guards
      .expected_snapshot_predecessor_ref_uses_canonical_authoritative_ref,
    true,
  );
});

test('MMI-only freeze v5 preserves Excel freeze and scientific stop-lines', () => {
  const value = freeze();

  assert.equal(value.excel_freeze.repository_access_admitted, false);
  assert.equal(value.excel_freeze.mirror_updates_admitted, false);
  assert.equal(
    value.excel_freeze
      .cross_repo_independent_verification_deferred_until_explicit_unfreeze,
    true,
  );
  assert.equal(value.excel_freeze.explicit_unfreeze_required, true);
  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(value.next_gate.ordinal_2_admitted_by_verifier, false);
  assert.equal(value.next_gate.excel_repository_access_required, false);
});
