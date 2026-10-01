import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v2.json';
const PREDECESSOR =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v1.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('runtime conformance v2 supersedes v1 only for the literal HTTPS defect', () => {
  const closure = json(CLOSURE);
  const predecessor = json(PREDECESSOR);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    'bd1072004427135a285c6a2e731f26d799f39093',
  );
  assert.equal(closure.predecessor_closure.retained_for_audit, true);
  assert.equal(
    closure.correction.defect,
    'mmi_whatwg_url_normalization_accepted_https_spellings_that_fail_frozen_schema_pattern',
  );
  assert.equal(closure.correction.markdown_matrix_injector_pr, 323);
  assert.equal(
    closure.correction.excel_houganshi_normalizer_regression_pr,
    110,
  );
  assert.equal(
    predecessor.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
    closure.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
  );
});

test('runtime conformance v2 binds corrected product runtimes', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.fetch_helper.git_blob_sha,
    '8e84601e0de2b126bfa826f671c67a5fcd17475d',
  );
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    '20111d33787dbfbba2d45fd3f7905baba3235547',
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

test('runtime conformance v2 requires literal frozen HTTPS spelling', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.conformance
      .receipt_url_fields_must_match_literal_https_double_slash_pattern,
    true,
  );
  assert.equal(
    closure.conformance.redirect_chain_first_from_equals_frozen_request_url,
    true,
  );
  assert.equal(
    closure.conformance.redirect_chain_hops_must_be_continuous,
    true,
  );
  assert.equal(
    closure.conformance.final_url_must_equal_terminal_redirect_or_frozen_request,
    true,
  );
});

test('runtime conformance v2 leaves scientific state and next gate unchanged', () => {
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
