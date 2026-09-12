import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseXlsxFormatSnapshot,
  readXlsxFormatSnapshot,
  type SheetJsWorkbookReader,
} from '../src/experimental/xlsxFormatSnapshotReader.js';

function fakeReader(inspect?: (options: Record<string, unknown>) => void): SheetJsWorkbookReader {
  return {
    read(_data, options) {
      inspect?.(options);
      return {
        SheetNames: ['Release', 'Other'],
        Sheets: {
          Release: {
            '!ref': 'A1:B2',
            '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }],
            A1: { v: 'リリース判定表' },
            A2: { v: '判定', s: { fill: { fgColor: { rgb: 'FF202020' } } } },
            B2: { v: '確認者' },
          },
          Other: { '!ref': 'A1', A1: { v: 'other' } },
        },
      };
    },
  };
}

test('parser requests style-aware read options and bridges the requested sheet', () => {
  let seen: Record<string, unknown> | undefined;
  const result = parseXlsxFormatSnapshot(new Uint8Array([1, 2, 3]), 'Release', fakeReader((options) => { seen = options; }));
  assert.deepEqual(seen, {
    type: 'buffer', dense: false, cellStyles: true, cellText: true, cellDates: true, dateNF: 'yyyy-mm-dd',
  });
  assert.equal(result.sheetName, 'Release');
  assert.deepEqual(result.snapshot.merges, [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }]);
  assert.equal(result.snapshot.cells.find((cell) => cell.row === 1 && cell.column === 0)?.fillTone, 'dark');
});

test('parser defaults to first worksheet and rejects missing sheet names', () => {
  assert.equal(parseXlsxFormatSnapshot(new Uint8Array(), undefined, fakeReader()).sheetName, 'Release');
  assert.throws(() => parseXlsxFormatSnapshot(new Uint8Array(), 'Missing', fakeReader()), /Available: Release, Other/);
});

test('parser rejects workbook with no worksheets or missing worksheet object', () => {
  assert.throws(() => parseXlsxFormatSnapshot(new Uint8Array(), undefined, { read: () => ({ SheetNames: [], Sheets: {} }) }), /does not contain/);
  assert.throws(() => parseXlsxFormatSnapshot(new Uint8Array(), 'Release', { read: () => ({ SheetNames: ['Release'], Sheets: {} }) }), /data is missing/);
});

test('file reader rejects non-Excel sources before parsing', () => {
  assert.throws(() => readXlsxFormatSnapshot({ absolutePath: '/tmp/example.csv' }), /Unsupported format snapshot source/);
});

test('file reader does not modify the source bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-format-reader-'));
  const file = path.join(dir, 'fixture.xlsx');
  try {
    fs.writeFileSync(file, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const before = fs.readFileSync(file);
    assert.throws(() => readXlsxFormatSnapshot({ absolutePath: file }));
    assert.deepEqual(fs.readFileSync(file), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
