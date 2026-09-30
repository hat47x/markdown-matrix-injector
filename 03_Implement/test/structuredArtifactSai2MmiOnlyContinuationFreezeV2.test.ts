import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v2.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only continuation v2 records explicit Excel freeze', () => {
  const value = freeze();

  assert.equal(value.user_directive.received_at_utc, '2026-09-29T13:32:55Z');
  assert.equal(value.user_directive.excel_repository_frozen, true);
  assert.equal(value.user_directive.excel_repository_access_admitted, false);
  assert.equal(
    value.frozen_consumer.repository,
    'hat47x/excel-houganshi-normalizer',
  );
  assert.equal(value.frozen_consumer.repository_reads_admitted, false);
  assert.equal(value.frozen_consumer.repository_writes_admitted, false);
  assert.equal(
    value.frozen_consumer.repository_issue_or_pr_writes_admitted,
    false,
  );
  assert.equal(value.frozen_consumer.future_mirror_required_while_frozen, false);
  assert.equal(value.frozen_consumer.explicit_unfreeze_required, true);
});

test('MMI-only continuation v2 binds current MMI-only verifier', () => {
  const value = freeze();

  assert.equal(
    value.authority.last_cross_repo_runtime_conformance_git_blob_sha,
    '245d11b331f25c4eafda3e797cd05b27e7ee40e2',
  );
  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'f863a92ecb3caf9808c35dcdb2f1d1335a5a4896',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    'c73d505c7601edd0558c8a7cf5442f2834ad1e30',
  );
});

test('MMI-only continuation v2 keeps scientific gates closed', () => {
  const value = freeze();

  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(
    value.scientific_scope.cross_repo_equivalence_claims_after_freeze_admitted,
    false,
  );
  assert.equal(
    value.scientific_scope.ordinal_2_before_mmi_ordinal_1_success_admitted,
    false,
  );
  assert.equal(
    value.scientific_scope
      .cross_repo_independent_verification_deferred_until_explicit_unfreeze,
    true,
  );
});

test('MMI-only continuation v2 preserves retained-branch discipline', () => {
  const value = freeze();

  assert.equal(
    value.active_consumer.retained_branch,
    'research/structured-artifact-sai2-region-proposal-v0',
  );
  assert.equal(value.active_consumer.branch_must_merge_back_to_main, true);
  assert.equal(value.active_consumer.continuation_branch_creation_admitted, false);
  assert.equal(value.next_gate.excel_repository_access_required, false);
  assert.equal(
    value.next_gate.name,
    'mmi_only_recover_verifier_readable_frozen_ordinal_1_payload',
  );
});

test('current directive supersedes prior cross-repo restore scope', () => {
  const value = freeze();

  assert.equal(value.audit.cross_repo_restore_pr, 344);
  assert.equal(
    value.audit.current_user_directive_supersedes_cross_repo_restore_scope,
    true,
  );
  assert.equal(
    value.audit.post_freeze_excel_state_must_not_be_used_to_extend_equivalence,
    true,
  );
});
