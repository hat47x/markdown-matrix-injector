import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkPaths } from '../src/cli/mmi.js';
import { withCurrentExpectedBelow } from '../src/dx/embedEditor.js';
import {
  belowSeverity,
  checkExpectedBelow,
  currentBelowRows,
  describeBelowChange,
  MAX_TRACKED_BELOW_ROWS,
  parseBelowValue,
} from '../src/core/expectedBelow.js';
import { buildLogicalTable } from '../src/core/renderTable.js';
import { loadWorkbook, type WorkbookData } from '../src/core/workbookLoader.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';
import { analyzeBook } from '../src/navigate/catalog.js';
import { selectFromBook } from '../src/navigate/select.js';

function project(csv: string): { root: string; csvPath: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xbelow-'));
  const csvPath = path.join(root, 'spec.csv');
  fs.writeFileSync(csvPath, csv);
  return { root, csvPath, doc: path.join(root, 'doc.md') };
}

/** A workbook whose sheet holds exactly these rows, for the pure core tests. */
function workbookOf(rows: readonly (readonly string[])[]): WorkbookData {
  return { sheets: { Sheet1: sheetSourceFromMatrix(rows) } };
}

const below = (reference: string, rows: readonly (readonly string[])[]): number | undefined =>
  currentBelowRows(parseEmbedSyntax(reference)!, workbookOf(rows));

test('the recorded count covers the rows that continue below the range, and stops at the first empty one', () => {
  const rows = [['ID', '名前'], ['A-1', '甲'], ['A-2', '乙'], ['', ''], ['備考', 'メモ']];
  // The range ends where the data ends.
  assert.equal(below('![[./f.csv#Sheet1|A1:B3]]', rows), 0);
  // A partial range: the rows below it are counted until the empty row.
  assert.equal(below('![[./f.csv#Sheet1|A1:B2]]', rows), 1);
  // A single cell is a range too (B2): only the row below it, in its own column.
  assert.equal(below('![[./f.csv#Sheet1|B2]]', rows), 1);
});

test('only the columns of the range decide whether the row below it is empty', () => {
  const rows = [['ID', '名前', '備考'], ['A-1', '甲', ''], ['', '', 'メモ'], ['', '', '続き']];
  // Row 3 (1-based) is empty inside A:B, so nothing continues below the range.
  assert.equal(below('![[./f.csv#Sheet1|A1:B2]]', rows), 0);
  // The same rows, read over A:C: the note continues below the range.
  assert.equal(below('![[./f.csv#Sheet1|A1:C2]]', rows), 2);
});

test('a reference without a range, an unknown sheet, or an unreadable range has no state to record', () => {
  const rows = [['ID', '名前'], ['A-1', '甲']];
  assert.equal(below('![[./f.csv#Sheet1]]', rows), undefined);
  assert.equal(below('![[./f.csv#Other|A1:B2]]', rows), undefined);
  assert.equal(below('![[./f.csv|A1:ZZ]]', rows), undefined);
});

test('a very long column below the range is recorded as the tracked limit', () => {
  const rows = [['ID'], ['A-1'], ...Array.from({ length: MAX_TRACKED_BELOW_ROWS + 5 }, (_, i) => [`A-${i + 2}`])];
  assert.equal(below('![[./f.csv#Sheet1|A1]]', rows), MAX_TRACKED_BELOW_ROWS);
});

test('the recorded value must be a plain count; anything else is ignored', () => {
  assert.equal(parseBelowValue('0'), 0);
  assert.equal(parseBelowValue(' 12 '), 12);
  assert.equal(parseBelowValue(String(MAX_TRACKED_BELOW_ROWS)), MAX_TRACKED_BELOW_ROWS);
  assert.equal(parseBelowValue(String(MAX_TRACKED_BELOW_ROWS + 1)), undefined);
  assert.equal(parseBelowValue(''), undefined);
  assert.equal(parseBelowValue('empty'), undefined);
  assert.equal(parseBelowValue('1,2'), undefined);
  assert.equal(parseBelowValue(null), undefined);
});

test('an unchanged reference is clean, a row inserted inside the range is reported (the D2 scene)', () => {
  const { csvPath } = project('ID,名前\nA-1,甲\nA-2,乙\n');
  const data = loadWorkbook({ absolutePath: csvPath });
  const written = parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B3?header=first&x-below=0]]')!;
  assert.equal(checkExpectedBelow(written, data)?.status, 'ok');

  // A row is inserted inside the range in Excel: the range still resolves, and the row that used to be
  // last (A-2) falls out of it and now sits directly below the range.
  fs.writeFileSync(csvPath, 'ID,名前\nA-1,甲\nA-3,丙\nA-2,乙\n');
  const after = loadWorkbook({ absolutePath: csvPath });
  const result = checkExpectedBelow(written, after);
  assert.deepEqual(result, { status: 'grew', expected: 0, actual: 1 });
  assert.equal(belowSeverity(result!), 'warning');
});

test('an intended partial range is quiet while its rows below are unchanged, whatever they are', () => {
  // The case that a plain "values follow below" rule would report on: a reference to a part of a bigger table.
  const before = 'ID,名前\nA-1,甲\nA-2,乙\nA-3,丙\nA-4,丁\n';
  const { csvPath } = project(before);
  const data = loadWorkbook({ absolutePath: csvPath });
  const written = parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B2?header=first&x-below=3]]')!;
  assert.equal(checkExpectedBelow(written, data)?.status, 'ok');

  // A value is edited below the range: the state has not changed.
  fs.writeFileSync(csvPath, 'ID,名前\nA-1,甲\nA-2,乙\nA-3,丙\nA-4,変更\n');
  assert.equal(checkExpectedBelow(written, loadWorkbook({ absolutePath: csvPath }))?.status, 'ok');

  // Rows below the range are removed: fewer rows continue below it now. This is informational, not a warning.
  fs.writeFileSync(csvPath, 'ID,名前\nA-1,甲\nA-2,乙\n');
  const shrunk = checkExpectedBelow(written, loadWorkbook({ absolutePath: csvPath }));
  assert.deepEqual(shrunk, { status: 'shrank', expected: 3, actual: 1 });
  assert.equal(belowSeverity(shrunk!), 'information');
});

test('a reference without x-below, or with an unreadable one, is reported as before', () => {
  const { csvPath } = project('ID,名前\nA-1,甲\n');
  const data = loadWorkbook({ absolutePath: csvPath });
  assert.equal(checkExpectedBelow(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B2]]')!, data), undefined);
  assert.equal(checkExpectedBelow(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B2?x-below=]]')!, data), undefined);
  assert.equal(checkExpectedBelow(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B2?x-below=many]]')!, data), undefined);
});

test('the message names both counts in the reader language', () => {
  const grew = { status: 'grew', expected: 3, actual: 4 } as const;
  assert.match(describeBelowChange(grew), /4 row\(s\).*3 when the reference was written/su);
  assert.match(describeBelowChange(grew), /x-below/u);
  assert.match(describeBelowChange(grew, 'ja'), /値のある行が4行/u);
  assert.match(describeBelowChange({ status: 'shrank', expected: 4, actual: 2 }, 'ja'), /2行/iu);
});

test('recording writes the key once, next to the other expectations, and refreshes it in place', () => {
  const { csvPath } = project('ID,名前\nA-1,甲\nA-2,乙\n');
  const data = loadWorkbook({ absolutePath: csvPath });
  const plain = { filepath: './spec.csv', sheet: 'Sheet1', range: 'A1:B3', segments: ['header=first'] };
  const recorded = withCurrentExpectedBelow(plain, data);
  assert.deepEqual(recorded.segments, ['header=first', 'x-below=0']);

  // A row is added inside the range; re-recording replaces the value instead of appending a second key.
  fs.writeFileSync(csvPath, 'ID,名前\nA-1,甲\nA-3,丙\nA-2,乙\n');
  const refreshed = withCurrentExpectedBelow(recorded, loadWorkbook({ absolutePath: csvPath }));
  assert.deepEqual(refreshed.segments, ['header=first', 'x-below=1']);
  assert.equal(refreshed.segments.filter((segment) => segment.startsWith('x-below=')).length, 1);

  // Without a range there is nothing to record; a stale key is dropped.
  const withoutRange = withCurrentExpectedBelow({ ...recorded, range: undefined, segments: ['header=first', 'x-below=0'] }, data);
  assert.deepEqual(withoutRange.segments, ['header=first']);
});

test('x-below never changes what is rendered (spec P5)', () => {
  const { csvPath } = project('ID,名前\nA-1,甲\nA-2,乙\n');
  const data = loadWorkbook({ absolutePath: csvPath });
  const withKey = buildLogicalTable(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B3?header=first&x-below=0]]')!, data);
  const withoutKey = buildLogicalTable(parseEmbedSyntax('![[./spec.csv#Sheet1|A1:B3?header=first]]')!, data);
  assert.deepEqual(withKey, withoutKey);
});

test('check reports the change with the span of the key, and does not fail the run', async () => {
  const { root, doc } = project('ID,名前\nA-1,甲\nA-2,乙\n');
  fs.writeFileSync(doc, '![[./spec.csv#Sheet1|A1:B3?header=first&x-below=0]]\n');
  assert.deepEqual(await checkPaths([doc], root), []);

  fs.writeFileSync(path.join(root, 'spec.csv'), 'ID,名前\nA-1,甲\nA-3,丙\nA-2,乙\n');
  const problems = await checkPaths([doc], root);
  assert.deepEqual(problems.map((p) => [p.code, p.severity, p.line]), [['MMI_BELOW_MISMATCH', 'warning', 1]]);
  // The span points at `x-below=...` inside the reference on line 1.
  assert.equal(problems[0].column, '![[./spec.csv#Sheet1|A1:B3?header=first&'.length + 1);
});

test('select records how many rows continue below the range', () => {
  const { csvPath } = project('ID,名前\nA-1,甲\nA-2,乙\nA-3,丙備考\n');
  const book = analyzeBook(csvPath, './spec.csv');
  const whole = selectFromBook(book, './spec.csv', { table: 'A1:B4' });
  assert.equal(whole.ok, true, JSON.stringify(whole.errors));
  assert.match(whole.reference!, /&x-below=0\]\]$/u);

  const part = selectFromBook(book, './spec.csv', { table: 'A1:B4', rows: { first: 2 } });
  assert.equal(part.ok, true, JSON.stringify(part.errors));
  assert.match(part.reference!, /&x-below=1\]\]$/u);
});
