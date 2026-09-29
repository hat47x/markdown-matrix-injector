import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v6.json';
const PREDECESSOR =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v5.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('runtime conformance v6 records only the literal Content-Type defect', () => {
  const closure = json(CLOSURE);
  const predecessor = json(PREDECESSOR);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    '88faca6a7dfbe7216bfbf81025a42c6ce8830de8',
  );
  assert.equal(closure.predecessor_closure.retained_for_audit, true);
  assert.equal(
    closure.correction.defect,
    'transport_content_type_normalization_could_accept_values_rejected_by_frozen_receipt_schema_pattern',
  );
  assert.equal(closure.correction.markdown_matrix_injector_pr, 332);
  assert.equal(closure.correction.excel_houganshi_normalizer_pr, 120);
  assert.equal(
    predecessor.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
    closure.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
  );
});

test('runtime conformance v6 binds literal Content-Type runtimes', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.fetch_helper.git_blob_sha,
    'f80d1ea80683d094bdd83c244710074b50ce0554',
  );
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    '67aefb4f26cef3a1b51b24deaf7e624283b5a4ab',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.fetch_helper.git_blob_sha,
    '4b34f112a43bd23a6342d4fadd85d145348c92fc',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.ingest_runner.git_blob_sha,
    '35a979ad8e99e7baea77e8ce48050490b5f1bbb8',
  );
});

test('runtime conformance v6 freezes literal Content-Type spelling', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.conformance
      .content_type_must_match_frozen_receipt_pattern_without_case_or_whitespace_normalization,
    true,
  );
  assert.deepEqual(closure.conformance.accepted_content_types, [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ]);
});

test('runtime conformance v6 keeps scientific state and next gate unchanged', () => {
  const closure = json(CLOSURE);

  assert.deepEqual(closure.current_evidence, {
    payload_bytes_present: false,
    receipt_present: false,
    source_digest_present: false,
    source_failure_classified: false,
    reserve_consumed: false,
    ordinal_2_admitted: false,
    authoritative_progress_snapshot: 'attempt-003',
  });
  assert.equal(
    closure.next_gate.name,
    'external_binary_fetch_same_frozen_ordinal_1_request',
  );
});
