import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  advanceProgressSnapshotMetadata,
  applyOutcomeToProgress,
  canonicalProgressRef,
  retryFrozenMaterializationFromBytes,
  type OfflinePayloadReceipt,
  type ProgressEntry,
} from '../scripts/sai2b-retry-frozen-materialization.js';
import {
  verifyReturnedOrdinal1Evidence,
} from '../scripts/sai2b-verify-returned-ordinal1-evidence.js';

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

function entry(ordinal: number, status: string): ProgressEntry {
  return {
    ordinal,
    source_id: ordinal === 1 ? 'sai2b-primary-ons-x01' : 'ordinal-2',
    publisher_id: ordinal === 1 ? 'ons' : 'other',
    requested_stratum: 'clear_single_primary_table',
    status,
    attempt_count: ordinal === 1 ? 3 : 0,
    resolved_request_url_or_identity:
      ordinal === 1 ? 'https://example.test/frozen.xlsx' : null,
    final_url: null,
    redirect_chain: [],
    http_status: null,
    content_type: null,
    byte_size: null,
    sha256: null,
    retrieved_at_utc: null,
    binary_validation: ordinal === 1
      ? 'not_run_no_payload_bytes'
      : 'pending',
    workbook_semantic_inspection_performed: false,
  };
}

function baseline(): any {
  return {
    run_id: 'sai-2b-real-source-primary-materialization-run-01',
    snapshot_id:
      'sai-2b-real-source-primary-materialization-run-01-attempt-003',
    entries: [
      entry(1, 'transport_retry_pending'),
      entry(2, 'pending'),
    ],
    aggregate: {
      pending_count: 1,
      transport_retry_pending_count: 1,
      succeeded_count: 0,
      failed_count: 0,
      source_bytes_opened_count: 0,
      source_digest_count: 0,
      workbook_semantic_inspection_count: 0,
    },
    current_boundary: {
      source_bytes_opened: false,
      source_digests_computed: false,
      workbook_semantic_inspection_admitted: false,
      target_authoring_admitted: false,
      candidate_generation_admitted: false,
      scoring_admitted: false,
    },
  };
}

function receipt(bytes: Uint8Array): OfflinePayloadReceipt {
  return {
    schema:
      'hat47x.structured-artifact-sai2-offline-payload-receipt/v0',
    source_id: 'sai2b-primary-ons-x01',
    request_url: 'https://example.test/frozen.xlsx',
    final_url: 'https://example.test/frozen.xlsx',
    redirect_chain: [],
    http_status: 200,
    content_type:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: bytes.byteLength,
    sha256:
      'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    retrieved_at_utc: '2026-09-29T13:00:00Z',
    workbook_semantic_inspection_performed: false,
  };
}

function returnedEvidence() {
  const b = baseline();
  const bytes = xlsxFrame();
  const r = receipt(bytes);
  const outcome = retryFrozenMaterializationFromBytes({
    entry: b.entries[0],
    bytes,
    receipt: r,
  });
  const baselineRaw = JSON.stringify(b) + '\n';
  const baselineRef =
    '03_Implement/test/fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';
  return {
    baseline: b,
    baselineRaw,
    baselineRef,
    bytes,
    receipt: r,
    snapshot: advanceProgressSnapshotMetadata({
      baseline: b,
      next: applyOutcomeToProgress(b, outcome),
      baselineRaw,
      baselineRef,
    }),
  };
}

test('verifier accepts exact network-free recomputation and preserves stop-lines', () => {
  const evidence = returnedEvidence();
  const report = verifyReturnedOrdinal1Evidence({
    baseline: evidence.baseline,
    baselineRaw: evidence.baselineRaw,
    baselineRef: evidence.baselineRef,
    payload: evidence.bytes,
    receipt: evidence.receipt,
    returnedSnapshot: evidence.snapshot,
  });

  assert.equal(report.returned_snapshot_exact_recompute_match, true);
  assert.equal(report.ordinal_1_succeeded, true);
  assert.equal(report.ordinal_1_attempt_count, 4);
  assert.equal(evidence.snapshot.snapshot_id,
    'sai-2b-real-source-primary-materialization-run-01-attempt-004');
  assert.equal(
    evidence.snapshot.predecessor_ref,
    evidence.baselineRef,
  );
  assert.match(
    evidence.snapshot.predecessor_git_blob_sha,
    /^[0-9a-f]{40}$/u,
  );
  assert.equal(report.next_fixed_primary_source_id, 'ordinal-2');
  assert.equal(report.scientific_authority_advanced, false);
  assert.equal(
    report.consumer_repository,
    'hat47x/markdown-matrix-injector',
  );
  assert.equal(report.excel_repository_currently_frozen, true);
  assert.equal(report.excel_repository_access_required, false);
  assert.equal(
    report.cross_repo_independent_verification_deferred_until_explicit_unfreeze,
    true,
  );
  assert.equal(report.cross_repo_equivalence_claimed, false);
  assert.equal(report.ordinal_2_admitted_by_verifier, false);
  assert.equal(
    report.mmi_success_snapshot_commit_required_before_ordinal_2,
    true,
  );
  assert.equal(report.semantic_stages_admitted, false);
});

test('verifier rejects any returned snapshot drift', () => {
  const evidence = returnedEvidence();
  const drifted = structuredClone(evidence.snapshot);
  drifted.entries[0].byte_size += 1;

  assert.throws(
    () => verifyReturnedOrdinal1Evidence({
      baseline: evidence.baseline,
      baselineRaw: evidence.baselineRaw,
      baselineRef: evidence.baselineRef,
      payload: evidence.bytes,
      receipt: evidence.receipt,
      returnedSnapshot: drifted,
    }),
    /does not exactly match a recomputation/u,
  );
});

test('verifier rejects attempts to open semantic stages', () => {
  const evidence = returnedEvidence();
  const drifted = structuredClone(evidence.snapshot);
  drifted.current_boundary.target_authoring_admitted = true;

  assert.throws(
    () => verifyReturnedOrdinal1Evidence({
      baseline: evidence.baseline,
      baselineRaw: evidence.baselineRaw,
      baselineRef: evidence.baselineRef,
      payload: evidence.bytes,
      receipt: evidence.receipt,
      returnedSnapshot: drifted,
    }),
    /does not exactly match a recomputation/u,
  );
});


test('progress predecessor refs canonicalize Windows and POSIX paths identically', () => {
  assert.equal(
    canonicalProgressRef(
      'C:\\work\\repo\\03_Implement\\test\\fixtures\\attempt-003.json',
    ),
    '03_Implement/test/fixtures/attempt-003.json',
  );
  assert.equal(
    canonicalProgressRef('/tmp/attempt-003.json'),
    'attempt-003.json',
  );
});
