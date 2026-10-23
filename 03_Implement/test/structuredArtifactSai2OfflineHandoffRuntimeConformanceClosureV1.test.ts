import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v1.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('v1 closure supersedes runtime binding only and restores attempt-003 authority', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    '8b9a391c177f4b7f7001a2911800b8ef0728b4e1',
  );
  assert.equal(closure.predecessor_closure.retained_for_audit, true);
  assert.equal(
    closure.correction.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    closure.current_evidence.authoritative_progress_snapshot,
    'attempt-003',
  );
  assert.equal(closure.current_evidence.payload_bytes_present, false);
  assert.equal(closure.current_evidence.ordinal_2_admitted, false);
});

test('v1 closure binds the corrected MMI fetch and ingest blobs it was frozen against', () => {
  const closure = json(CLOSURE);

  // Pins are checked as recorded: later closures supersede v1 after the
  // runners were hardened again.
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.fetch_helper.git_blob_sha,
    '8e84601e0de2b126bfa826f671c67a5fcd17475d',
  );
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    '461bf7e9bb5380e245a6da62f259ef6c847c82f6',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.fetch_helper.git_blob_sha,
    'e372fee6468d7b423b49db215a04ba311d2b2e86',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.ingest_runner.git_blob_sha,
    'dd460d9d312c619b89b924f5917289fbba857adf',
  );
});

test('v1 closure freezes redirect provenance continuity as an ingest requirement', () => {
  const c = json(CLOSURE).conformance;

  assert.equal(c.redirect_chain_https_and_admitted_status_only, true);
  assert.equal(c.redirect_chain_max_items, 10);
  assert.equal(c.redirect_chain_first_from_equals_frozen_request_url, true);
  assert.equal(c.redirect_chain_hops_must_be_continuous, true);
  assert.equal(
    c.final_url_must_equal_terminal_redirect_or_frozen_request,
    true,
  );
  assert.equal(c.request_url_exact_frozen_match_required, true);
  assert.equal(c.sha256_exact_payload_match_required, true);
  assert.equal(c.ooxml_package_validation_before_success, true);
  assert.equal(
    c.invalid_offline_handoff_does_not_classify_source_failure,
    true,
  );
});

test('v1 closure re-closes change control and admits only the same frozen external fetch', () => {
  const closure = json(CLOSURE);

  assert.equal(closure.change_control.concrete_defect_fix_completed, true);
  assert.equal(closure.change_control.pre_byte_handoff_contract_closed, true);
  assert.equal(
    closure.change_control.additional_pre_byte_contract_change_requires_concrete_defect,
    true,
  );
  assert.equal(
    closure.next_gate.name,
    'external_binary_fetch_same_frozen_ordinal_1_request',
  );
  for (const key of [
    'source_identity_change_admitted',
    'reserve_substitution_admitted',
    'ordinal_2_before_success_admitted',
    'workbook_semantic_inspection_admitted',
    'target_authoring_admitted',
    'candidate_generation_admitted',
    'feature_capture_admitted',
    'scoring_admitted',
    'metrics_admitted',
  ]) {
    assert.equal(closure.next_gate[key], false);
  }
});
