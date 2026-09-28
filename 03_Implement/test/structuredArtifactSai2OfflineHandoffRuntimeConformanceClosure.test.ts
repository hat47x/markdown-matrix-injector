import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const CLOSURE =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v0.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

function gitBlobSha(bytes: Buffer): string {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`);
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function blob(path: URL): string {
  return gitBlobSha(readFileSync(path));
}

test('runtime conformance closure is bound to current MMI handoff artifacts', () => {
  const closure = json(CLOSURE);

  assert.equal(
    blob(new URL(
      './fixtures/structured-artifact-sai2-real-source-primary-materialization-ordinal-1-offline-handoff-request-v0.json',
      import.meta.url,
    )),
    closure.authoritative_common_artifacts.handoff_request.git_blob_sha,
  );
  assert.equal(
    blob(new URL(
      './fixtures/structured-artifact-sai2-offline-payload-receipt-schema-v0.json',
      import.meta.url,
    )),
    closure.authoritative_common_artifacts.receipt_schema.git_blob_sha,
  );
  assert.equal(
    blob(new URL(
      './fixtures/structured-artifact-sai2-offline-handoff-readiness-closure-v0.json',
      import.meta.url,
    )),
    closure.authoritative_common_artifacts.readiness_closure.git_blob_sha,
  );
  assert.equal(
    blob(new URL('../scripts/sai2b-fetch-frozen-payload.mts', import.meta.url)),
    closure.runtime_bindings.markdown_matrix_injector.fetch_helper.git_blob_sha,
  );
  assert.equal(
    blob(new URL('../scripts/sai2b-retry-frozen-materialization.ts', import.meta.url)),
    closure.runtime_bindings.markdown_matrix_injector.ingest_runner.git_blob_sha,
  );
});

test('runtime conformance closure freezes strict receipt acceptance before bytes', () => {
  const closure = json(CLOSURE);
  const c = closure.conformance;

  assert.equal(c.receipt_exact_field_set_required, true);
  assert.equal(c.final_url_https_required, true);
  assert.equal(c.redirect_chain_https_and_admitted_status_only, true);
  assert.equal(c.redirect_chain_max_items, 10);
  assert.equal(c.http_status_strict_integer_2xx_required, true);
  assert.equal(c.byte_size_exact_payload_match_required, true);
  assert.equal(c.sha256_exact_payload_match_required, true);
  assert.equal(c.retrieved_at_utc_z_required, true);
  assert.equal(
    c.workbook_semantic_inspection_performed_must_be_false,
    true,
  );
  assert.equal(c.ooxml_package_validation_before_success, true);
  assert.equal(
    c.invalid_offline_handoff_does_not_classify_source_failure,
    true,
  );
});

test('closure admits only external binary fetch and no scientific advance', () => {
  const closure = json(CLOSURE);

  assert.equal(closure.current_evidence.payload_bytes_present, false);
  assert.equal(closure.current_evidence.source_digest_present, false);
  assert.equal(closure.current_evidence.source_failure_classified, false);
  assert.equal(closure.current_evidence.reserve_consumed, false);
  assert.equal(closure.current_evidence.ordinal_2_admitted, false);
  assert.equal(closure.change_control.pre_byte_handoff_contract_closed, true);
  assert.equal(
    closure.change_control.additional_pre_byte_contract_change_requires_concrete_defect,
    true,
  );
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
