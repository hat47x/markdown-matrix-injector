import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkbook, type SheetSource } from '../src/core/workbookLoader.js';
import { sliceRegion } from '../src/core/tableGeometry.js';

function sheetToMatrix(sheet: SheetSource): string[][] {
  return sliceRegion(sheet);
}

test('CP932 sample preserves Windows characters, quoted commas, line breaks and source bytes', () => {
  const absolutePath = fileURLToPath(new URL('../../04_Documentation/samples/practical/data/excel-cp932.csv', import.meta.url));
  const before = fs.readFileSync(absolutePath);
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(before));
  assert.deepEqual(sheetToMatrix(loadWorkbook({ absolutePath }).sheets.Sheet1), [
    ['番号', '担当者', '会社', '備考'],
    ['001', '髙橋', '㈱サンプル', '①確認,承認待ち'],
    ['002', '山田', '開発部', '改行を含む\r\n備考'],
  ]);
  assert.deepEqual(fs.readFileSync(absolutePath), before);
});

test('CSV encoding selection preserves UTF-8 and rejects malformed or unsupported BOM data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-encoding-'));
  const absolutePath = path.join(dir, 'sample.csv');
  try {
    for (const text of ['名前,値\n日本語,😀', '\ufeff名前,値\n日本語,😀', 'name,value\nASCII,1']) {
      fs.writeFileSync(absolutePath, text);
      assert.deepEqual(sheetToMatrix(loadWorkbook({ absolutePath }).sheets.Sheet1),
        text.includes('ASCII') ? [['name', 'value'], ['ASCII', '1']] : [['名前', '値'], ['日本語', '😀']]);
    }
    for (const bytes of [[0x81], [0xef, 0xbb, 0xbf, 0x81], [0xff, 0xfe, 0x41, 0]]) {
      fs.writeFileSync(absolutePath, Buffer.from(bytes));
      assert.throws(() => loadWorkbook({ absolutePath }), /CSV/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
