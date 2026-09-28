import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const PREV =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-002.json';
const ATTEMPT =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('attempt 003 is a same-identity transport retry of ordinal 1 only', () => {
  const prev = j(PREV);
  const attempt = j(ATTEMPT);

  assert.equal(
    attempt.predecessor_git_blob_sha,
    'b5b7da1dae2112a07072768c51cb63ffc7536935',
  );
  assert.deepEqual(
    attempt.entries.map((x: any) => x.source_id),
    prev.entries.map((x: any) => x.source_id),
  );

  const current = attempt.entries[0];
  assert.equal(current.source_id, 'sai2b-primary-ons-x01');
  assert.equal(current.attempt_count, 3);
  assert.equal(current.status, 'transport_retry_pending');
  assert.equal(
    current.resolved_request_url_or_identity,
    prev.entries[0].resolved_request_url_or_identity,
  );
  assert.equal(current.sha256, null);
  assert.equal(current.byte_size, null);
  assert.equal(current.http_status, null);
  assert.equal(current.retrieved_at_utc, null);

  for (const entry of attempt.entries.slice(1)) {
    assert.equal(entry.status, 'pending');
    assert.equal(entry.attempt_count, 0);
    assert.equal(entry.sha256, null);
  }
});

test('attempt 003 records two additional execution-environment transports without source failure', () => {
  const attempt = j(ATTEMPT);
  const evidence = attempt.entries[0].transport_evidence;

  assert.equal(evidence.alternate_binary_file_fetch_attempted, true);
  assert.equal(
    evidence.alternate_binary_file_fetch_outcome,
    'download_failed_before_payload_available',
  );
  assert.equal(evidence.runtime_urllib_retry_attempted, true);
  assert.equal(
    evidence.runtime_urllib_outcome,
    'dns_resolution_failed_before_payload_available',
  );
  assert.equal(evidence.current_retry_outcome, 'transport_retry_pending');
  assert.equal(evidence.source_materialization_failure_reason_applied, null);
});

test('attempt 003 neither consumes reserve nor advances ordinal order', () => {
  const attempt = j(ATTEMPT);

  assert.deepEqual(attempt.decision, {
    source_failure_classified: false,
    frozen_replacement_reason_invoked: false,
    reserve_materialization_invoked: false,
    advance_to_next_ordinal: false,
    same_frozen_request_retry_required: true,
    acquisition_manifest_freeze_admitted: false,
  });
  assert.equal(attempt.aggregate.pending_count, 15);
  assert.equal(attempt.aggregate.transport_retry_pending_count, 1);
  assert.equal(attempt.aggregate.succeeded_count, 0);
  assert.equal(attempt.aggregate.failed_count, 0);
  assert.equal(attempt.aggregate.replaced_count, 0);
  assert.equal(attempt.aggregate.source_bytes_opened_count, 0);
  assert.equal(attempt.aggregate.source_digest_count, 0);
});

test('semantic review and ordinal 2 stay closed after attempt 003', () => {
  const attempt = j(ATTEMPT);

  assert.equal(
    attempt.next_gate.name,
    'retry_ordinal_1_same_frozen_request_in_binary_capable_transport',
  );
  assert.equal(attempt.next_gate.source_id, 'sai2b-primary-ons-x01');
  assert.equal(attempt.next_gate.source_set_change_admitted, false);
  assert.equal(attempt.next_gate.reserve_substitution_admitted, false);
  assert.equal(attempt.next_gate.advance_to_ordinal_2_admitted, false);
  assert.equal(attempt.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(attempt.next_gate.target_authoring_admitted, false);
  assert.equal(attempt.next_gate.candidate_generation_admitted, false);
  assert.equal(attempt.next_gate.scoring_admitted, false);
});
