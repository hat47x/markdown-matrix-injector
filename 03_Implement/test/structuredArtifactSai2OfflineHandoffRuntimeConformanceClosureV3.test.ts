import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v3.json';
const PREDECESSOR =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v2.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('runtime conformance v3 records the fetch redirect HTTPS defect only', () => {
  const closure = json(CLOSURE);
  const predecessor = json(PREDECESSOR);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    'eb1cd2ef1a580c83c30e329bee3cdf56cb32a6b6',
  );
  assert.equal(closure.predecessor_closure.retained_for_audit, true);
  assert.equal(
    closure.correction.defect,
    'external_fetch_helpers_could_follow_non_https_redirect_before_ingest_rejection',
  );
  assert.equal(closure.correction.markdown_matrix_injector_pr, 325);
  assert.equal(closure.correction.excel_houganshi_normalizer_pr, 112);
  assert.equal(
    predecessor.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
    closure.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
  );
});

test('runtime conformance v3 binds the HTTPS-hardened fetch helpers', () => {
  const closure = json(CLOSURE);

  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.fetch_helper.git_blob_sha,
    '9901c68c6c702b2a9c257471c7a93a9ffaa7c50f',
  );
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    '20111d33787dbfbba2d45fd3f7905baba3235547',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.fetch_helper.git_blob_sha,
    '0e8b807b156a08a984a4f1d4687be11885cd9a29',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.ingest_runner.git_blob_sha,
    'dd460d9d312c619b89b924f5917289fbba857adf',
  );
});

test('runtime conformance v3 requires HTTPS transport before ingest', () => {
  const closure = json(CLOSURE);
  const conformance = closure.conformance;

  assert.equal(
    conformance.fetch_redirect_target_must_remain_literal_https_with_authority,
    true,
  );
  assert.equal(
    conformance.receipt_url_fields_must_match_literal_https_double_slash_pattern,
    true,
  );
  assert.equal(conformance.redirect_chain_hops_must_be_continuous, true);
});

test('runtime conformance v3 keeps scientific state and next gate closed', () => {
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
