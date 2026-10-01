import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v8.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v8 binds OOXML package declaration validation', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '4ab33827d4de819885f7a280f3003e75563d0903',
  );
  assert.equal(
    value.correction.defect,
    'integrity_valid_zip_with_required_entry_names_but_empty_or_non_ooxml_declaration_parts_could_pass_as_xlsx',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '0bbe5e55db3f24bdf906d619ccfdd95fab5cfd12',
  );
  assert.equal(
    value.authority.active_shared_zip_reader_git_blob_sha,
    '4b144698aded3e7207afa4a5310cf1cdac2c2f66',
  );
});

test('MMI-only freeze v8 requires minimal XLSX package declarations without worksheet semantics', () => {
  const value = freeze();

  assert.equal(value.package_integrity_guards.xlsx_content_types_document_complete, true);
  assert.equal(value.package_integrity_guards.xlsx_workbook_content_type_declared, true);
  assert.equal(value.package_integrity_guards.root_relationships_document_complete, true);
  assert.equal(
    value.package_integrity_guards.root_office_document_relationship_targets_workbook,
    true,
  );
  assert.equal(value.package_integrity_guards.workbook_document_complete, true);
  assert.equal(
    value.package_integrity_guards.workbook_semantic_interpretation_performed,
    false,
  );
});

test('MMI-only freeze v8 preserves Stage-A and Excel stop-lines', () => {
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
