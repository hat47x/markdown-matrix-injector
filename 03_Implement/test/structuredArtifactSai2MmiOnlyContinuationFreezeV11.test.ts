import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v11.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v11 binds desktop baseline-path canonicalization', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '63e10cc6e7ad8f93518d80c5ea54569cc9ee6430',
  );
  assert.equal(
    value.correction.defect,
    'desktop_handoff_baseline_path_relative_to_03_Implement_collapsed_to_basename_and_failed_authoritative_ref_verification',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '1358a93ebb7038dd378af22628b26dda6409bc01',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    'de8c7d0c9afb6f690edaeda7792a002c84106786',
  );
});

test('MMI-only freeze v11 admits the documented desktop-relative baseline forms', () => {
  const guards = freeze().desktop_handoff_guards;

  assert.equal(guards.repo_root_or_absolute_paths_with_03_Implement_canonicalized, true);
  assert.equal(guards.relative_test_fixtures_paths_from_03_Implement_canonicalized, true);
  assert.equal(guards.dot_relative_test_fixtures_paths_from_03_Implement_canonicalized, true);
  assert.equal(guards.authoritative_attempt_003_ref_preserved, true);
  assert.equal(guards.arbitrary_unrelated_paths_not_promoted_to_authoritative_ref, true);
  assert.equal(guards.xlsx_execution_performed_in_web_lane, false);
});

test('MMI-only freeze v11 preserves scientific and Excel stop-lines', () => {
  const value = freeze();

  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(value.excel_freeze.repository_access_admitted, false);
  assert.equal(value.excel_freeze.mirror_updates_admitted, false);
  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(value.next_gate.excel_repository_access_required, false);
  assert.equal(value.next_gate.web_transport_retry_required, false);
  assert.equal(value.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(value.next_gate.ordinal_2_before_success_snapshot_commit_admitted, false);
});
