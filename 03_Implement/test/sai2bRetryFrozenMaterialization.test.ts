import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOutcomeToProgress,
  retryFrozenMaterialization,
  validateZipContainer,
  type ProgressEntry,
} from '../scripts/sai2b-retry-frozen-materialization.js';

function entry(): ProgressEntry {
  return {
    ordinal: 1,
    source_id: 'sai2b-primary-ons-x01',
    publisher_id: 'ons',
    requested_stratum: 'clear_single_primary_table',
    status: 'transport_retry_pending',
    attempt_count: 1,
    resolved_request_url_or_identity:
      'https://example.test/frozen.xlsx',
    final_url: null,
    redirect_chain: [],
    http_status: null,
    content_type:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: null,
    sha256: null,
    retrieved_at_utc: null,
    binary_validation: 'not_run_no_payload_bytes',
    workbook_semantic_inspection_performed: false,
  };
}

function tinyZip(): Uint8Array {
  const bytes = new Uint8Array(30 + 46 + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint32(30, 0x02014b50, true);
  const eocd = 76;
  view.setUint32(eocd, 0x06054b50, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 12, 46, true);
  view.setUint32(eocd + 16, 30, true);
  return bytes;
}

test('ZIP validation is structural only and accepts a minimal readable container', () => {
  assert.deepEqual(validateZipContainer(tinyZip()), { ok: true });
  assert.equal(validateZipContainer(new Uint8Array(10)).ok, false);
});

test('retry uses the exact frozen URL and records a successful binary hash', async () => {
  const seen: string[] = [];
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    now: () => '2026-09-28T00:00:00.000Z',
    fetchImpl: async (url) => {
      seen.push(url);
      return new Response(tinyZip(), {
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    },
  });

  assert.deepEqual(seen, ['https://example.test/frozen.xlsx']);
  assert.equal(outcome.decision, 'succeeded');
  assert.equal(outcome.entry.status, 'succeeded');
  assert.equal(outcome.entry.attempt_count, 2);
  assert.equal(outcome.entry.byte_size, tinyZip().byteLength);
  assert.match(outcome.entry.sha256 ?? '', /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    outcome.entry.binary_validation,
    'pass_zip_container_structure_without_semantic_worksheet_inspection',
  );
  assert.equal(outcome.entry.workbook_semantic_inspection_performed, false);
});

test('execution-environment transport exception remains retry-pending', async () => {
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    fetchImpl: async () => {
      throw new TypeError('network unavailable');
    },
  });

  assert.equal(outcome.decision, 'transport_retry_pending');
  assert.equal(outcome.entry.status, 'transport_retry_pending');
  assert.equal(outcome.entry.sha256, null);
  assert.equal(
    outcome.entry.transport_evidence
      ?.source_materialization_failure_reason_applied,
    null,
  );
});

test('HTTP failure is classified but never auto-consumes a reserve', async () => {
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    fetchImpl: async () =>
      new Response('gone', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      }),
  });
  const progress = {
    entries: [
      entry(),
      {
        ...entry(),
        ordinal: 2,
        source_id: 'second',
        status: 'pending',
        attempt_count: 0,
        resolved_request_url_or_identity: null,
      },
    ],
    aggregate: {},
  };

  assert.equal(outcome.decision, 'materialization_failure');
  assert.equal(
    outcome.entry.materialization_failure_reason,
    'frozen_identity_unresolvable_or_http_unavailable',
  );

  const next = applyOutcomeToProgress(progress, outcome);
  assert.equal(next.decision.source_failure_classified, true);
  assert.equal(next.decision.frozen_replacement_reason_invoked, true);
  assert.equal(next.decision.reserve_materialization_invoked, false);
  assert.equal(next.decision.advance_to_next_ordinal, false);
});

test('successful retry opens only the next fixed Stage-A ordinal', async () => {
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    fetchImpl: async () =>
      new Response(tinyZip(), { status: 200 }),
  });
  const progress = {
    entries: [
      entry(),
      {
        ...entry(),
        ordinal: 2,
        source_id: 'second',
        status: 'pending',
        attempt_count: 0,
        resolved_request_url_or_identity: null,
      },
    ],
    aggregate: {},
  };

  const next = applyOutcomeToProgress(progress, outcome);
  assert.equal(next.aggregate.succeeded_count, 1);
  assert.equal(next.aggregate.pending_count, 1);
  assert.equal(next.aggregate.source_bytes_opened_count, 1);
  assert.equal(next.aggregate.workbook_semantic_inspection_count, 0);
  assert.equal(next.next_gate.name, 'materialize_next_fixed_primary_ordinal');
  assert.equal(next.next_gate.source_id, 'second');
  assert.equal(next.next_gate.candidate_generation_admitted, false);
  assert.equal(next.next_gate.scoring_admitted, false);
});
