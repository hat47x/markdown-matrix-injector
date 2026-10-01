import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v15.json';

function freeze(): any {
  return JSON.parse(readFileSync(new URL(FREEZE, FIXTURES), 'utf8'));
}

test('MMI-only freeze v15 binds namespace-aware direct-child package validation', () => {
  const value = freeze();
  assert.equal(
    value.predecessor_freeze.git_blob_sha,
    '511e1e39a8afa215fd97c31b80434e6b8201e32f',
  );
  assert.equal(
    value.authority.active_mmi_ingest_runner_git_blob_sha,
    '0339010f232d2bd60df5c528c53167527eadca92',
  );
  assert.equal(
    value.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
});

test('MMI-only freeze v15 rejects non-element and foreign-namespace lookalikes', () => {
  const guards = freeze().package_guards;
  assert.equal(
    guards.comments_processing_instructions_and_cdata_not_treated_as_required_elements,
    true,
  );
  assert.equal(guards.required_override_must_be_root_direct_child, true);
  assert.equal(guards.required_relationship_must_be_root_direct_child, true);
  assert.equal(guards.required_override_namespace_must_equal_opc_2006, true);
  assert.equal(guards.required_relationship_namespace_must_equal_opc_2006, true);
  assert.equal(guards.correctly_prefixed_opc_children_admitted, true);
  assert.equal(guards.foreign_namespace_lookalikes_admitted, false);
  assert.equal(guards.worksheet_semantics_opened, false);
});

test('MMI-only freeze v15 preserves Excel and scientific stop-lines', () => {
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
