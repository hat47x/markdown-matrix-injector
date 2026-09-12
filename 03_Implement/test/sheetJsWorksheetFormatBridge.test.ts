import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySheetJsBorderKind,
  classifySheetJsFillTone,
  sheetJsWorksheetToFormatSnapshot,
} from '../src/experimental/sheetJsWorksheetFormatBridge.js';

test('bridges sparse SheetJS cells and merges without mutating source', () => {
  const worksheet = {
    '!ref': 'A1:F3',
    '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }],
    A1: { v: 'リリース判定表', t: 's' },
    A2: { v: 'ID', w: 'ID', s: { fill: { fgColor: { rgb: 'FF1F4E78' } }, border: { top: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' } } } },
    B2: { v: '項目', s: { fill: { fgColor: { rgb: 'FF1F4E78' } } } },
    C2: { v: '判定' }, D2: { v: '確認者' }, E2: { v: '備考' }, F2: { v: '期限' },
    A3: { v: 'R-001' }, F3: { v: 46000, w: '2025-12-09' },
  };
  const before = JSON.stringify(worksheet);
  const snapshot = sheetJsWorksheetToFormatSnapshot(worksheet);
  assert.equal(JSON.stringify(worksheet), before);
  assert.deepEqual(snapshot.merges, [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 5 }]);
  assert.equal(snapshot.cells.find((cell) => cell.row === 1 && cell.column === 0)?.fillTone, 'dark');
  assert.equal(snapshot.cells.find((cell) => cell.row === 1 && cell.column === 0)?.borderKind, 'grid');
  assert.equal(snapshot.cells.find((cell) => cell.row === 2 && cell.column === 5)?.text, '2025-12-09');
});

test('supports dense worksheet !data representation and honors !ref', () => {
  const worksheet = {
    '!ref': 'A1:B2',
    '!data': [
      [{ v: 'A' }, { v: 'B' }, { v: 'outside' }],
      [{ v: 1 }, { v: 2 }],
      [{ v: 'outside-row' }],
    ],
  };
  const snapshot = sheetJsWorksheetToFormatSnapshot(worksheet);
  assert.deepEqual(snapshot.cells.map((cell) => [cell.row, cell.column, cell.text]), [
    [0, 0, 'A'], [0, 1, 'B'], [1, 0, '1'], [1, 1, '2'],
  ]);
});

test('missing !ref is treated as an empty worksheet', () => {
  assert.deepEqual(sheetJsWorksheetToFormatSnapshot({ A1: { v: 'ignored' } }), { cells: [], merges: [] });
});

test('fill classification is conservative for rgb and unresolved theme colors', () => {
  assert.equal(classifySheetJsFillTone({ fill: { fgColor: { rgb: 'FF202020' } } }), 'dark');
  assert.equal(classifySheetJsFillTone({ fill: { fgColor: { rgb: 'FF999999' } } }), 'gray');
  assert.equal(classifySheetJsFillTone({ fill: { fgColor: { rgb: 'FFF2F2F2' } } }), 'light');
  assert.equal(classifySheetJsFillTone({ fill: { fgColor: { theme: 4 } } }), 'other');
  assert.equal(classifySheetJsFillTone({}), undefined);
});

test('border classification requires explicit line evidence', () => {
  assert.equal(classifySheetJsBorderKind({ border: {
    top: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' },
  } }), 'grid');
  assert.equal(classifySheetJsBorderKind({ border: { bottom: { style: 'thin' } } }), 'thin');
  assert.equal(classifySheetJsBorderKind({ border: { bottom: { color: { rgb: 'FF000000' } } } }), undefined);
});

test('invalid worksheet ranges and merges fail closed', () => {
  assert.throws(() => sheetJsWorksheetToFormatSnapshot({ '!ref': 'B2:A1' }), /Invalid SheetJS worksheet range/);
  assert.throws(() => sheetJsWorksheetToFormatSnapshot({ '!ref': 'A1:B2', '!merges': {} }), /!merges must be an array/);
  assert.throws(() => sheetJsWorksheetToFormatSnapshot({ '!ref': 'A1:B2', '!merges': [{ s: { r: 1, c: 1 }, e: { r: 0, c: 0 } }] }), /merge at index 0 is invalid/);
});
