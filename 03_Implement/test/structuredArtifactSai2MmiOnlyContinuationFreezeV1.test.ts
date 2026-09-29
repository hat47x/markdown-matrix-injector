import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v1.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only continuation v1 records explicit Excel freeze directive', () => {
  const value = freeze();

  assert.equal(value.user_directive.received_at_utc, '2026-09-29T13:32:59Z');
  assert.equal(value.user_directive.excel_repository_frozen, true);
  assert.equal(value.user_directive.excel_repository_access_admitted, false);
  assert.equal(
    value.frozen_consumer.repository,
    'hat47x/excel-houganshi-normalizer',
  );
  assert.equal(value.frozen_consumer.repository_reads_admitted, false);
  assert.equal(value.frozen_consumer.repository_writes_admitted, false);
  assert.equal(value.frozen_consumer.future_mirror_required_while_frozen, false);
});

test('MMI-only continuation v1 freezes v7 as last cross-repo authority', () => {
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
    'd5227b90a9add3e5231c2dd6d7be416c316555dc',
  );
});

test('MMI-only continuation v1 keeps scientific gates closed', () => {
  const value = freeze();

  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(value.scientific_scope.current_source_identity_change_admitted, false);
  assert.equal(value.scientific_scope.reserve_substitution_admitted, false);
  assert.equal(value.scientific_scope.ordinal_2_before_mmi_ordinal_1_success_admitted, false);
  assert.equal(value.next_gate.excel_repository_access_required, false);
  assert.equal(
    value.next_gate.name,
    'mmi_only_external_binary_fetch_same_frozen_ordinal_1_request',
  );
});

test('MMI-only continuation v1 preserves retained-branch discipline', () => {
  const value = freeze();

  assert.equal(
    value.active_consumer.retained_branch,
    'research/structured-artifact-sai2-region-proposal-v0',
  );
  assert.equal(value.active_consumer.branch_must_merge_back_to_main, true);
  assert.equal(value.active_consumer.continuation_branch_creation_admitted, false);
  assert.equal(value.audit.prior_mmi_only_freeze_pr, 336);
  assert.equal(value.audit.prior_freeze_withdrawal_pr, 337);
  assert.equal(value.audit.current_freeze_supersedes_prior_withdrawal, true);
});
