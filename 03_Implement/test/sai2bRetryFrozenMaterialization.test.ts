import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import {
  advanceProgressSnapshotMetadata,
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

function xlsxFrame(
  names: string[] = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
  ],
  overrides: Partial<Record<string, string>> = {},
): Uint8Array {
  const defaultParts: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>',
  };
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(overrides[name] ?? defaultParts[name] ?? '', 'utf8');
    const checksum = crc32(data) >>> 0;

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
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

function xlsxFrameWithCorruptRequiredEntryOffset(): Uint8Array {
  const bytes = xlsxFrame().slice();
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 42, bytes.byteLength - 1, true);
      return bytes;
    }
  }
  throw new Error('test XLSX central directory not found');
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

test('XLSX validation rejects empty OOXML declaration parts', () => {
  const genericZip = xlsxFrame(
    [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
    ],
    {
      '[Content_Types].xml': '',
      '_rels/.rels': '',
      'xl/workbook.xml': '',
    },
  );

  assert.deepEqual(
    validateZipContainer(genericZip),
    { ok: false, reason: 'xlsx_content_types_invalid' },
  );
});

test('XLSX validation rejects non-standard officeDocument relationship types', () => {
  const spoofed = xlsxFrame(
    undefined,
    {
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="https://example.invalid/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
  );

  assert.deepEqual(
    validateZipContainer(spoofed),
    { ok: false, reason: 'xlsx_workbook_relationship_missing' },
  );

  const strict = xlsxFrame(
    undefined,
    {
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
  );

  assert.deepEqual(validateZipContainer(strict), { ok: true });
});

test('XLSX validation rejects invented Strict aliases for OPC package root namespaces', () => {
  const cases: Array<[string, string, string]> = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://purl.oclc.org/ooxml/package/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
      'xlsx_content_types_invalid',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://purl.oclc.org/ooxml/package/relationships"><Relationship Id="rId1" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xlsx_root_relationships_invalid',
    ],
  ];

  for (const [part, xml, reason] of cases) {
    assert.deepEqual(
      validateZipContainer(xlsxFrame(undefined, { [part]: xml })),
      { ok: false, reason },
    );
  }
});

test('XLSX validation rejects an external root officeDocument relationship', () => {
  const external = xlsxFrame(
    undefined,
    {
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" TargetMode="External"/></Relationships>',
    },
  );

  assert.deepEqual(
    validateZipContainer(external),
    { ok: false, reason: 'xlsx_workbook_relationship_missing' },
  );

  const explicitInternal = xlsxFrame(
    undefined,
    {
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" TargetMode="Internal"/></Relationships>',
    },
  );
  assert.deepEqual(validateZipContainer(explicitInternal), { ok: true });
});

test('XLSX validation requires standard OOXML root namespaces', () => {
  const cases: Array<[string, string, string]> = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="urn:not-ooxml"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
      'xlsx_content_types_invalid',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="urn:not-ooxml"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xlsx_root_relationships_invalid',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="urn:not-ooxml"></workbook>',
      'xlsx_workbook_xml_invalid',
    ],
  ];

  for (const [part, xml, reason] of cases) {
    assert.deepEqual(
      validateZipContainer(xlsxFrame(undefined, { [part]: xml })),
      { ok: false, reason },
    );
  }

  const strict = xlsxFrame(
    undefined,
    {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"></workbook>',
    },
  );
  assert.deepEqual(validateZipContainer(strict), { ok: true });
});

test('XLSX validation accepts legal XML Misc, dotted prefixes, and spaced namespace attributes', () => {
  const decorated = xlsxFrame(
    undefined,
    {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8"?><!--before--><?mso-application test?><ct.v1:Types xmlns:ct.v1 = "http://schemas.openxmlformats.org/package/2006/content-types"><ct.v1:Override PartName = "/xl/workbook.xml" ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></ct.v1:Types><?after test?><!--after-->',
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8"?><?before test?><!--before--><r.v1:Relationships xmlns:r.v1 = "http://schemas.openxmlformats.org/package/2006/relationships"><r.v1:Relationship Id = "rId1" Type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target = "xl/workbook.xml" /></r.v1:Relationships><!--after--><?after test?>',
      'xl/workbook.xml':
        '<?xml version="1.0" encoding="UTF-8"?><!--before--><ss.v1:workbook xmlns:ss.v1 = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"></ss.v1:workbook><?after test?><!--after-->',
    },
  );

  assert.deepEqual(validateZipContainer(decorated), { ok: true });
});

test('XLSX validation still rejects a DTD before an OOXML package root', () => {
  const withDtd = xlsxFrame(
    undefined,
    {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE Types><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    },
  );

  assert.deepEqual(
    validateZipContainer(withDtd),
    { ok: false, reason: 'xlsx_content_types_invalid' },
  );
});

test('XLSX validation rejects corrupt required-entry local data', () => {
  const corrupt = xlsxFrameWithCorruptRequiredEntryOffset();

  assert.deepEqual(
    validateZipContainer(corrupt),
    { ok: false, reason: 'zip_corrupt' },
  );
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: corrupt,
      receipt: offlineReceipt(
        'https://example.test/frozen.xlsx',
        corrupt,
      ),
    }),
    /Offline payload validation failed without classifying a source failure: zip_corrupt/u,
  );
});

test('XLSX validation rejects duplicate OOXML part names', () => {
  const duplicate = xlsxFrame([
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/workbook.xml',
  ]);

  assert.deepEqual(
    validateZipContainer(duplicate),
    { ok: false, reason: 'zip_corrupt' },
  );
  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes: duplicate,
      receipt: offlineReceipt(
        'https://example.test/frozen.xlsx',
        duplicate,
      ),
    }),
    /Offline payload validation failed without classifying a source failure: zip_corrupt/u,
  );
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
  assert.equal(next.aggregate.source_bytes_opened_count, 0);
  assert.equal(next.aggregate.source_digest_count, 0);
  assert.equal(next.current_boundary.source_bytes_opened, false);
  assert.equal(next.current_boundary.source_digests_computed, false);
});

test('successful retry opens only the next fixed Stage-A ordinal', async () => {
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    fetchImpl: async () =>
      new Response(xlsxFrame(), {
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
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

  const next = applyOutcomeToProgress(progress, outcome);
  assert.equal(next.aggregate.succeeded_count, 1);
  assert.equal(next.aggregate.pending_count, 1);
  assert.equal(next.aggregate.source_bytes_opened_count, 1);
  assert.equal(next.aggregate.source_digest_count, 1);
  assert.equal(next.aggregate.workbook_semantic_inspection_count, 0);
  assert.equal(next.current_boundary.source_bytes_opened, true);
  assert.equal(next.current_boundary.source_digests_computed, true);
  assert.equal(
    next.current_boundary.workbook_semantic_inspection_admitted,
    false,
  );
  assert.equal(next.current_boundary.target_authoring_admitted, false);
  assert.equal(next.current_boundary.candidate_generation_admitted, false);
  assert.equal(next.current_boundary.scoring_admitted, false);
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


test('offline handoff rejects receipts outside the frozen schema shape', () => {
  const bytes = xlsxFrame();

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        retrieved_at_utc: '2026-09-28T03:00:00+00:00',
      },
    }),
    /UTC Z timestamp/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        final_url: 'http://example.test/frozen.xlsx',
      },
    }),
    /final_url must be an HTTPS URL/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        redirect_chain: Array.from({ length: 11 }, () => ({
          status: 302,
          from: 'https://example.test/a',
          to: 'https://example.test/b',
        })),
      },
    }),
    /redirect_chain must match/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        unexpected: true,
      } as unknown as OfflinePayloadReceipt,
    }),
    /exactly the frozen schema fields/u,
  );
});


test('offline handoff rejects redirect provenance that is not continuous from the frozen request', () => {
  const bytes = xlsxFrame();
  const requestUrl = 'https://example.test/frozen.xlsx';

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        final_url: 'https://example.test/final.xlsx',
        redirect_chain: [{
          status: 302,
          from: 'https://example.test/unrelated.xlsx',
          to: 'https://example.test/final.xlsx',
        }],
      },
    }),
    /continuous from the frozen request URL/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        final_url: 'https://example.test/final.xlsx',
        redirect_chain: [
          {
            status: 302,
            from: requestUrl,
            to: 'https://example.test/hop-1.xlsx',
          },
          {
            status: 302,
            from: 'https://example.test/gap.xlsx',
            to: 'https://example.test/final.xlsx',
          },
        ],
      },
    }),
    /continuous from the frozen request URL/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        final_url: 'https://example.test/not-the-terminal-hop.xlsx',
        redirect_chain: [{
          status: 302,
          from: requestUrl,
          to: 'https://example.test/terminal.xlsx',
        }],
      },
    }),
    /final_url must equal the terminal frozen redirect URL/u,
  );
});

test('offline handoff accepts a continuous redirect chain ending at final_url', () => {
  const bytes = xlsxFrame();
  const requestUrl = 'https://example.test/frozen.xlsx';
  const receipt: OfflinePayloadReceipt = {
    ...offlineReceipt(),
    final_url: 'https://example.test/final.xlsx',
    redirect_chain: [
      {
        status: 302,
        from: requestUrl,
        to: 'https://example.test/hop-1.xlsx',
      },
      {
        status: 307,
        from: 'https://example.test/hop-1.xlsx',
        to: 'https://example.test/final.xlsx',
      },
    ],
  };

  const outcome = retryFrozenMaterializationFromBytes({
    entry: entry(),
    bytes,
    receipt,
  });

  assert.equal(outcome.decision, 'succeeded');
  assert.equal(outcome.entry.final_url, receipt.final_url);
  assert.deepEqual(outcome.entry.redirect_chain, receipt.redirect_chain);
});


test('offline handoff rejects WHATWG-normalizable URLs outside frozen HTTPS pattern', () => {
  const bytes = xlsxFrame();

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        request_url: 'https:example.test/frozen.xlsx',
      },
    }),
    /request_url must be an HTTPS URL/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        final_url: 'https:example.test/frozen.xlsx',
      },
    }),
    /final_url must be an HTTPS URL/u,
  );

  assert.throws(
    () => retryFrozenMaterializationFromBytes({
      entry: entry(),
      bytes,
      receipt: {
        ...offlineReceipt(),
        final_url: 'https://example.test/final.xlsx',
        redirect_chain: [{
          status: 302,
          from: 'https://example.test/frozen.xlsx',
          to: 'https:/example.test/final.xlsx',
        }],
      },
    }),
    /redirect_chain must match the frozen schema/u,
  );
});


test('direct retry rejects a non-HTTPS frozen request as transport-only failure', async () => {
  const bad = {
    ...entry(),
    resolved_request_url_or_identity:
      'http://example.test/frozen.xlsx',
  };
  let called = false;

  const outcome = await retryFrozenMaterialization({
    entry: bad,
    fetchImpl: async () => {
      called = true;
      throw new Error('must not fetch');
    },
  });

  assert.equal(called, false);
  assert.equal(outcome.decision, 'transport_retry_pending');
  assert.equal(outcome.entry.status, 'transport_retry_pending');
  assert.equal(
    outcome.entry.transport_evidence
      ?.source_materialization_failure_reason_applied,
    null,
  );
});

test('direct retry fail-closes before following a non-HTTPS redirect', async () => {
  const seen: string[] = [];
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    fetchImpl: async (url) => {
      seen.push(url);
      return new Response(null, {
        status: 302,
        headers: {
          location: 'http://example.test/downgraded.xlsx',
        },
      });
    },
  });

  assert.deepEqual(seen, ['https://example.test/frozen.xlsx']);
  assert.equal(outcome.decision, 'transport_retry_pending');
  assert.equal(outcome.entry.status, 'transport_retry_pending');
  assert.equal(outcome.entry.sha256, null);
  assert.equal(
    outcome.entry.transport_evidence
      ?.source_materialization_failure_reason_applied,
    null,
  );
});


test('direct retry rejects an unaccepted 2xx content type before payload success', async () => {
  const outcome = await retryFrozenMaterialization({
    entry: entry(),
    fetchImpl: async () =>
      new Response(xlsxFrame(), {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
  });

  assert.equal(outcome.decision, 'materialization_failure');
  assert.equal(
    outcome.entry.materialization_failure_reason,
    'not_exactly_xlsx_or_bytes_unreadable',
  );
  assert.equal(outcome.entry.content_type, 'text/plain; charset=utf-8');
  assert.equal(outcome.entry.sha256, null);
  assert.equal(outcome.entry.retrieved_at_utc, null);
  assert.equal(
    outcome.entry.transport_evidence
      ?.source_materialization_failure_reason_applied,
    'not_exactly_xlsx_or_bytes_unreadable',
  );
});


test('offline handoff rejects content types outside the frozen receipt schema spelling', () => {
  const bytes = xlsxFrame();

  for (const contentType of [
    'Application/Zip',
    ' application/zip',
  ]) {
    assert.throws(
      () => retryFrozenMaterializationFromBytes({
        entry: entry(),
        bytes,
        receipt: {
          ...offlineReceipt(),
          content_type: contentType,
        },
      }),
      /content_type is not an accepted XLSX transport type/u,
    );
  }
});

test('direct retry rejects normalized content types outside the frozen spelling', async () => {
  for (const contentType of [
    'Application/Zip',
    ' application/zip',
  ]) {
    const outcome = await retryFrozenMaterialization({
      entry: entry(),
      fetchImpl: async () =>
        new Response(xlsxFrame(), {
          status: 200,
          headers: { 'content-type': contentType },
        }),
    });

    assert.equal(outcome.decision, 'materialization_failure');
    assert.equal(
      outcome.entry.binary_validation,
      'not_run_unaccepted_content_type',
    );
    assert.equal(outcome.entry.sha256, null);
  }
});


test('offline handoff rejects schema-invalid UTC timestamp spellings', () => {
  const bytes = xlsxFrame();

  for (const retrievedAtUtc of [
    '2026-09-28 03:00:00Z',
    '2026-09-28T03:00Z',
  ]) {
    assert.throws(
      () => retryFrozenMaterializationFromBytes({
        entry: entry(),
        bytes,
        receipt: {
          ...offlineReceipt(),
          retrieved_at_utc: retrievedAtUtc,
        },
      }),
      /UTC Z timestamp/u,
    );
  }
});

test('direct retry rejects a generated timestamp outside the frozen schema', async () => {
  await assert.rejects(
    () => retryFrozenMaterialization({
      entry: entry(),
      now: () => '2026-09-28 03:00:00Z',
      fetchImpl: async () =>
        new Response(xlsxFrame(), {
          status: 200,
          headers: {
            'content-type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        }),
    }),
    /retrieved_at_utc_not_schema_conformant/u,
  );
});


test('materialization snapshot metadata advances lineage from the frozen baseline', () => {
  const baseline = {
    run_id: 'sai-2b-real-source-primary-materialization-run-01',
    snapshot_id:
      'sai-2b-real-source-primary-materialization-run-01-attempt-003',
  };
  const baselineRaw = JSON.stringify(baseline) + '\n';
  const advanced = advanceProgressSnapshotMetadata({
    baseline,
    next: { ...baseline },
    baselineRaw,
    baselineRef:
      '03_Implement/test/fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json',
  });

  const bytes = Buffer.from(baselineRaw, 'utf8');
  const expectedBlob = createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');

  assert.equal(
    advanced.snapshot_id,
    'sai-2b-real-source-primary-materialization-run-01-attempt-004',
  );
  assert.equal(
    advanced.predecessor_ref,
    '03_Implement/test/fixtures/structured-artifact-sai2-real-source-primary-materialization-run-v0-attempt-003.json',
  );
  assert.equal(advanced.predecessor_git_blob_sha, expectedBlob);
});

test('materialization snapshot metadata rejects lineage outside the run id', () => {
  assert.throws(
    () => advanceProgressSnapshotMetadata({
      baseline: {
        run_id: 'run-a',
        snapshot_id: 'run-b-attempt-003',
      },
      next: {},
      baselineRaw: '{}\n',
      baselineRef: 'baseline.json',
    }),
    /snapshot_id must match/u,
  );
});


test('package identity ignores fake required declarations inside comments and CDATA', () => {
  const commentedOverride = xlsxFrame(undefined, {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<!-- <Override PartName="/xl/workbook.xml" '
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/> -->'
      + '</Types>',
  });
  assert.deepEqual(validateZipContainer(commentedOverride), {
    ok: false,
    reason: 'xlsx_workbook_content_type_missing',
  });

  const cdataRelationship = xlsxFrame(undefined, {
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<![CDATA[<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>]]>'
      + '</Relationships>',
  });
  assert.deepEqual(validateZipContainer(cdataRelationship), {
    ok: false,
    reason: 'xlsx_workbook_relationship_missing',
  });
});

test('package identity rejects foreign-namespace and nested lookalike declarations', () => {
  const foreignOverride = xlsxFrame(undefined, {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" xmlns:e="urn:evil">'
      + '<e:Override PartName="/xl/workbook.xml" '
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '</Types>',
  });
  assert.deepEqual(validateZipContainer(foreignOverride), {
    ok: false,
    reason: 'xlsx_workbook_content_type_missing',
  });

  const nestedRelationship = xlsxFrame(undefined, {
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Wrapper><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Wrapper>'
      + '</Relationships>',
  });
  assert.deepEqual(validateZipContainer(nestedRelationship), {
    ok: false,
    reason: 'xlsx_workbook_relationship_missing',
  });
});

test('package identity rejects namespace and required attributes spoofed inside quoted values', () => {
  const spoofedRootNamespace = xlsxFrame(undefined, {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types note=\' xmlns="http://schemas.openxmlformats.org/package/2006/content-types"\'>'
      + '<Override PartName="/xl/workbook.xml" '
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '</Types>',
  });
  assert.deepEqual(validateZipContainer(spoofedRootNamespace), {
    ok: false,
    reason: 'xlsx_content_types_invalid',
  });

  const spoofedOverrideAttributes = xlsxFrame(undefined, {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Override note=\' PartName="/xl/workbook.xml" '
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"\'/>'
      + '</Types>',
  });
  assert.deepEqual(validateZipContainer(spoofedOverrideAttributes), {
    ok: false,
    reason: 'xlsx_workbook_content_type_missing',
  });

  const spoofedRelationshipAttributes = xlsxFrame(undefined, {
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship note=\' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
      + 'Target="xl/workbook.xml"\'/>'
      + '</Relationships>',
  });
  assert.deepEqual(validateZipContainer(spoofedRelationshipAttributes), {
    ok: false,
    reason: 'xlsx_workbook_relationship_missing',
  });
});

test('package identity admits correctly-prefixed OPC direct-child declarations', () => {
  const prefixed = xlsxFrame(undefined, {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<ct:Types xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<ct:Override PartName="/xl/workbook.xml" '
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '</ct:Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<r:Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</r:Relationships>',
  });
  assert.deepEqual(validateZipContainer(prefixed), { ok: true });
});


test('package identity rejects malformed nested workbook XML', () => {
  const malformed = xlsxFrame(undefined, {
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<bookViews>'
      + '</workbook>',
  });

  assert.deepEqual(validateZipContainer(malformed), {
    ok: false,
    reason: 'xlsx_workbook_xml_invalid',
  });
});

test('package identity accepts balanced workbook XML without opening semantics', () => {
  const balanced = xlsxFrame(undefined, {
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<bookViews><workbookView/></bookViews>'
      + '</workbook>',
  });

  assert.deepEqual(validateZipContainer(balanced), { ok: true });
});
