import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v7.json';
const PREDECESSOR =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v6.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('runtime conformance v7 records only the UTC date-time schema defect', () => {
  const closure = json(CLOSURE);
  const predecessor = json(PREDECESSOR);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    '93321b5a7f7c1fdd5e152a817782fd4f98405ab3',
  );
  assert.equal(
    closure.correction.defect,
    'retrieved_at_utc_parser_could_accept_values_rejected_by_frozen_json_schema_date_time_format',
  );
  assert.equal(closure.correction.markdown_matrix_injector_pr, 334);
  assert.equal(closure.correction.excel_houganshi_normalizer_pr, 122);
  assert.equal(
    predecessor.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
    closure.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
  );
});

test('runtime conformance v7 binds corrected UTC timestamp runtimes', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.fetch_helper.git_blob_sha,
    'f80d1ea80683d094bdd83c244710074b50ce0554',
  );
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    'e1ebc75cd91d970b5613f06e9e1c3adeb74b3985',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.fetch_helper.git_blob_sha,
    '4b34f112a43bd23a6342d4fadd85d145348c92fc',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.ingest_runner.git_blob_sha,
    'f973d8b7a29d9bc8a26d6e80f3dc91c2b4cf1ba0',
  );
});

test('runtime conformance v7 freezes UTC date-time shape before success', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.conformance
      .retrieved_at_utc_must_match_frozen_json_schema_date_time_shape_and_uppercase_z,
    true,
  );
  assert.equal(
    closure.conformance.direct_retry_generated_timestamp_checked_before_success,
    true,
  );
});

test('runtime conformance v7 keeps scientific state and next gate unchanged', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.current_evidence.authoritative_progress_snapshot,
    'attempt-003',
  );
  assert.equal(closure.current_evidence.payload_bytes_present, false);
  assert.equal(closure.current_evidence.source_digest_present, false);
  assert.equal(closure.current_evidence.ordinal_2_admitted, false);
  assert.equal(
    closure.next_gate.name,
    'external_binary_fetch_same_frozen_ordinal_1_request',
  );
});
