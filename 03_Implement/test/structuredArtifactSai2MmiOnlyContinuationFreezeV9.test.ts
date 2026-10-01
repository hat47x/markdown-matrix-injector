import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v9.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v9 binds ZIP directory and relationship hardening', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '5c20e3108381d6132ec0fc5201547cf5134efd15',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'a4c5cc1f985fc3f38ab2f068e9b113e001f1d077',
  );
  assert.equal(
    value.authority.active_shared_zip_reader_git_blob_sha,
    '12cca25166e6db0e27d78bb9e5db40292a3945d1',
  );
});

test('MMI-only freeze v9 requires coherent single-disk central directory', () => {
  const guards = freeze().package_guards;

  assert.equal(guards.terminal_eocd_record_required, true);
  assert.equal(guards.eocd_comment_length_must_reach_end_of_file, true);
  assert.equal(guards.multi_disk_zip_rejected, true);
  assert.equal(guards.zip64_sentinels_rejected, true);
  assert.equal(guards.central_directory_bounds_must_precede_eocd, true);
  assert.equal(
    guards.central_directory_declared_size_must_match_entries,
    true,
  );
});

test('MMI-only freeze v9 requires standard officeDocument relationship', () => {
  const guards = freeze().package_guards;

  assert.equal(
    guards.office_document_relationship_type_must_be_standard_transitional_or_strict_uri,
    true,
  );
  assert.equal(guards.office_document_target_must_be_workbook_part, true);
  assert.equal(guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v9 preserves scientific and Excel stop-lines', () => {
  const value = freeze();

  assert.equal(value.excel_freeze.repository_access_admitted, false);
  assert.equal(value.excel_freeze.mirror_updates_admitted, false);
  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(
    value.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
  assert.equal(value.next_gate.workbook_semantic_inspection_admitted, false);
});
