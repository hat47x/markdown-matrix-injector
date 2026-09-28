import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const ATTEMPT =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';
const HANDOFF =
  'structured-artifact-sai2-real-source-primary-materialization-ordinal-1-offline-handoff-request-v0.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('offline handoff request is bound to authoritative attempt 003 and frozen ordinal 1', () => {
  const attempt = json(ATTEMPT);
  const handoff = json(HANDOFF);
  const current = attempt.entries[0];

  assert.equal(
    handoff.predecessor_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(handoff.predecessor_snapshot_id, attempt.snapshot_id);
  assert.equal(handoff.ordinal, 1);
  assert.equal(handoff.source_id, 'sai2b-primary-ons-x01');
  assert.equal(
    handoff.frozen_request.request_url,
    current.resolved_request_url_or_identity,
  );
  assert.equal(handoff.frozen_request.identity_change_admitted, false);
  assert.equal(handoff.frozen_request.source_set_change_admitted, false);
  assert.equal(handoff.frozen_request.reserve_substitution_admitted, false);
});

test('handoff requests digest-bound receipt without semantic inspection', () => {
  const handoff = json(HANDOFF);

  assert.equal(handoff.acquisition_constraints.raw_response_bytes_required, true);
  assert.equal(handoff.acquisition_constraints.payload_transformation_admitted, false);
  assert.equal(
    handoff.acquisition_constraints.workbook_semantic_inspection_admitted,
    false,
  );
  assert.equal(handoff.acquisition_constraints.worksheet_opening_admitted, false);
  assert.equal(handoff.acquisition_constraints.target_authoring_admitted, false);
  assert.equal(handoff.acquisition_constraints.candidate_generation_admitted, false);
  assert.equal(handoff.acquisition_constraints.feature_capture_admitted, false);
  assert.equal(handoff.acquisition_constraints.scoring_admitted, false);
  assert.equal(handoff.acquisition_constraints.metrics_admitted, false);
  assert.equal(handoff.acquisition_constraints.ordinal_2_admitted, false);

  assert.equal(
    handoff.required_outputs.receipt.schema,
    'hat47x.structured-artifact-sai2-offline-payload-receipt/v0',
  );
  assert.deepEqual(handoff.required_outputs.receipt.required_fields, [
    'schema',
    'source_id',
    'request_url',
    'final_url',
    'redirect_chain',
    'http_status',
    'content_type',
    'byte_size',
    'sha256',
    'retrieved_at_utc',
    'workbook_semantic_inspection_performed',
  ]);
  assert.deepEqual(handoff.required_outputs.receipt.invariants, {
    source_id_must_equal_handoff_source_id: true,
    request_url_must_equal_frozen_request_url: true,
    http_status_must_be_2xx: true,
    content_type_must_be_xlsx_zip_or_octet_stream: true,
    byte_size_must_equal_payload_length: true,
    sha256_must_equal_payload_sha256: true,
    retrieved_at_utc_must_be_parseable_timestamp: true,
    workbook_semantic_inspection_performed_must_be_false: true,
  });
  assert.deepEqual(handoff.helper.required_arguments, [
    '--source-id',
    '--url',
    '--payload-out',
    '--receipt-out',
  ]);
});

test('handoff itself does not claim payload, source failure, reserve use, or ordinal 2 admission', () => {
  const handoff = json(HANDOFF);

  assert.equal(handoff.current_boundary.payload_bytes_present, false);
  assert.equal(handoff.current_boundary.receipt_present, false);
  assert.equal(handoff.current_boundary.source_failure_classified, false);
  assert.equal(handoff.current_boundary.reserve_materialization_invoked, false);
  assert.equal(handoff.current_boundary.ordinal_2_admitted, false);
  assert.equal(
    handoff.current_boundary.semantic_workbook_inspection_admitted,
    false,
  );
  assert.match(
    handoff.downstream_ingest.expected_success_effect,
    /admit only ordinal 2 Stage-A materialization/u,
  );
  assert.match(
    handoff.downstream_ingest.invalid_payload_effect,
    /without classifying source failure/u,
  );
});
