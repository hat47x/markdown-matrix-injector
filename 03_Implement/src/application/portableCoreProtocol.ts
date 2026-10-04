import { createHash } from 'node:crypto';
import path from 'node:path';

import { readJsonTree } from '../adapters/jsonTreeAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import { readXmlTree } from '../adapters/xmlTreeAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { decodeJsonUtf8 } from '../core/jsonFormat.js';
import { loadWorkbookFromBytes } from '../core/workbookLoader.js';
import {
  decodeGenericXmlUtf8,
  isXmlSpreadsheet2003Bytes,
} from '../core/xmlFormat.js';

import {
  PORTABLE_CORE_REQUEST_SCHEMA,
  PORTABLE_CORE_RESPONSE_SCHEMA,
  type PortableCoreInspectRequestV1,
  type PortableCoreInspectResponseV1,
  type PortableCoreRequestV1,
  type PortableCoreResponseV1,
  type PortableCoreSourceFormat,
} from './portableCoreContract.js';

export {
  PORTABLE_CORE_REQUEST_SCHEMA,
  PORTABLE_CORE_RESPONSE_SCHEMA,
} from './portableCoreContract.js';
export type {
  PortableCoreInspectRequestV1,
  PortableCoreInspectResponseV1,
  PortableCoreRequestV1,
  PortableCoreResponseV1,
  PortableCoreSourceFormat,
} from './portableCoreContract.js';


export function runPortableCoreRequest(
  value: unknown,
): PortableCoreResponseV1 {
  const request = parsePortableCoreRequest(value);
  return inspectPortableSource(request);
}

export function parsePortableCoreRequest(
  value: unknown,
): PortableCoreRequestV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('portable core request must be an object');
  }
  const request = value as Partial<PortableCoreInspectRequestV1>
    & Record<string, unknown>;
  assertExactKeys(
    'request',
    request,
    ['executionPolicy', 'operation', 'options', 'schema', 'source'],
  );
  if (request.schema !== PORTABLE_CORE_REQUEST_SCHEMA) {
    throw new Error(`unsupported portable core request schema: ${String(request.schema)}`);
  }
  if (request.operation !== 'inspect') {
    throw new Error(`unsupported portable core operation: ${String(request.operation)}`);
  }

  if (!request.source || typeof request.source !== 'object' || Array.isArray(request.source)) {
    throw new Error('portable core request source must be an object');
  }
  const source = request.source as Record<string, unknown>;
  assertExactKeys('source', source, ['bytesBase64', 'label', 'name']);
  assertNonEmptyString('source.name', source.name);
  assertNonEmptyString('source.label', source.label);
  if (typeof source.bytesBase64 !== 'string') {
    throw new Error('source.bytesBase64 must be a string');
  }
  decodeCanonicalBase64(source.bytesBase64);

  if (request.options !== undefined) {
    if (!request.options || typeof request.options !== 'object' || Array.isArray(request.options)) {
      throw new Error('portable core request options must be an object');
    }
    const options = request.options as Record<string, unknown>;
    assertExactKeys('options', options, ['maxScanCells']);
    if (options.maxScanCells !== undefined) {
      if (
        !Number.isSafeInteger(options.maxScanCells)
        || Number(options.maxScanCells) <= 0
      ) {
        throw new Error('options.maxScanCells must be a positive safe integer');
      }
    }
  }

  if (request.executionPolicy !== undefined) {
    if (
      !request.executionPolicy
      || typeof request.executionPolicy !== 'object'
      || Array.isArray(request.executionPolicy)
    ) {
      throw new Error('portable core request executionPolicy must be an object');
    }
    const policy = request.executionPolicy as Record<string, unknown>;
    assertExactKeys('executionPolicy', policy, ['allowProviderDependent']);
    if (policy.allowProviderDependent !== undefined && policy.allowProviderDependent !== false) {
      throw new Error('portable core v1 does not allow provider-dependent execution');
    }
  }

  return request as PortableCoreRequestV1;
}

function inspectPortableSource(
  request: PortableCoreInspectRequestV1,
): PortableCoreInspectResponseV1 {
  const bytes = decodeCanonicalBase64(request.source.bytesBase64);
  const format = sourceFormat(request.source.name, bytes);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const maxScanCells = request.options?.maxScanCells;

  let candidates: Candidate[];
  if (format === 'json') {
    const text = decodeJsonUtf8(bytes);
    candidates = [...readJsonTree(text, request.source.label, digest).candidates];
  } else if (format === 'xml') {
    const text = decodeGenericXmlUtf8(bytes);
    candidates = [...readXmlTree(text, request.source.label, digest).candidates];
  } else {
    const workbook = loadWorkbookFromBytes(
      request.source.name,
      Buffer.from(bytes),
    );
    candidates = Object.entries(workbook.sheets).flatMap(
      ([sheetName, sheet]) => tableCandidates({
        source: request.source.label,
        sourceDigest: digest,
        sheetName,
        sheet,
        ...(maxScanCells !== undefined ? { maxScanCells } : {}),
      }),
    );
  }

  return {
    schema: PORTABLE_CORE_RESPONSE_SCHEMA,
    operation: 'inspect',
    execution: 'deterministic',
    source: {
      name: request.source.name,
      label: request.source.label,
      format,
      digest,
      byteLength: bytes.byteLength,
    },
    candidates,
    diagnostics: [],
  };
}

function sourceFormat(
  name: string,
  bytes: Uint8Array,
): PortableCoreSourceFormat {
  const extension = path.extname(name).toLowerCase();
  if (extension === '.csv') return 'csv';
  if (extension === '.xlsx') return 'xlsx';
  if (extension === '.xlsm') return 'xlsm';
  if (extension === '.json') return 'json';
  if (extension === '.xml') {
    return isXmlSpreadsheet2003Bytes(bytes)
      ? 'xml-spreadsheet'
      : 'xml';
  }
  throw new Error(`unsupported portable core source format: ${extension || '(none)'}`);
}

function decodeCanonicalBase64(value: string): Uint8Array {
  if (
    value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new Error('source.bytesBase64 must be canonical base64');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw new Error('source.bytesBase64 must be canonical base64');
  }
  return bytes;
}

function assertNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertExactKeys(
  name: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const extras = actual.filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    throw new Error(`${name} contains unsupported field(s): ${extras.join(', ')}`);
  }
}
