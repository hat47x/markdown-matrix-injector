import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  advanceProgressSnapshotMetadata,
  applyOutcomeToProgress,
  canonicalProgressRef,
  retryFrozenMaterializationFromBytes,
  type OfflinePayloadReceipt,
} from '../scripts/sai2b-retry-frozen-materialization.js';
import {
  verifyReturnedOrdinal1Evidence,
} from '../scripts/sai2b-verify-returned-ordinal1-evidence.js';

const BASELINE_URL = new URL(
  './fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json',
  import.meta.url,
);
const BASELINE_REF =
  '03_Implement/test/fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';

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

function authoritativeBaseline(): { raw: string; parsed: any } {
  const raw = readFileSync(BASELINE_URL, 'utf8');
  return {
    raw,
    parsed: JSON.parse(raw),
  };
}

function receipt(
  bytes: Uint8Array,
  baseline: any,
): OfflinePayloadReceipt {
  const ordinal1 = baseline.entries.find(
    (entry: any) => entry.ordinal === 1,
  );
  return {
    schema:
      'hat47x.structured-artifact-sai2-offline-payload-receipt/v0',
    source_id: ordinal1.source_id,
    request_url: ordinal1.resolved_request_url_or_identity,
    final_url: ordinal1.resolved_request_url_or_identity,
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
  const baseline = authoritativeBaseline();
  const bytes = xlsxFrame();
  const r = receipt(bytes, baseline.parsed);
  const outcome = retryFrozenMaterializationFromBytes({
    entry: baseline.parsed.entries[0],
    bytes,
    receipt: r,
  });
  return {
    baseline: baseline.parsed,
    baselineRaw: baseline.raw,
    baselineRef: BASELINE_REF,
    bytes,
    receipt: r,
    snapshot: advanceProgressSnapshotMetadata({
      baseline: baseline.parsed,
      next: applyOutcomeToProgress(baseline.parsed, outcome),
      baselineRaw: baseline.raw,
      baselineRef: BASELINE_REF,
    }),
  };
}

test('verifier accepts exact authoritative baseline recomputation', () => {
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
  assert.equal(report.authoritative_baseline_ref_verified, true);
  assert.equal(report.authoritative_baseline_git_blob_sha_verified, true);
  assert.equal(report.baseline_object_matches_raw, true);
  assert.equal(report.ordinal_1_succeeded, true);
  assert.equal(report.ordinal_1_attempt_count, 4);
  assert.equal(
    report.returned_snapshot_id,
    'sai-2b-real-source-primary-materialization-run-01-attempt-004',
  );
  assert.equal(
    evidence.snapshot.predecessor_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    report.next_fixed_primary_source_id,
    'sai2b-primary-abs-lf-table001',
  );
  assert.equal(report.scientific_authority_advanced, false);
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

test('verifier rejects baseline raw bytes outside authoritative Git blob', () => {
  const evidence = returnedEvidence();

  assert.throws(
    () => verifyReturnedOrdinal1Evidence({
      baseline: evidence.baseline,
      baselineRaw: evidence.baselineRaw + '\n',
      baselineRef: evidence.baselineRef,
      payload: evidence.bytes,
      receipt: evidence.receipt,
      returnedSnapshot: evidence.snapshot,
    }),
    /authoritative attempt-003 Git blob/u,
  );
});

test('verifier rejects parsed baseline that differs from baselineRaw', () => {
  const evidence = returnedEvidence();
  const driftedBaseline = structuredClone(evidence.baseline);
  driftedBaseline.aggregate.pending_count += 1;

  assert.throws(
    () => verifyReturnedOrdinal1Evidence({
      baseline: driftedBaseline,
      baselineRaw: evidence.baselineRaw,
      baselineRef: evidence.baselineRef,
      payload: evidence.bytes,
      receipt: evidence.receipt,
      returnedSnapshot: evidence.snapshot,
    }),
    /exactly match the supplied baselineRaw JSON/u,
  );
});

test('verifier rejects non-authoritative baseline ref', () => {
  const evidence = returnedEvidence();

  assert.throws(
    () => verifyReturnedOrdinal1Evidence({
      baseline: evidence.baseline,
      baselineRaw: evidence.baselineRaw,
      baselineRef: 'attempt-003.json',
      payload: evidence.bytes,
      receipt: evidence.receipt,
      returnedSnapshot: evidence.snapshot,
    }),
    /authoritative attempt-003 fixture/u,
  );
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

test('progress predecessor refs canonicalize Windows and POSIX paths', () => {
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
