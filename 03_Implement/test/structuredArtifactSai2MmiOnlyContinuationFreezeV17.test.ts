import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v17.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v17 binds quote-aware XML attribute parsing', () => {
  const value = freeze();

  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '5976a5c22153ce4bce4c841854e3731096705cd0',
  );
  assert.equal(
    value.correction.defect,
    'raw_start_tag_regexes_could_treat_attribute_like_text_inside_another_quoted_attribute_value_as_real_xml_attributes',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '6786d7c4617ef23ca92ad496fa3357a66c9d843a',
  );
  assert.equal(
    value.authority.active_mmi_returned_evidence_verifier_git_blob_sha,
    'de8c7d0c9afb6f690edaeda7792a002c84106786',
  );
});

test('MMI-only freeze v17 rejects quoted-value attribute spoofing', () => {
  const guards = freeze().package_guards;

  assert.equal(guards.xml_start_tag_attributes_parsed_quote_aware, true);
  assert.equal(guards.duplicate_xml_attributes_rejected, true);
  assert.equal(guards.namespace_declarations_must_be_actual_attributes, true);
  assert.equal(guards.required_override_attributes_must_be_actual_attributes, true);
  assert.equal(guards.required_relationship_attributes_must_be_actual_attributes, true);
  assert.equal(guards.quoted_value_attribute_spoofing_admitted, false);
  assert.equal(guards.root_and_child_namespace_identity_checks_preserved, true);
  assert.equal(guards.root_direct_child_requirement_preserved, true);
  assert.equal(guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v17 preserves scientific, desktop, and Excel stop-lines', () => {
  const value = freeze();

  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(value.desktop_handoff_guards.xlsx_execution_performed_in_web_lane, false);
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
