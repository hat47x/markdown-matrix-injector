import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type ProgressEntry = {
  ordinal: number;
  source_id: string;
  publisher_id: string;
  requested_stratum: string;
  status: string;
  attempt_count: number;
  resolved_request_url_or_identity: string | null;
  final_url: string | null;
  redirect_chain: unknown[];
  http_status: number | null;
  content_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  retrieved_at_utc: string | null;
  binary_validation: string;
  workbook_semantic_inspection_performed: false;
  transport_evidence?: Record<string, unknown>;
  materialization_failure_reason?: string | null;
};

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type MaterializeOutcome = {
  entry: ProgressEntry;
  bytes: Uint8Array | null;
  decision:
    | 'succeeded'
    | 'transport_retry_pending'
    | 'materialization_failure';
};

export type OfflinePayloadReceipt = {
  schema: 'hat47x.structured-artifact-sai2-offline-payload-receipt/v0';
  source_id: string;
  request_url: string;
  final_url: string;
  redirect_chain: unknown[];
  http_status: number;
  content_type: string;
  byte_size: number;
  sha256: string;
  retrieved_at_utc: string;
  workbook_semantic_inspection_performed: false;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;
export const OFFLINE_PAYLOAD_RECEIPT_SCHEMA =
  'hat47x.structured-artifact-sai2-offline-payload-receipt/v0' as const;
const FROZEN_CONTENT_TYPE_PATTERN =
  /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/zip|application\/octet-stream)(?:\s*;.*)?$/u;

function isFrozenContentType(value: unknown): value is string {
  return typeof value === 'string'
    && FROZEN_CONTENT_TYPE_PATTERN.test(value);
}

const FROZEN_UTC_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

function isFrozenUtcDateTime(value: unknown): value is string {
  return typeof value === 'string'
    && FROZEN_UTC_DATETIME_PATTERN.test(value)
    && !Number.isNaN(Date.parse(value));
}
const OFFLINE_RECEIPT_FIELDS = [
  'schema',
  'source_id',
  'request_url',
  'final_url',
  'redirect_chain',
  'http_status',
  'content_type',
  'byte_size',
  'sha256',
  'retrieved_at_utc',
  'workbook_semantic_inspection_performed',
] as const;

function isHttpsUrl(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || !value.startsWith('https://')
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isSchemaConformantRedirectChain(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_REDIRECTS) {
    return false;
  }
  return value.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.length !== 3
      || keys[0] !== 'from'
      || keys[1] !== 'status'
      || keys[2] !== 'to'
    ) {
      return false;
    }
    return REDIRECT_STATUSES.has(record.status as number)
      && isHttpsUrl(record.from)
      && isHttpsUrl(record.to);
  });
}

function assertOfflineReceiptSchemaShape(
  receipt: OfflinePayloadReceipt,
): void {
  const keys = Object.keys(receipt).sort();
  const expected = [...OFFLINE_RECEIPT_FIELDS].sort();
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      'Offline receipt must contain exactly the frozen schema fields.',
    );
  }
  if (!isHttpsUrl(receipt.final_url)) {
    throw new Error('Offline receipt final_url must be an HTTPS URL.');
  }
  if (!isSchemaConformantRedirectChain(receipt.redirect_chain)) {
    throw new Error(
      'Offline receipt redirect_chain must match the frozen schema.',
    );
  }
  if (!isFrozenUtcDateTime(receipt.retrieved_at_utc)) {
    throw new Error(
      'Offline receipt retrieved_at_utc must be a valid UTC Z timestamp.',
    );
  }
}


function assertOfflineReceiptRedirectProvenance(
  receipt: OfflinePayloadReceipt,
): void {
  let expectedFrom = receipt.request_url;
  for (const hop of receipt.redirect_chain as Array<{
    status: number;
    from: string;
    to: string;
  }>) {
    if (hop.from !== expectedFrom) {
      throw new Error(
        'Offline receipt redirect_chain must be continuous from the frozen request URL.',
      );
    }
    expectedFrom = hop.to;
  }
  if (receipt.final_url !== expectedFrom) {
    throw new Error(
      'Offline receipt final_url must equal the terminal frozen redirect URL.',
    );
  }
}

export async function retryFrozenMaterialization(args: {
  entry: ProgressEntry;
  fetchImpl?: FetchLike;
  now?: () => string;
}): Promise<MaterializeOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? (() => new Date().toISOString());
  const entry = structuredClone(args.entry);

  if (
    entry.status !== 'transport_retry_pending'
    || !entry.resolved_request_url_or_identity
  ) {
    throw new Error(
      'Stage-A retry requires a transport_retry_pending entry with a frozen request URL.',
    );
  }

  entry.attempt_count += 1;
  entry.redirect_chain = [];
  entry.final_url = null;
  entry.http_status = null;
  entry.content_type = null;
  entry.byte_size = null;
  entry.sha256 = null;
  entry.retrieved_at_utc = null;
  entry.binary_validation = 'pending';
  entry.workbook_semantic_inspection_performed = false;
  delete entry.materialization_failure_reason;

  let response: Response;
  let currentUrl = entry.resolved_request_url_or_identity;

  try {
    if (!isHttpsUrl(currentUrl)) {
      throw new Error('frozen_request_non_https_url');
    }
    for (let index = 0; ; index += 1) {
      response = await fetchImpl(currentUrl, {
        redirect: 'manual',
        headers: {
          accept:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/zip, application/octet-stream;q=0.9, */*;q=0.1',
        },
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        break;
      }
      if (index >= MAX_REDIRECTS) {
        throw new Error('redirect_limit_exceeded');
      }

      const location = response.headers.get('location');
      if (!location) {
        return materializationFailure(
          entry,
          response.status,
          response.headers.get('content-type'),
          'frozen_identity_unresolvable_or_http_unavailable',
        );
      }
      const nextUrl = new URL(location, currentUrl).toString();
      if (!isHttpsUrl(nextUrl)) {
        throw new Error('redirect_non_https_target');
      }
      entry.redirect_chain.push({
        status: response.status,
        from: currentUrl,
        to: nextUrl,
      });
      currentUrl = nextUrl;
    }
  } catch (error) {
    entry.status = 'transport_retry_pending';
    entry.binary_validation = 'not_run_no_payload_bytes';
    entry.transport_evidence = {
      ...(entry.transport_evidence ?? {}),
      current_retry_outcome: 'transport_exception_before_payload',
      exception_name:
        error instanceof Error ? error.name : 'unknown_error',
      source_materialization_failure_reason_applied: null,
    };
    return {
      entry,
      bytes: null,
      decision: 'transport_retry_pending',
    };
  }

  entry.final_url = response!.url || currentUrl;
  entry.http_status = response!.status;
  entry.content_type = response!.headers.get('content-type');

  if (!response!.ok) {
    return materializationFailure(
      entry,
      response!.status,
      entry.content_type,
      'frozen_identity_unresolvable_or_http_unavailable',
    );
  }

  if (!isFrozenContentType(entry.content_type)) {
    entry.binary_validation = 'not_run_unaccepted_content_type';
    return materializationFailure(
      entry,
      response!.status,
      entry.content_type,
      'not_exactly_xlsx_or_bytes_unreadable',
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response!.arrayBuffer());
  } catch {
    entry.status = 'transport_retry_pending';
    entry.binary_validation = 'not_run_payload_not_exposed';
    entry.transport_evidence = {
      ...(entry.transport_evidence ?? {}),
      current_retry_outcome: 'payload_stream_unavailable',
      source_materialization_failure_reason_applied: null,
    };
    return {
      entry,
      bytes: null,
      decision: 'transport_retry_pending',
    };
  }

  const validation = validateZipContainer(bytes);
  if (!validation.ok) {
    entry.byte_size = bytes.byteLength;
    entry.binary_validation = `fail_${validation.reason}`;
    return materializationFailure(
      entry,
      response!.status,
      entry.content_type,
      'not_exactly_xlsx_or_bytes_unreadable',
    );
  }

  const retrievedAtUtc = now();
  if (!isFrozenUtcDateTime(retrievedAtUtc)) {
    throw new Error('retrieved_at_utc_not_schema_conformant');
  }

  entry.status = 'succeeded';
  entry.byte_size = bytes.byteLength;
  entry.sha256 =
    'sha256:' + createHash('sha256').update(bytes).digest('hex');
  entry.retrieved_at_utc = retrievedAtUtc;
  entry.binary_validation =
    'pass_xlsx_package_entries_without_semantic_worksheet_inspection';
  entry.transport_evidence = {
    ...(entry.transport_evidence ?? {}),
    current_retry_outcome: 'payload_received_and_hashed',
    source_materialization_failure_reason_applied: null,
  };

  return {
    entry,
    bytes,
    decision: 'succeeded',
  };
}

export function retryFrozenMaterializationFromBytes(args: {
  entry: ProgressEntry;
  bytes: Uint8Array;
  receipt: OfflinePayloadReceipt;
}): MaterializeOutcome {
  const entry = structuredClone(args.entry);

  if (
    entry.status !== 'transport_retry_pending'
    || !entry.resolved_request_url_or_identity
  ) {
    throw new Error(
      'Offline Stage-A ingest requires a transport_retry_pending entry with a frozen request URL.',
    );
  }
  assertOfflineReceiptSchemaShape(args.receipt);
  if (args.receipt.schema !== OFFLINE_PAYLOAD_RECEIPT_SCHEMA) {
    throw new Error('Offline receipt schema is not supported.');
  }
  if (args.receipt.source_id !== entry.source_id) {
    throw new Error(
      'Offline receipt source_id must exactly match the retry-pending source.',
    );
  }
  if (args.receipt.workbook_semantic_inspection_performed !== false) {
    throw new Error(
      'Offline receipt must attest that workbook semantic inspection was not performed.',
    );
  }
  if (
    args.receipt.request_url
    !== entry.resolved_request_url_or_identity
  ) {
    throw new Error(
      'Offline receipt request_url must exactly match the frozen request URL.',
    );
  }
  assertOfflineReceiptRedirectProvenance(args.receipt);
  if (
    !Number.isInteger(args.receipt.http_status)
    || args.receipt.http_status < 200
    || args.receipt.http_status >= 300
  ) {
    throw new Error(
      'Offline payload ingest accepts only a successful 2xx transport receipt.',
    );
  }
  if (!isFrozenContentType(args.receipt.content_type)) {
    throw new Error(
      'Offline receipt content_type is not an accepted XLSX transport type.',
    );
  }

  const payloadSha256 =
    'sha256:' + createHash('sha256').update(args.bytes).digest('hex');
  if (
    !Number.isInteger(args.receipt.byte_size)
    || args.receipt.byte_size !== args.bytes.byteLength
  ) {
    throw new Error(
      'Offline receipt byte_size must exactly match the supplied payload.',
    );
  }
  if (args.receipt.sha256 !== payloadSha256) {
    throw new Error(
      'Offline receipt sha256 must exactly match the supplied payload.',
    );
  }

  const validation = validateZipContainer(args.bytes);
  if (!validation.ok) {
    throw new Error(
      'Offline payload validation failed without classifying a source failure: '
      + validation.reason,
    );
  }

  entry.attempt_count += 1;
  entry.status = 'succeeded';
  entry.redirect_chain = structuredClone(args.receipt.redirect_chain);
  entry.final_url = args.receipt.final_url;
  entry.http_status = args.receipt.http_status;
  entry.content_type = args.receipt.content_type;
  entry.byte_size = args.bytes.byteLength;
  entry.sha256 = payloadSha256;
  entry.retrieved_at_utc = args.receipt.retrieved_at_utc;
  entry.binary_validation =
    'pass_xlsx_package_entries_without_semantic_worksheet_inspection';
  entry.workbook_semantic_inspection_performed = false;
  delete entry.materialization_failure_reason;
  entry.transport_evidence = {
    ...(entry.transport_evidence ?? {}),
    current_retry_outcome: 'offline_payload_ingested_and_hashed',
    acquisition_mode: 'offline_handoff_receipt',
    receipt_schema: args.receipt.schema,
    receipt_source_id_verified: true,
    receipt_request_url_verified: true,
    receipt_payload_digest_verified: true,
    receipt_semantic_inspection_absent_verified: true,
    source_materialization_failure_reason_applied: null,
  };

  return {
    entry,
    bytes: args.bytes,
    decision: 'succeeded',
  };
}

function materializationFailure(
  entry: ProgressEntry,
  httpStatus: number | null,
  contentType: string | null,
  reason:
    | 'frozen_identity_unresolvable_or_http_unavailable'
    | 'not_exactly_xlsx_or_bytes_unreadable',
): MaterializeOutcome {
  entry.status = 'materialization_failure_pending_frozen_replacement';
  entry.http_status = httpStatus;
  entry.content_type = contentType;
  entry.sha256 = null;
  entry.retrieved_at_utc = null;
  entry.materialization_failure_reason = reason;
  entry.transport_evidence = {
    ...(entry.transport_evidence ?? {}),
    current_retry_outcome: 'source_materialization_failure',
    source_materialization_failure_reason_applied: reason,
  };
  return {
    entry,
    bytes: null,
    decision: 'materialization_failure',
  };
}

export function validateZipContainer(
  bytes: Uint8Array,
): { ok: true } | { ok: false; reason: string } {
  if (bytes.byteLength < 22) {
    return { ok: false, reason: 'zip_too_short' };
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (view.getUint32(0, true) !== 0x04034b50) {
    return { ok: false, reason: 'zip_local_header_missing' };
  }

  const lowerBound = Math.max(0, bytes.byteLength - 65_557);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) {
    return { ok: false, reason: 'zip_eocd_missing' };
  }
  if (
    view.getUint16(eocd + 4, true) !== 0
    || view.getUint16(eocd + 6, true) !== 0
  ) {
    return { ok: false, reason: 'zip_multi_disk_not_supported' };
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirectorySize = view.getUint32(eocd + 12, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0) {
    return { ok: false, reason: 'zip_has_no_entries' };
  }
  if (
    centralDirectoryOffset + centralDirectorySize > eocd
    || centralDirectoryOffset + 4 > bytes.byteLength
  ) {
    return { ok: false, reason: 'zip_central_directory_bounds_invalid' };
  }

  const names = new Set<string>();
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > eocd
      || view.getUint32(offset, true) !== 0x02014b50
    ) {
      return { ok: false, reason: 'zip_central_directory_entry_invalid' };
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > eocd) {
      return { ok: false, reason: 'zip_filename_bounds_invalid' };
    }
    names.add(
      Buffer.from(
        bytes.buffer,
        bytes.byteOffset + nameStart,
        nameLength,
      ).toString('utf8'),
    );
    offset = nameEnd + extraLength + commentLength;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    return { ok: false, reason: 'zip_central_directory_size_mismatch' };
  }

  for (const required of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
  ]) {
    if (!names.has(required)) {
      return {
        ok: false,
        reason: 'xlsx_required_entry_missing:' + required,
      };
    }
  }

  return { ok: true };
}

export function applyOutcomeToProgress(
  progress: any,
  outcome: MaterializeOutcome,
): any {
  const next = structuredClone(progress);
  const index = next.entries.findIndex(
    (entry: ProgressEntry) =>
      entry.source_id === outcome.entry.source_id,
  );
  if (index < 0) {
    throw new Error('Outcome source is not present in progress artifact.');
  }
  next.entries[index] = outcome.entry;

  const count = (status: string) =>
    next.entries.filter(
      (entry: ProgressEntry) => entry.status === status,
    ).length;

  next.aggregate = {
    ...next.aggregate,
    pending_count: count('pending'),
    transport_retry_pending_count:
      count('transport_retry_pending'),
    succeeded_count: count('succeeded'),
    failed_count:
      count('materialization_failure_pending_frozen_replacement'),
    source_bytes_opened_count: count('succeeded'),
    source_digest_count: count('succeeded'),
    workbook_semantic_inspection_count: 0,
  };

  if (outcome.decision === 'succeeded') {
    const nextPending = next.entries.find(
      (entry: ProgressEntry) => entry.status === 'pending',
    );
    next.next_gate = nextPending
      ? {
          name: 'materialize_next_fixed_primary_ordinal',
          source_id: nextPending.source_id,
          source_set_change_admitted: false,
          reserve_substitution_admitted: false,
          workbook_semantic_inspection_admitted: false,
          target_authoring_admitted: false,
          candidate_generation_admitted: false,
          scoring_admitted: false,
        }
      : {
          name: 'freeze_stage_a_materialization_manifest',
          source_set_change_admitted: false,
          workbook_semantic_inspection_admitted: false,
          target_authoring_admitted: false,
          candidate_generation_admitted: false,
          scoring_admitted: false,
        };
    next.decision = {
      source_failure_classified: false,
      frozen_replacement_reason_invoked: false,
      reserve_materialization_invoked: false,
      advance_to_next_ordinal: Boolean(nextPending),
      same_frozen_request_retry_required: false,
      acquisition_manifest_freeze_admitted: !nextPending,
    };
  } else if (outcome.decision === 'transport_retry_pending') {
    next.next_gate = {
      name: 'retry_same_frozen_request_in_binary_capable_transport',
      source_id: outcome.entry.source_id,
      source_set_change_admitted: false,
      reserve_substitution_admitted: false,
      advance_to_next_ordinal_admitted: false,
      workbook_semantic_inspection_admitted: false,
      target_authoring_admitted: false,
      candidate_generation_admitted: false,
      scoring_admitted: false,
    };
    next.decision = {
      source_failure_classified: false,
      frozen_replacement_reason_invoked: false,
      reserve_materialization_invoked: false,
      advance_to_next_ordinal: false,
      same_frozen_request_retry_required: true,
      acquisition_manifest_freeze_admitted: false,
    };
  } else {
    next.next_gate = {
      name: 'apply_frozen_replacement_rule_before_continuing_stage_a',
      source_id: outcome.entry.source_id,
      materialization_failure_reason:
        outcome.entry.materialization_failure_reason,
      source_set_change_admitted: true,
      reserve_substitution_requires_frozen_rule: true,
      advance_to_next_ordinal_admitted: false,
      workbook_semantic_inspection_admitted: false,
      target_authoring_admitted: false,
      candidate_generation_admitted: false,
      scoring_admitted: false,
    };
    next.decision = {
      source_failure_classified: true,
      frozen_replacement_reason_invoked: true,
      reserve_materialization_invoked: false,
      advance_to_next_ordinal: false,
      same_frozen_request_retry_required: false,
      acquisition_manifest_freeze_admitted: false,
    };
  }

  return next;
}

function parseArgs(argv: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: --progress <json> --snapshot-out <json> --payload-out <xlsx> [--payload-in <xlsx> --receipt-in <json>]',
      );
    }
    result.set(key.slice(2), value);
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const progressPath = args.get('progress');
  const snapshotOut = args.get('snapshot-out');
  const payloadOut = args.get('payload-out');
  const payloadIn = args.get('payload-in');
  const receiptIn = args.get('receipt-in');
  if (!progressPath || !snapshotOut || !payloadOut) {
    throw new Error(
      'Usage: --progress <json> --snapshot-out <json> --payload-out <xlsx> [--payload-in <xlsx> --receipt-in <json>]',
    );
  }

  const progress = JSON.parse(
    readFileSync(resolve(progressPath), 'utf8'),
  );
  const retryEntries = progress.entries.filter(
    (entry: ProgressEntry) =>
      entry.status === 'transport_retry_pending',
  );
  if (retryEntries.length !== 1) {
    throw new Error(
      'Exactly one transport_retry_pending entry is required.',
    );
  }

  if (Boolean(payloadIn) !== Boolean(receiptIn)) {
    throw new Error(
      '--payload-in and --receipt-in must be provided together.',
    );
  }

  const outcome = payloadIn && receiptIn
    ? retryFrozenMaterializationFromBytes({
        entry: retryEntries[0],
        bytes: new Uint8Array(readFileSync(resolve(payloadIn))),
        receipt: JSON.parse(readFileSync(resolve(receiptIn), 'utf8')),
      })
    : await retryFrozenMaterialization({
        entry: retryEntries[0],
      });
  const next = applyOutcomeToProgress(progress, outcome);

  mkdirSync(dirname(resolve(snapshotOut)), { recursive: true });
  writeFileSync(
    resolve(snapshotOut),
    JSON.stringify(next) + '\n',
    'utf8',
  );

  if (outcome.bytes) {
    mkdirSync(dirname(resolve(payloadOut)), { recursive: true });
    writeFileSync(resolve(payloadOut), outcome.bytes);
  }

  process.stdout.write(
    JSON.stringify({
      source_id: outcome.entry.source_id,
      decision: outcome.decision,
      snapshot: basename(snapshotOut),
      payload_written: Boolean(outcome.bytes),
      sha256: outcome.entry.sha256,
    }) + '\n',
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
