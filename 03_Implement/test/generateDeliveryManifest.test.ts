import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeliveryManifest,
  type DeliveryManifestRecord,
} from '../src/manifest/generateDeliveryManifest.js';

function createRecord(overrides: Partial<DeliveryManifestRecord> = {}): DeliveryManifestRecord {
  return {
    sourcePath: './docs/appendix.xlsx',
    sheet: 'Sheet1',
    range: 'A1:C10',
    reason: 'smart fallback',
    caption: 'Appendix table',
    id: 'tbl-appendix',
    ...overrides,
  };
}

test('generateDeliveryManifest returns a header row for an empty input', () => {
  const csv = generateDeliveryManifest([]);

  assert.equal(csv, 'sourcePath,sheet,range,reason,caption,id');
});

test('generateDeliveryManifest preserves input order and appends rows after the header', () => {
  const csv = generateDeliveryManifest([
    createRecord({ sourcePath: './first.xlsx', id: 'first' }),
    createRecord({ sourcePath: './second.xlsx', id: 'second' }),
  ]);

  assert.equal(
    csv,
    [
      'sourcePath,sheet,range,reason,caption,id',
      './first.xlsx,Sheet1,A1:C10,smart fallback,Appendix table,first',
      './second.xlsx,Sheet1,A1:C10,smart fallback,Appendix table,second',
    ].join('\n'),
  );
});

test('generateDeliveryManifest escapes commas, newlines and double quotes as CSV', () => {
  const csv = generateDeliveryManifest([
    createRecord({
      sourcePath: './docs/a,b.xlsx',
      reason: 'line 1\nline 2',
      caption: 'He said "hello"',
    }),
  ]);

  assert.equal(
    csv,
    [
      'sourcePath,sheet,range,reason,caption,id',
      '"./docs/a,b.xlsx",Sheet1,A1:C10,"line 1\nline 2","He said ""hello""",tbl-appendix',
    ].join('\n'),
  );
});
