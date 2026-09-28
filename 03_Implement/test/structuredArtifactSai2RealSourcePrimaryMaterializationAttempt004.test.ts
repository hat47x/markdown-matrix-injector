import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const PREV =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';
const ATTEMPT =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-004.json';
const HANDOFF =
  'structured-artifact-sai2-real-source-primary-materialization-ordinal-1-offline-handoff-request-v0.json';
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('attempt 004 reuses the same frozen ordinal-1 request after runtime conformance closure', () => {
  const prev = j(PREV);
  const attempt = j(ATTEMPT);
  const handoff = j(HANDOFF);
  const closure = j(CLOSURE);

  assert.equal(
    attempt.predecessor_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    attempt.handoff_runtime_conformance.closure_id,
    closure.closure_id,
  );
  assert.equal(
    attempt.handoff_runtime_conformance.closure_git_blob_sha,
    '8b9a391c177f4b7f7001a2911800b8ef0728b4e1',
  );
  assert.equal(
    attempt.handoff_runtime_conformance.handoff_request_id,
    handoff.request_id,
  );
  assert.equal(
    attempt.handoff_runtime_conformance.handoff_request_git_blob_sha,
    'c6ad1d41dab20529374b5abc9c11e196c0f97375',
  );
  assert.equal(
    attempt.entries[0].resolved_request_url_or_identity,
    handoff.frozen_request.request_url,
  );
  assert.equal(
    attempt.entries[0].resolved_request_url_or_identity,
    prev.entries[0].resolved_request_url_or_identity,
  );
  assert.equal(
    attempt.handoff_runtime_conformance.contract_changed,
    false,
  );
});

test('attempt 004 records only execution-environment transport failure evidence', () => {
  const attempt = j(ATTEMPT);
  const current = attempt.entries[0];
  const evidence = current.transport_evidence;

  assert.equal(current.attempt_count, 4);
  assert.equal(current.status, 'transport_retry_pending');
  assert.equal(current.final_url, null);
  assert.equal(current.http_status, null);
  assert.equal(current.byte_size, null);
  assert.equal(current.sha256, null);
  assert.equal(current.retrieved_at_utc, null);
  assert.equal(current.binary_validation, 'not_run_no_payload_bytes');
  assert.equal(
    evidence.current_environment_curl_outcome,
    'dns_resolution_failed_before_payload_available',
  );
  assert.equal(
    evidence.current_environment_direct_download_outcome,
    'download_failed_before_payload_available',
  );
  assert.equal(
    evidence.current_environment_web_fetch_outcome,
    'binary_content_type_detected_but_payload_not_exposed_by_current_web_tool',
  );
  assert.equal(evidence.failure_scope, 'current_execution_environment_transport');
  assert.equal(evidence.source_materialization_failure_reason_applied, null);
  assert.equal(evidence.offline_handoff_contract_changed, false);
});

test('attempt 004 does not advance or mutate the remaining ordinal schedule', () => {
  const prev = j(PREV);
  const attempt = j(ATTEMPT);

  assert.deepEqual(
    attempt.entries.slice(1),
    prev.entries.slice(1),
  );
  assert.deepEqual(attempt.aggregate, prev.aggregate);
  assert.deepEqual(attempt.current_boundary, prev.current_boundary);
  assert.deepEqual(attempt.decision, prev.decision);
  assert.equal(attempt.decision.source_failure_classified, false);
  assert.equal(attempt.decision.reserve_materialization_invoked, false);
  assert.equal(attempt.decision.advance_to_next_ordinal, false);
  assert.equal(attempt.decision.same_frozen_request_retry_required, true);
});

test('semantic and evaluation gates remain closed after attempt 004', () => {
  const attempt = j(ATTEMPT);

  assert.equal(
    attempt.next_gate.name,
    'retry_ordinal_1_same_frozen_request_in_binary_capable_transport',
  );
  assert.equal(attempt.next_gate.source_set_change_admitted, false);
  assert.equal(attempt.next_gate.reserve_substitution_admitted, false);
  assert.equal(attempt.next_gate.advance_to_ordinal_2_admitted, false);
  assert.equal(attempt.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(attempt.next_gate.target_authoring_admitted, false);
  assert.equal(attempt.next_gate.candidate_generation_admitted, false);
  assert.equal(attempt.next_gate.scoring_admitted, false);
});
