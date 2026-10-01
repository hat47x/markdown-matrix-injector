import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v12.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v12 preserves v11 and binds the OPC-hardened runner', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '2c89ffd73a313bfae48b643041a43158d7d98389',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '7fbc2184ef76e56ca77e97389d842e29edc07db6',
  );
  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(value.desktop_handoff_guards.inherited_from_v11, true);
});

test('MMI-only freeze v12 keeps OPC package roots canonical and Strict document identity admitted', () => {
  const guards = freeze().package_guards;

  assert.equal(guards.content_types_root_namespace_must_equal_opc_2006, true);
  assert.equal(guards.relationships_root_namespace_must_equal_opc_2006, true);
  assert.equal(guards.workbook_root_namespace_may_be_transitional_or_strict, true);
  assert.equal(guards.office_document_relationship_type_may_be_transitional_or_strict, true);
  assert.equal(guards.invented_purl_package_namespace_aliases_rejected, true);
  assert.equal(guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v12 preserves Excel and scientific stop-lines', () => {
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
