import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V2 =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const PROTOCOL =
  'structured-artifact-sai2-real-source-primary-materialization-v0.json';
const START =
  'structured-artifact-sai2-real-source-primary-materialization-run-v0-start.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('run start binds exact protocol and discovery artifacts', () => {
  const start = j(START);

  assert.equal(
    start.protocol_git_blob_sha,
    '75d3f47996d1446ef4932d909848082fb4dd14c5',
  );
  assert.equal(
    start.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
  assert.equal(
    start.identity_closure_git_blob_sha,
    'f35659e8674d923174dac2de863e2b130bf2f236',
  );
});

test('run start fixes the exact sixteen primary order from discovery v2', () => {
  const v2 = j(V2);
  const protocol = j(PROTOCOL);
  const start = j(START);

  assert.deepEqual(
    start.entries.map((x: any) => x.source_id),
    v2.primary_sources.map((x: any) => x.source_id),
  );
  assert.deepEqual(
    start.entries.map((x: any) => x.source_id),
    protocol.initial_scope.ordered_primary_source_ids,
  );
  assert.deepEqual(
    start.entries.map((x: any) => x.ordinal),
    Array.from({ length: 16 }, (_, i) => i + 1),
  );
});

test('all run entries are pending and contain no acquisition result before Excel mirror', () => {
  const start = j(START);

  assert.equal(start.entries.length, 16);
  for (const entry of start.entries) {
    assert.equal(entry.status, 'pending');
    assert.equal(entry.attempt_count, 0);
    assert.equal(entry.final_url, null);
    assert.deepEqual(entry.redirect_chain, []);
    assert.equal(entry.http_status, null);
    assert.equal(entry.content_type, null);
    assert.equal(entry.byte_size, null);
    assert.equal(entry.sha256, null);
    assert.equal(entry.retrieved_at_utc, null);
    assert.equal(entry.binary_validation, 'pending');
    assert.equal(entry.workbook_semantic_inspection_performed, false);
  }
  assert.deepEqual(start.aggregate, {
    primary_count: 16,
    pending_count: 16,
    succeeded_count: 0,
    failed_count: 0,
    replaced_count: 0,
    source_bytes_opened_count: 0,
    source_digest_count: 0,
    workbook_semantic_inspection_count: 0,
  });
});

test('run start forbids adaptive order and content-driven changes', () => {
  const start = j(START);

  assert.deepEqual(start.execution_policy, {
    fixed_order: true,
    stop_or_reorder_based_on_content: false,
    semantic_workbook_inspection_during_stage_a: false,
    reserve_materialization_without_frozen_failure: false,
    all_active_primaries_must_finish_before_stage_b: true,
  });
});

test('run start itself does not admit any byte access before exact Excel mirror', () => {
  const start = j(START);

  assert.deepEqual(start.current_boundary, {
    run_started: false,
    exact_excel_run_start_mirror_completed: false,
    source_byte_open_admitted: false,
    workbook_semantic_inspection_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
  assert.equal(
    start.next_gate.name,
    'excel_exact_run_start_mirror_then_execute_stage_a_in_fixed_order',
  );
  assert.equal(start.next_gate.source_byte_open_admitted, false);
  assert.equal(start.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(start.next_gate.candidate_generation_admitted, false);
});
