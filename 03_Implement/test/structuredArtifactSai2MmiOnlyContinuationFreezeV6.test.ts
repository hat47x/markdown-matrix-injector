import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v6.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v6 binds package-integrity correction', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '357dd1af21dc0320988a1e4a914f87551cd31950',
  );
  assert.equal(
    value.correction.defect,
    'xlsx_package_validation_checked_required_central_directory_names_without_verifying_entry_local_headers_decompression_sizes_or_crc',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    'cc2443664a63613e380ffb204012dddb6f284b11',
  );
  assert.equal(
    value.authority.active_shared_zip_reader_git_blob_sha,
    '2738ec775cc4a86471c617c1a5e5c797720e2e76',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    'de8c7d0c9afb6f690edaeda7792a002c84106786',
  );
});

test('MMI-only freeze v6 requires full ZIP package integrity without semantics', () => {
  const value = freeze();

  assert.equal(value.package_integrity_guards.required_ooxml_entries_present, true);
  assert.equal(value.package_integrity_guards.every_non_directory_zip_entry_read, true);
  assert.equal(value.package_integrity_guards.local_header_verified, true);
  assert.equal(value.package_integrity_guards.decompression_verified, true);
  assert.equal(value.package_integrity_guards.declared_uncompressed_size_verified, true);
  assert.equal(value.package_integrity_guards.crc_verified, true);
  assert.equal(
    value.package_integrity_guards
      .zip64_or_encrypted_or_unsupported_compression_fail_closed,
    true,
  );
  assert.equal(
    value.package_integrity_guards.workbook_semantic_interpretation_performed,
    false,
  );
});

test('MMI-only freeze v6 preserves scientific and Excel stop-lines', () => {
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
