import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const START =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-start.json';
const ATTEMPT =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-001.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('attempt 001 advances only ordinal 1 from the frozen run start', () => {
  const start = j(START);
  const attempt = j(ATTEMPT);

  assert.equal(
    attempt.predecessor_git_blob_sha,
    'c33730f9283cea413befa3adfe83514d44419532',
  );
  assert.equal(attempt.entries.length, 16);
  assert.deepEqual(
    attempt.entries.map((x: any) => x.source_id),
    start.entries.map((x: any) => x.source_id),
  );

  assert.equal(
    attempt.entries[0].source_id,
    'sai2b-primary-ons-x01',
  );
  assert.equal(
    attempt.entries[0].status,
    'transport_retry_pending',
  );
  assert.equal(attempt.entries[0].attempt_count, 1);
  assert.equal(attempt.entries[0].sha256, null);
  assert.equal(
    attempt.entries[0].transport_evidence.failure_scope,
    'current_execution_environment_transport',
  );
  assert.equal(
    attempt.entries[0].transport_evidence
      .source_materialization_failure_reason_applied,
    null,
  );

  for (const entry of attempt.entries.slice(1)) {
    assert.equal(entry.status, 'pending');
    assert.equal(entry.attempt_count, 0);
    assert.equal(entry.sha256, null);
  }
});

test('transport failure does not invoke source replacement or consume a reserve', () => {
  const attempt = j(ATTEMPT);

  assert.deepEqual(attempt.decision, {
    source_failure_classified: false,
    frozen_replacement_reason_invoked: false,
    reserve_materialization_invoked: false,
    advance_to_next_ordinal: false,
    same_frozen_request_retry_required: true,
    acquisition_manifest_freeze_admitted: false,
  });
  assert.deepEqual(attempt.aggregate, {
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
});

test('ordinal 2 and semantic review remain closed until ordinal 1 resolves', () => {
  const attempt = j(ATTEMPT);

  assert.deepEqual(attempt.current_boundary, {
    run_started: true,
    exact_excel_run_start_mirror_completed: true,
    source_bytes_opened: false,
    source_digests_computed: false,
    workbook_semantic_inspection_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
  assert.deepEqual(attempt.next_gate, {
    name:
      'retry_ordinal_1_same_frozen_request_in_binary_capable_transport',
    source_id: 'sai2b-primary-ons-x01',
    source_set_change_admitted: false,
    reserve_substitution_admitted: false,
    advance_to_ordinal_2_admitted: false,
    workbook_semantic_inspection_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
