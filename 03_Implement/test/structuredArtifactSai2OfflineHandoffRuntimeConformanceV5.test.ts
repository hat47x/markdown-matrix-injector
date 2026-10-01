import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V5 =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v5.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('v5 binds corrected direct-retry runners while retaining attempt-003', () => {
  const closure = j(V5);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    '6d8a80a008c81bb8cbd69e1f3169278ff6c0f8e2',
  );
  assert.equal(
    closure.correction.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    'a313f4ba771227ff6f246fb6af2975f9ec29673e',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.ingest_runner.git_blob_sha,
    '67e62a51e6387eb70d3b813a764fbda251830ffd',
  );
});

test('v5 requires the frozen content-type allowlist on every payload path', () => {
  const closure = j(V5);
  const c = closure.conformance;

  assert.deepEqual(c.accepted_content_types, [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ]);
  assert.equal(c.external_fetch_content_type_allowlist_required, true);
  assert.equal(c.offline_receipt_content_type_allowlist_required, true);
  assert.equal(c.direct_retry_content_type_allowlist_required, true);
  assert.equal(
    c.direct_retry_content_type_checked_before_payload_success,
    true,
  );
  assert.equal(
    c.unaccepted_direct_content_type_classifies_frozen_materialization_failure,
    true,
  );
});

test('v5 adds no materialization evidence and preserves the same external-fetch gate', () => {
  const closure = j(V5);

  assert.deepEqual(closure.current_evidence, {
    payload_bytes_present: false,
    receipt_present: false,
    source_digest_present: false,
    source_failure_classified: false,
    reserve_consumed: false,
    ordinal_2_admitted: false,
    authoritative_progress_snapshot: 'attempt-003',
  });
  assert.deepEqual(closure.next_gate, {
    name: 'external_binary_fetch_same_frozen_ordinal_1_request',
    source_identity_change_admitted: false,
    reserve_substitution_admitted: false,
    ordinal_2_before_success_admitted: false,
    workbook_semantic_inspection_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    feature_capture_admitted: false,
    scoring_admitted: false,
    metrics_admitted: false,
  });
});
