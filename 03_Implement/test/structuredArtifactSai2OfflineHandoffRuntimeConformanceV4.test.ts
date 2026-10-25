import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v4.json';
const PREDECESSOR =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v3.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('runtime conformance v4 records only the direct-retry HTTPS defect', () => {
  const closure = json(CLOSURE);
  const predecessor = json(PREDECESSOR);

  assert.equal(
    closure.predecessor_closure.git_blob_sha,
    '828f911a8bb3b7415913c8c264631a164f58ba90',
  );
  assert.equal(closure.predecessor_closure.retained_for_audit, true);
  assert.equal(
    closure.correction.defect,
    'ingest_direct_retry_paths_could_follow_or_accept_non_https_transport_outside_external_fetch_helper',
  );
  assert.equal(closure.correction.markdown_matrix_injector_pr, 327);
  assert.equal(closure.correction.excel_houganshi_normalizer_pr, 116);
  assert.equal(
    predecessor.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
    closure.authoritative_common_artifacts.progress_snapshot.git_blob_sha,
  );
});

test('runtime conformance v4 binds both corrected direct-retry runners', () => {
  const closure = json(CLOSURE);

  // Checked as recorded: v5 and later supersede this closure after the
  // direct-retry runner changed again.
  assert.equal(
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
    '4684bf8ff76f62d22dbe54748aed5a089c8292da',
  );
  assert.equal(
    closure.runtime_bindings.excel_houganshi_normalizer.ingest_runner.git_blob_sha,
    'c2fb194550992c5886b8307c00fcec06a62ceb2a',
  );
});

test('runtime conformance v4 requires HTTPS on external and direct transport paths', () => {
  const c = json(CLOSURE).conformance;

  assert.equal(
    c.fetch_redirect_target_must_remain_literal_https_with_authority,
    true,
  );
  assert.equal(
    c.direct_retry_frozen_request_must_be_literal_https_with_authority,
    true,
  );
  assert.equal(
    c.direct_retry_redirect_targets_must_remain_literal_https_with_authority,
    true,
  );
  assert.equal(c.direct_retry_redirect_provenance_must_be_continuous, true);
  assert.equal(c.invalid_direct_transport_does_not_classify_source_failure, true);
});

test('runtime conformance v4 leaves scientific state unchanged', () => {
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
