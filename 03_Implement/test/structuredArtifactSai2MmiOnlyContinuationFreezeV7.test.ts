import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v7.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v7 binds duplicate-safe ZIP validation', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '9b651ee5ac998fa4881e24f2028aa4a608679168',
  );
  assert.equal(
    value.correction.defect,
    'shared_zip_reader_silently_overwrote_duplicate_non_directory_entry_names_so_not_every_package_entry_was_integrity_checked',
  );
  assert.equal(
    value.authority.active_shared_zip_reader_git_blob_sha,
    '4b144698aded3e7207afa4a5310cf1cdac2c2f66',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'cc2443664a63613e380ffb204012dddb6f284b11',
  );
});

test('MMI-only freeze v7 requires unambiguous full package integrity', () => {
  const value = freeze();

  assert.equal(
    value.package_integrity_guards.duplicate_non_directory_entry_names_rejected,
    true,
  );
  assert.equal(
    value.package_integrity_guards.every_non_directory_zip_entry_unambiguously_addressable,
    true,
  );
  assert.equal(value.package_integrity_guards.every_non_directory_zip_entry_read, true);
  assert.equal(value.package_integrity_guards.local_header_verified, true);
  assert.equal(value.package_integrity_guards.decompression_verified, true);
  assert.equal(value.package_integrity_guards.declared_uncompressed_size_verified, true);
  assert.equal(value.package_integrity_guards.crc_verified, true);
  assert.equal(
    value.package_integrity_guards.workbook_semantic_interpretation_performed,
    false,
  );
});

test('MMI-only freeze v7 preserves scientific and Excel stop-lines', () => {
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
  assert.equal(value.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(value.next_gate.ordinal_2_before_success_snapshot_commit_admitted, false);
});
