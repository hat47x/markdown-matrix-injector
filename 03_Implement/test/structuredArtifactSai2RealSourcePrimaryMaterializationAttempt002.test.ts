import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const PREVIOUS =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-001.json';
const CURRENT =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-002.json';

function j(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, ROOT), 'utf8'),
  );
}

test('attempt 002 retries only ordinal 1 against the same frozen identity', () => {
  const previous = j(PREVIOUS);
  const current = j(CURRENT);

  assert.equal(
    current.predecessor_git_blob_sha,
    '67ec8c18328b9a660e8acfe168e9647ff0b66004',
  );
  assert.deepEqual(
    current.entries.map((entry: any) => entry.source_id),
    previous.entries.map((entry: any) => entry.source_id),
  );

  const before = previous.entries[0];
  const after = current.entries[0];
  assert.equal(after.source_id, 'sai2b-primary-ons-x01');
  assert.equal(
    after.resolved_request_url_or_identity,
    before.resolved_request_url_or_identity,
  );
  assert.equal(after.status, 'transport_retry_pending');
  assert.equal(after.attempt_count, 2);
  assert.equal(after.sha256, null);
  assert.equal(after.byte_size, null);
  assert.equal(
    after.binary_validation,
    'not_run_no_payload_bytes',
  );
  assert.equal(
    after.transport_evidence.binary_capable_transport_retry_attempted,
    true,
  );
  assert.equal(
    after.transport_evidence.container_download_outcome,
    'download_failed_before_payload_available',
  );
  assert.equal(
    after.transport_evidence.runtime_curl_outcome,
    'dns_resolution_failed_before_payload_available',
  );
  assert.equal(
    after.transport_evidence.failure_scope,
    'current_execution_environment_transport',
  );
  assert.equal(
    after.transport_evidence.source_materialization_failure_reason_applied,
    null,
  );

  assert.deepEqual(
    current.entries.slice(1),
    previous.entries.slice(1),
  );
});

test('attempt 002 does not classify source failure, consume reserve, or advance', () => {
  const current = j(CURRENT);

  assert.deepEqual(current.aggregate, {
    primary_count: 16,
    pending_count: 15,
    transport_retry_pending_count: 1,
    succeeded_count: 0,
    failed_count: 0,
    replaced_count: 0,
    source_bytes_opened_count: 0,
    source_digest_count: 0,
    workbook_semantic_inspection_count: 0,
  });
  assert.deepEqual(current.decision, {
    source_failure_classified: false,
    frozen_replacement_reason_invoked: false,
    reserve_materialization_invoked: false,
    advance_to_next_ordinal: false,
    same_frozen_request_retry_required: true,
    acquisition_manifest_freeze_admitted: false,
  });
  assert.equal(
    current.next_gate.name,
    'retry_ordinal_1_same_frozen_request_in_binary_capable_transport',
  );
  assert.equal(
    current.next_gate.advance_to_ordinal_2_admitted,
    false,
  );
  assert.equal(
    current.current_boundary.workbook_semantic_inspection_admitted,
    false,
  );
  assert.equal(
    current.current_boundary.candidate_generation_admitted,
    false,
  );
  assert.equal(
    current.current_boundary.scoring_admitted,
    false,
  );
});
