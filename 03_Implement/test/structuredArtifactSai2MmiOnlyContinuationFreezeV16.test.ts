import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v16.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v16 binds well-formed workbook XML package gate', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    'a1f6c187c15dd493d09b821957db708dc83565d1',
  );
  assert.equal(value.predecessor_freeze.retained_for_audit, true);
  assert.equal(
    value.correction.defect,
    'workbook_xml_root_namespace_check_did_not_reject_unbalanced_nested_markup',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '8d965048a605ad44f4b7041e9ec6b7bbda0f1f7e',
  );
});

test('MMI-only freeze v16 keeps workbook validation non-semantic', () => {
  const value = freeze();

  assert.equal(
    value.package_guards.workbook_xml_nested_markup_must_be_well_formed,
    true,
  );
  assert.equal(
    value.package_guards
      .workbook_xml_balanced_nested_elements_admitted_without_semantic_interpretation,
    true,
  );
  assert.equal(value.package_guards.worksheet_semantics_opened, false);
  assert.equal(
    value.package_guards.workbook_root_namespace_may_be_transitional_or_strict,
    true,
  );
});

test('MMI-only freeze v16 preserves Excel freeze and scientific stop-lines', () => {
  const value = freeze();

  assert.equal(value.excel_freeze.repository_access_admitted, false);
  assert.equal(value.excel_freeze.mirror_updates_admitted, false);
  assert.equal(value.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(value.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(value.current_evidence.source_failure_classified, false);
  assert.equal(value.current_evidence.reserve_consumed, false);
  assert.equal(value.current_evidence.ordinal_2_admitted, false);
  assert.equal(value.next_gate.excel_repository_access_required, false);
  assert.equal(value.next_gate.web_transport_retry_required, false);
  assert.equal(
    value.next_gate.ordinal_2_before_success_snapshot_commit_admitted,
    false,
  );
});
