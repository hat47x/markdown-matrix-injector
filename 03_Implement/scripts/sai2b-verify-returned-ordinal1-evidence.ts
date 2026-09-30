import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  advanceProgressSnapshotMetadata,
  applyOutcomeToProgress,
  canonicalProgressRef,
  retryFrozenMaterializationFromBytes,
  type OfflinePayloadReceipt,
  type ProgressEntry,
} from './sai2b-retry-frozen-materialization.js';

type VerificationReport = {
  schema: 'hat47x.structured-artifact-sai2-returned-ordinal1-evidence-verification/v3';
  run_id: string;
  source_id: string;
  baseline_snapshot_id: string;
  returned_snapshot_id: string;
  returned_snapshot_sha256: string;
  payload_sha256: string;
  receipt_sha256: string;
  returned_snapshot_exact_recompute_match: true;
  ordinal_1_succeeded: true;
  ordinal_1_attempt_count: number;
  next_fixed_primary_source_id: string;
  scientific_authority_advanced: false;
  consumer_repository: 'hat47x/markdown-matrix-injector';
  excel_repository_currently_frozen: true;
  excel_repository_access_required: false;
  cross_repo_independent_verification_deferred_until_explicit_unfreeze: true;
  cross_repo_equivalence_claimed: false;
  ordinal_2_admitted_by_verifier: false;
  mmi_success_snapshot_commit_required_before_ordinal_2: true;
  authoritative_baseline_ref_verified: true;
  authoritative_baseline_git_blob_sha_verified: true;
  baseline_object_matches_raw: true;
  predecessor_git_blob_sha_verified: true;
  semantic_stages_admitted: false;
};

const AUTHORITATIVE_BASELINE_SNAPSHOT_ID =
  'sai-2b-real-source-primary-materialization-run-01-attempt-003';
const AUTHORITATIVE_BASELINE_REF =
  '03_Implement/test/fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json';
const AUTHORITATIVE_BASELINE_GIT_BLOB_SHA =
  '0bd83e077beec9825392b44484ff4d6d95026509';

function gitBlobShaText(text: string): string {
  const bytes = Buffer.from(text, 'utf8');
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function sha256Bytes(bytes: Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text: string): string {
  return sha256Bytes(Buffer.from(text, 'utf8'));
}

export function verifyReturnedOrdinal1Evidence(args: {
  baseline: any;
  baselineRaw: string;
  baselineRef: string;
  payload: Uint8Array;
  receipt: OfflinePayloadReceipt;
  returnedSnapshot: any;
  returnedSnapshotRaw?: string;
  receiptRaw?: string;
}): VerificationReport {
  const canonicalBaselineRef = canonicalProgressRef(args.baselineRef);
  if (canonicalBaselineRef !== AUTHORITATIVE_BASELINE_REF) {
    throw new Error(
      'Baseline ref must exactly identify the authoritative attempt-003 fixture.',
    );
  }
  if (
    String(args.baseline.snapshot_id)
    !== AUTHORITATIVE_BASELINE_SNAPSHOT_ID
  ) {
    throw new Error(
      'Baseline snapshot_id must be the authoritative attempt-003 snapshot.',
    );
  }

  let baselineFromRaw: any;
  try {
    baselineFromRaw = JSON.parse(args.baselineRaw);
  } catch {
    throw new Error('Baseline raw bytes must contain valid JSON.');
  }
  if (!isDeepStrictEqual(args.baseline, baselineFromRaw)) {
    throw new Error(
      'Baseline object must exactly match the supplied baselineRaw JSON.',
    );
  }

  const baselineGitBlobSha = gitBlobShaText(args.baselineRaw);
  if (baselineGitBlobSha !== AUTHORITATIVE_BASELINE_GIT_BLOB_SHA) {
    throw new Error(
      'Baseline raw bytes must match the authoritative attempt-003 Git blob.',
    );
  }

  const retryEntries = args.baseline.entries.filter(
    (entry: ProgressEntry) => entry.status === 'transport_retry_pending',
  );
  if (retryEntries.length !== 1) {
    throw new Error(
      'Baseline must contain exactly one transport_retry_pending entry.',
    );
  }

  const baselineEntry = retryEntries[0];
  if (baselineEntry.ordinal !== 1) {
    throw new Error('Returned-evidence verifier is fixed to Stage-A ordinal 1.');
  }

  const outcome = retryFrozenMaterializationFromBytes({
    entry: baselineEntry,
    bytes: args.payload,
    receipt: args.receipt,
  });
  if (outcome.decision !== 'succeeded') {
    throw new Error('Returned ordinal-1 evidence did not recompute to success.');
  }

  const expected = advanceProgressSnapshotMetadata({
    baseline: args.baseline,
    next: applyOutcomeToProgress(args.baseline, outcome),
    baselineRaw: args.baselineRaw,
    baselineRef: args.baselineRef,
  });
  if (!isDeepStrictEqual(args.returnedSnapshot, expected)) {
    throw new Error(
      'Returned snapshot does not exactly match a recomputation from the frozen baseline, payload, and receipt.',
    );
  }

  const ordinal1 = expected.entries.find(
    (entry: ProgressEntry) => entry.ordinal === 1,
  );
  const ordinal2 = expected.entries.find(
    (entry: ProgressEntry) => entry.ordinal === 2,
  );
  if (!ordinal1 || ordinal1.status !== 'succeeded') {
    throw new Error('Recomputed ordinal 1 is not succeeded.');
  }
  if (
    !ordinal2
    || ordinal2.status !== 'pending'
    || expected.next_gate?.name !== 'materialize_next_fixed_primary_ordinal'
    || expected.next_gate?.source_id !== ordinal2.source_id
  ) {
    throw new Error(
      'Ordinal 1 success must open only the fixed ordinal-2 materialization gate.',
    );
  }
  if (
    expected.current_boundary?.source_bytes_opened !== true
    || expected.current_boundary?.source_digests_computed !== true
    || expected.current_boundary?.workbook_semantic_inspection_admitted !== false
    || expected.current_boundary?.target_authoring_admitted !== false
    || expected.current_boundary?.candidate_generation_admitted !== false
    || expected.current_boundary?.scoring_admitted !== false
  ) {
    throw new Error(
      'Returned snapshot current_boundary is inconsistent with ordinal-1 evidence or semantic stop-lines.',
    );
  }
  if (
    expected.decision?.source_failure_classified !== false
    || expected.decision?.reserve_materialization_invoked !== false
  ) {
    throw new Error(
      'Ordinal-1 returned evidence must not classify source failure or consume a reserve.',
    );
  }

  const returnedRaw = args.returnedSnapshotRaw
    ?? JSON.stringify(args.returnedSnapshot) + '\n';
  const receiptRaw = args.receiptRaw
    ?? JSON.stringify(args.receipt) + '\n';

  return {
    schema:
      'hat47x.structured-artifact-sai2-returned-ordinal1-evidence-verification/v3',
    run_id: String(args.baseline.run_id),
    source_id: String(ordinal1.source_id),
    baseline_snapshot_id: String(args.baseline.snapshot_id),
    returned_snapshot_id: String(expected.snapshot_id),
    returned_snapshot_sha256: sha256Text(returnedRaw),
    payload_sha256: sha256Bytes(args.payload),
    receipt_sha256: sha256Text(receiptRaw),
    returned_snapshot_exact_recompute_match: true,
    ordinal_1_succeeded: true,
    ordinal_1_attempt_count: Number(ordinal1.attempt_count),
    next_fixed_primary_source_id: String(ordinal2.source_id),
    scientific_authority_advanced: false,
    consumer_repository: 'hat47x/markdown-matrix-injector',
    excel_repository_currently_frozen: true,
    excel_repository_access_required: false,
    cross_repo_independent_verification_deferred_until_explicit_unfreeze: true,
    cross_repo_equivalence_claimed: false,
    ordinal_2_admitted_by_verifier: false,
    mmi_success_snapshot_commit_required_before_ordinal_2: true,
    authoritative_baseline_ref_verified: true,
    authoritative_baseline_git_blob_sha_verified: true,
    baseline_object_matches_raw: true,
    predecessor_git_blob_sha_verified: true,
    semantic_stages_admitted: false,
  };
}

function parseArgs(argv: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: --baseline <attempt-003.json> --payload-in <xlsx> --receipt-in <json> --snapshot-in <json>',
      );
    }
    result.set(key.slice(2), value);
  }
  return result;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const baselinePath = args.get('baseline');
  const payloadPath = args.get('payload-in');
  const receiptPath = args.get('receipt-in');
  const snapshotPath = args.get('snapshot-in');
  if (!baselinePath || !payloadPath || !receiptPath || !snapshotPath) {
    throw new Error(
      'Usage: --baseline <attempt-003.json> --payload-in <xlsx> --receipt-in <json> --snapshot-in <json>',
    );
  }

  const baselineRaw = readFileSync(resolve(baselinePath), 'utf8');
  const receiptRaw = readFileSync(resolve(receiptPath), 'utf8');
  const returnedRaw = readFileSync(resolve(snapshotPath), 'utf8');
  const report = verifyReturnedOrdinal1Evidence({
    baseline: JSON.parse(baselineRaw),
    baselineRaw,
    baselineRef: canonicalProgressRef(baselinePath),
    payload: new Uint8Array(readFileSync(resolve(payloadPath))),
    receipt: JSON.parse(receiptRaw),
    returnedSnapshot: JSON.parse(returnedRaw),
    returnedSnapshotRaw: returnedRaw,
    receiptRaw,
  });
  process.stdout.write(JSON.stringify(report) + '\n');
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
