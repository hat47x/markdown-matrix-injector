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

test('handoff requests raw bytes plus transport receipt without semantic inspection', () => {
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

  assert.deepEqual(handoff.required_outputs.receipt.required_fields, [
    'request_url',
    'final_url',
    'redirect_chain',
    'http_status',
    'content_type',
    'retrieved_at_utc',
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
