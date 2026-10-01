import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v10.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v10 binds namespace-hardened OOXML validator', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    'ef68aff6afce8d10e11377ccc936fe0b00cfbfa3',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '5c1292b612996e1cd0732c1982f1989cce7a9ea8',
  );
  assert.equal(
    value.correction.defect,
    'ooxml_package_root_elements_were_accepted_by_local_name_without_standard_namespace_identity',
  );
});

test('MMI-only freeze v10 requires standard OOXML root namespaces', () => {
  const guards = freeze().package_guards;

  assert.equal(
    guards.content_types_root_namespace_must_be_standard_transitional_or_strict,
    true,
  );
  assert.equal(
    guards.relationships_root_namespace_must_be_standard_transitional_or_strict,
    true,
  );
  assert.equal(
    guards.workbook_root_namespace_must_be_standard_transitional_or_strict,
    true,
  );
  assert.equal(
    guards.office_document_relationship_type_must_be_standard_transitional_or_strict_uri,
    true,
  );
  assert.equal(guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v10 preserves scientific and Excel stop-lines', () => {
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
  assert.equal(
    value.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
  assert.equal(value.next_gate.workbook_semantic_inspection_admitted, false);
});
