import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readZip, ZipError } from '../src/core/zipReader.js';

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
const OOXML_OFFICE_DOCUMENT_RELATIONSHIP_TYPES = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
]);
const OPC_CONTENT_TYPES_NAMESPACE =
  'http://schemas.openxmlformats.org/package/2006/content-types';
const OPC_RELATIONSHIPS_NAMESPACE =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const OOXML_SPREADSHEET_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://purl.oclc.org/ooxml/spreadsheetml/main',
]);

function rootElementNamespace(
  xml: string,
  expectedLocalName: 'Types' | 'Relationships' | 'workbook',
): string | null {
  let rest = xml.trimStart();
  if (rest.startsWith('<?xml')) {
    const end = rest.indexOf('?>');
    if (end < 0) {
      return null;
    }
    rest = rest.slice(end + 2).trimStart();
  }

  const open = /^<(?:(?<prefix>[A-Za-z_][A-Za-z0-9_-]*):)?(?<local>Types|Relationships|workbook)\b(?<attrs>[^>]*)>/u.exec(rest);
  if (!open?.groups || open.groups.local !== expectedLocalName) {
    return null;
  }
  const prefix = open.groups.prefix;
  const attrs = open.groups.attrs ?? '';
  const namespace = prefix
    ? new RegExp(
      `\\bxmlns:${prefix}=(["'])([^"']+)\\1`,
      'u',
    ).exec(attrs)?.[2]
    : /\bxmlns=(["'])([^"']+)\1/u.exec(attrs)?.[2];
  if (!namespace) {
    return null;
  }

  const close = new RegExp(
    prefix
      ? `</${prefix}:${expectedLocalName}>\\s*$`
      : `</${expectedLocalName}>\\s*$`,
    'u',
  );
  return close.test(rest) ? namespace : null;
}
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
  if (!isHttpsUrl(receipt.request_url)) {
    throw new Error('Offline receipt request_url must be an HTTPS URL.');
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
  try {
    const entries = readZip(bytes);
    for (const required of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
    ]) {
      if (!entries.has(required)) {
        return {
          ok: false,
          reason: 'xlsx_required_entry_missing:' + required,
        };
      }
    }

    // Package validation is intentionally non-semantic: read every ZIP entry
    // only to verify local headers, decompression, declared sizes, and CRCs.
    const packageParts = new Map<string, Buffer>();
    for (const entry of entries.values()) {
      packageParts.set(entry.name, entry.read());
    }

    const contentTypes = packageParts
      .get('[Content_Types].xml')!
      .toString('utf8')
      .replace(/^﻿/u, '');
    const rootRels = packageParts
      .get('_rels/.rels')!
      .toString('utf8')
      .replace(/^﻿/u, '');
    const workbook = packageParts
      .get('xl/workbook.xml')!
      .toString('utf8')
      .replace(/^﻿/u, '');

    const contentTypesNamespace =
      rootElementNamespace(contentTypes, 'Types');
    if (
      contentTypesNamespace !== OPC_CONTENT_TYPES_NAMESPACE
    ) {
      return { ok: false, reason: 'xlsx_content_types_invalid' };
    }
    const workbookContentTypeDeclared = [
      ...contentTypes.matchAll(/<(?:\\w+:)?Override\\b[^>]*\\/?>/gu),
    ].some((match) => {
      const tag = match[0];
      return /\\bPartName=(["'])\\/xl\\/workbook\\.xml\\1/u.test(tag)
        && /\\bContentType=(["'])application\\/vnd\\.openxmlformats-officedocument\\.spreadsheetml\\.sheet\\.main\\+xml\\1/u.test(tag);
    });
    if (!workbookContentTypeDeclared) {
      return { ok: false, reason: 'xlsx_workbook_content_type_missing' };
    }

    const relationshipsNamespace =
      rootElementNamespace(rootRels, 'Relationships');
    if (
      relationshipsNamespace !== OPC_RELATIONSHIPS_NAMESPACE
    ) {
      return { ok: false, reason: 'xlsx_root_relationships_invalid' };
    }
    const workbookRelationshipDeclared = [
      ...rootRels.matchAll(/<(?:\\w+:)?Relationship\\b[^>]*\\/?>/gu),
    ].some((match) => {
      const tag = match[0];
      const type = /\\bType=(["'])([^"']+)\\1/u.exec(tag)?.[2];
      const target = /\\bTarget=(["'])([^"']+)\\1/u.exec(tag)?.[2];
      return typeof type === 'string'
        && OOXML_OFFICE_DOCUMENT_RELATIONSHIP_TYPES.has(type)
        && (target === 'xl/workbook.xml' || target === '/xl/workbook.xml');
    });
    if (!workbookRelationshipDeclared) {
      return { ok: false, reason: 'xlsx_workbook_relationship_missing' };
    }

    const workbookNamespace =
      rootElementNamespace(workbook, 'workbook');
    if (
      !workbookNamespace
      || !OOXML_SPREADSHEET_NAMESPACES.has(workbookNamespace)
    ) {
      return { ok: false, reason: 'xlsx_workbook_xml_invalid' };
    }


    return { ok: true };
  } catch (error) {
    if (error instanceof ZipError) {
      return { ok: false, reason: `zip_${error.code}` };
    }
    return { ok: false, reason: 'zip_validation_exception' };
  }
}

export function advanceProgressSnapshotMetadata(args: {
  baseline: any;
  next: any;
  baselineRaw: string;
  baselineRef: string;
}): any {
  const currentSnapshotId = String(args.baseline.snapshot_id ?? '');
  const match = currentSnapshotId.match(
    /^(.*)-attempt-(\d{3})$/u,
  );
  if (!match || match[1] !== String(args.baseline.run_id ?? '')) {
    throw new Error(
      'Baseline snapshot_id must match <run_id>-attempt-###.',
    );
  }
  const sequence = Number(match[2]) + 1;
  if (!Number.isInteger(sequence) || sequence > 999) {
    throw new Error('Stage-A snapshot sequence is out of range.');
  }

  const baselineBytes = Buffer.from(args.baselineRaw, 'utf8');
  const header = Buffer.from(
    `blob ${baselineBytes.byteLength}\0`,
    'utf8',
  );
  const predecessorGitBlobSha = createHash('sha1')
    .update(header)
    .update(baselineBytes)
    .digest('hex');

  const next = structuredClone(args.next);
  next.snapshot_id =
    `${match[1]}-attempt-${String(sequence).padStart(3, '0')}`;
  next.predecessor_ref = args.baselineRef;
  next.predecessor_git_blob_sha = predecessorGitBlobSha;
  return next;
}

export function canonicalProgressRef(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  const marker = '03_Implement/';
  const index = normalized.lastIndexOf(marker);
  if (index >= 0) {
    return normalized.slice(index);
  }
  if (normalized.startsWith('test/fixtures/')) {
    return marker + normalized;
  }
  return basename(normalized);
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
  next.current_boundary = {
    ...(next.current_boundary ?? {}),
    source_bytes_opened:
      next.aggregate.source_bytes_opened_count > 0,
    source_digests_computed:
      next.aggregate.source_digest_count > 0,
    workbook_semantic_inspection_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
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

  const progressRaw = readFileSync(resolve(progressPath), 'utf8');
  const progress = JSON.parse(progressRaw);
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
  const next = advanceProgressSnapshotMetadata({
    baseline: progress,
    next: applyOutcomeToProgress(progress, outcome),
    baselineRaw: progressRaw,
    baselineRef: canonicalProgressRef(progressPath),
  });

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
