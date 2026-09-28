import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-readiness-closure-v0.json';
const ATTEMPT =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';
const HANDOFF =
  'structured-artifact-sai2-real-source-primary-materialization-ordinal-1-offline-handoff-request-v0.json';
const RECEIPT_SCHEMA =
  'structured-artifact-sai2-offline-payload-receipt-schema-v0.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('offline handoff readiness pins exact authoritative contract blobs', () => {
  const closure = json(CLOSURE);
  const attemptText = readFileSync(new URL(ATTEMPT, FIXTURES), 'utf8');
  const handoffText = readFileSync(new URL(HANDOFF, FIXTURES), 'utf8');
  const receiptSchemaText =
    readFileSync(new URL(RECEIPT_SCHEMA, FIXTURES), 'utf8');

  assert.equal(
    closure.authoritative_artifacts.progress_snapshot.git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    closure.authoritative_artifacts.handoff_request.git_blob_sha,
    'c6ad1d41dab20529374b5abc9c11e196c0f97375',
  );
  assert.equal(
    closure.authoritative_artifacts.receipt_schema.git_blob_sha,
    '93ca5274c2e43ea864dae97a5de334b4513136fd',
  );
  assert.equal(json(ATTEMPT).snapshot_id,
    closure.authoritative_artifacts.progress_snapshot.id);
  assert.equal(json(HANDOFF).request_id,
    closure.authoritative_artifacts.handoff_request.id);
  assert.equal(
    json(RECEIPT_SCHEMA).properties.schema.const,
    closure.authoritative_artifacts.receipt_schema.schema_id,
  );
  assert.ok(attemptText.length > 0);
  assert.ok(handoffText.length > 0);
  assert.ok(receiptSchemaText.length > 0);
});

test('readiness closure keeps Stage-A scientific gates closed', () => {
  const closure = json(CLOSURE);

  assert.equal(closure.ordinal, 1);
  assert.equal(closure.source_id, 'sai2b-primary-ons-x01');
  assert.equal(closure.status, 'ready_for_external_binary_fetch_only');
  assert.equal(closure.current_evidence.payload_bytes_present, false);
  assert.equal(closure.current_evidence.source_digest_present, false);
  assert.equal(closure.current_evidence.source_failure_classified, false);
  assert.equal(closure.current_evidence.reserve_consumed, false);
  assert.equal(closure.current_evidence.ordinal_2_admitted, false);
  assert.equal(closure.admission.external_binary_fetch, true);
  assert.equal(closure.admission.source_identity_change, false);
  assert.equal(closure.admission.reserve_substitution, false);
  assert.equal(closure.admission.ordinal_2_before_success, false);
  assert.equal(closure.admission.workbook_semantic_inspection, false);
  assert.equal(closure.admission.target_authoring, false);
  assert.equal(closure.admission.candidate_generation, false);
  assert.equal(closure.admission.feature_capture, false);
  assert.equal(closure.admission.scoring, false);
  assert.equal(closure.admission.metrics, false);
});

test('closure requires only exact payload and receipt outputs', () => {
  const closure = json(CLOSURE);

  assert.deepEqual(closure.required_external_outputs, [
    'sai2b-primary-ons-x01.xlsx',
    'sai2b-primary-ons-x01.receipt.json',
  ]);
  assert.match(closure.next_success_condition, /receipt schema/u);
  assert.match(closure.next_success_condition, /SHA-256/u);
  assert.match(closure.invalid_handoff_effect, /reject input only/u);
});
