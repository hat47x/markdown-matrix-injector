import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v13.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v13 preserves v12 and binds the TargetMode-hardened runner', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '716fb1f59348215f6d991378b4159e53c696d850',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '13bbbb5fdc386bc05741e7cbc9c6c370d43d15c5',
  );
  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
});

test('MMI-only freeze v13 requires an internal root officeDocument relationship', () => {
  const guards = freeze().package_guards;

  assert.equal(guards.inherited_from_v12, true);
  assert.equal(guards.root_office_document_relationship_must_be_internal, true);
  assert.equal(guards.target_mode_absent_means_internal, true);
  assert.equal(guards.explicit_target_mode_internal_admitted, true);
  assert.equal(guards.explicit_target_mode_external_rejected, true);
  assert.equal(guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v13 preserves Excel and scientific stop-lines', () => {
  const value = freeze();

  assert.equal(value.excel_freeze.repository_access_admitted, false);
  assert.equal(value.excel_freeze.mirror_updates_admitted, false);
  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(value.next_gate.web_transport_retry_required, false);
  assert.equal(
    value.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
  assert.equal(value.next_gate.workbook_semantic_inspection_admitted, false);
});
