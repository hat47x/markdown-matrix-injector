import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v18.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v18 binds unique workbook package identity', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    'b5a7b72aecd6cb8f3e8bf17cca4a06d74431d130',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'd0271f67fca32acd7e8288b4e72bbec9cfc3d40e',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    'de8c7d0c9afb6f690edaeda7792a002c84106786',
  );
});

test('MMI-only freeze v18 requires unambiguous workbook identity declarations', () => {
  const value = freeze();

  assert.equal(
    value.package_guards.workbook_content_type_override_count_must_equal_one,
    true,
  );
  assert.equal(value.package_guards.root_relationship_ids_required, true);
  assert.equal(value.package_guards.root_relationship_ids_unique, true);
  assert.equal(
    value.package_guards.standard_office_document_relationship_count_must_equal_one,
    true,
  );
  assert.equal(
    value.package_guards.unique_office_document_relationship_must_be_internal,
    true,
  );
  assert.equal(
    value.package_guards.unique_office_document_relationship_targets_workbook,
    true,
  );
  assert.equal(value.package_guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v18 preserves Stage-A and Excel stop-lines', () => {
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
