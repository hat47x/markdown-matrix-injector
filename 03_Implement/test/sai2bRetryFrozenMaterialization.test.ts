import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  applyOutcomeToProgress,
  retryFrozenMaterialization,
  retryFrozenMaterializationFromBytes,
  validateZipContainer,
  type OfflinePayloadReceipt,
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

function xlsxFrame(): Uint8Array {
  const names = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
  ];
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    localOffset += local.length;
  }

  const centralSize = centrals.reduce(
    (sum, part) => sum + part.length,
    0,
  );
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, names.length, true);
  eocdView.setUint16(10, names.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, localOffset, true);

  const output = new Uint8Array(
    localOffset + centralSize + eocd.length,
  );
  let offset = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

test('XLSX validation requires OOXML package entries without worksheet semantics', () => {
  assert.deepEqual(validateZipContainer(xlsxFrame()), { ok: true });
  assert.equal(validateZipContainer(new Uint8Array(10)).ok, false);

  const generic = xlsxFrame();
  const marker = Buffer.from('xl/workbook.xml');
  const markerOffset = Buffer.from(generic).lastIndexOf(marker);
  generic.set(Buffer.alloc(marker.length, 0x78), markerOffset);
  assert.equal(validateZipContainer(generic).ok, false);
});

test('retry uses the exact frozen URL and records a successful binary hash', async () => {
  const seen: string[] = [];
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    now: () => '2026-09-28T00:00:00.000Z',
    fetchImpl: async (url) => {
      seen.push(url);
      return new Response(xlsxFrame(), {
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
  assert.equal(outcome.entry.byte_size, xlsxFrame().byteLength);
  assert.match(outcome.entry.sha256 ?? '', /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    outcome.entry.binary_validation,
    'pass_xlsx_package_entries_without_semantic_worksheet_inspection',
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
      new Response(xlsxFrame(), { status: 200 }),
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


function offlineReceipt(
  requestUrl = 'https://example.test/frozen.xlsx',
  bytes = xlsxFrame(),
): OfflinePayloadReceipt {
  return {
    schema:
      'hat47x.structured-artifact-sai2-offline-payload-receipt/v0',
    source_id: 'sai2b-primary-ons-x01',
    request_url: requestUrl,
    final_url: requestUrl,
    redirect_chain: [],
    http_status: 200,
    content_type:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: bytes.byteLength,
    sha256:
      'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    retrieved_at_utc: '2026-09-28T03:00:00.000Z',
    workbook_semantic_inspection_performed: false,
  };
}

test('offline handoff hashes a validated payload only when receipt matches the frozen request', () => {
  const outcome = retryFrozenMaterializationFromBytes({
    entry: entry(),
    bytes: xlsxFrame(),
    receipt: offlineReceipt(),
  });

  assert.equal(outcome.decision, 'succeeded');
  assert.equal(outcome.entry.status, 'succeeded');
  assert.equal(outcome.entry.attempt_count, 2);
  assert.equal(outcome.entry.final_url, 'https://example.test/frozen.xlsx');
  assert.equal(outcome.entry.http_status, 200);
  assert.equal(outcome.entry.byte_size, xlsxFrame().byteLength);
  assert.match(outcome.entry.sha256 ?? '', /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    outcome.entry.transport_evidence?.acquisition_mode,
    'offline_handoff_receipt',
  );
  assert.equal(
    outcome.entry.transport_evidence?.receipt_source_id_verified,
    true,
  );
  assert.equal(
    outcome.entry.transport_evidence?.receipt_request_url_verified,
    true,
  );
  assert.equal(
    outcome.entry.transport_evidence?.receipt_payload_digest_verified,
    true,
  );
  assert.equal(
    outcome.entry.transport_evidence
      ?.receipt_semantic_inspection_absent_verified,
    true,
  );
  assert.equal(outcome.entry.workbook_semantic_inspection_performed, false);
});

test('offline handoff rejects a receipt for any URL other than the frozen request', () => {
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: xlsxFrame(),
      receipt: offlineReceipt('https://example.test/other.xlsx'),
    }),
    /exactly match the frozen request URL/u,
  );
});

test('offline handoff rejects receipt identity and digest mismatches without source failure', () => {
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: xlsxFrame(),
      receipt: {
        ...offlineReceipt(),
        source_id: 'other-source',
      },
    }),
    /source_id must exactly match/u,
  );
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: xlsxFrame(),
      receipt: {
        ...offlineReceipt(),
        byte_size: xlsxFrame().byteLength + 1,
      },
    }),
    /byte_size must exactly match/u,
  );
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: xlsxFrame(),
      receipt: {
        ...offlineReceipt(),
        sha256: 'sha256:' + '0'.repeat(64),
      },
    }),
    /sha256 must exactly match/u,
  );
});

test('offline handoff rejects semantic inspection and invalid bytes without source failure', () => {
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: xlsxFrame(),
      receipt: {
        ...offlineReceipt(),
        workbook_semantic_inspection_performed: true,
      } as unknown as OfflinePayloadReceipt,
    }),
    /semantic inspection was not performed/u,
  );

  const invalid = new Uint8Array([1, 2, 3]);
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: invalid,
      receipt: offlineReceipt(
        'https://example.test/frozen.xlsx',
        invalid,
      ),
    }),
    /without classifying a source failure/u,
  );
});
