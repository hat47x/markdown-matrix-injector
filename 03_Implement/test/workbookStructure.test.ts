import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { cellRangeToA1 } from '../src/core/tableGeometry.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { analyzeSheetForImport } from '../src/importAssist/importCandidates.js';
import { readWorkbookStructure } from '../src/importAssist/workbookStructure.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const XLSX_FILE = path.join(here, 'fixtures/excel-authored/features-excel2016.xlsx');
const XLSB_FILE = path.join(here, 'fixtures/excel-authored/features-excel2016.xlsb');

test('names written by Excel are classified and plain references resolved (whole rows/columns cut to the used range)', () => {
  for (const file of [XLSX_FILE, XLSB_FILE]) {
    const structure = readWorkbookStructure(file, loadWorkbook({ absolutePath: file }));
    const names = Object.fromEntries(structure.names.map((name) => [name.name, [name.kind, name.scope ?? '', name.range ? cellRangeToA1(name.range) : '']]));
    assert.deepEqual(names, {
      ローカル範囲: ['range', '名前', 'A2:B3'],
      壊れた名前: ['broken', '', ''],
      金額列: ['columns', '', 'D1:D6'],
      見出し行: ['rows', '', 'A1:F1'],
      受注一覧: ['range', '', 'A1:D6'],
      上限件数: ['constant', '', ''],
      税率: ['cell', '', 'F2'],
      動的範囲: ['formula', '', ''],
    }, path.extname(file));
  }
});

test('Excel tables, hidden rows/columns, filters and sheet visibility come from the workbook itself', () => {
  const structure = readWorkbookStructure(XLSX_FILE);
  assert.deepEqual(structure.tables.map((table) => [table.name, table.sheet, cellRangeToA1(table.range), table.headerRowCount, table.totalsRowCount, table.columns]), [
    ['T_受注明細', 'テーブル', 'B4:F9', 1, 1, ['明細ID', '商品', '数量', '単価', '金額']],
  ]);
  const sheets = Object.fromEntries(structure.sheets.map((sheet) => [sheet.name, sheet]));
  assert.deepEqual(sheets['フィルター'].hiddenRows, [2, 4, 7, 8]);
  assert.equal(cellRangeToA1(sheets['フィルター'].autofilter!), 'A1:B5');
  assert.deepEqual([sheets['モダン'].hiddenRows, sheets['モダン'].hiddenColumns], [[10], [3]]);
  assert.equal(sheets['非表示シート'].visibility, 'veryHidden');
  assert.deepEqual(readWorkbookStructure(XLSB_FILE).unavailable, ['tables'], '.xlsb tables are binary parts the reader does not decode');
});

test('an Excel table becomes the table candidate as declared, without its totals row, and hidden rows are called out', () => {
  const workbook = loadWorkbook({ absolutePath: XLSX_FILE });
  const structure = readWorkbookStructure(XLSX_FILE, workbook);
  const options = { referencePath: './features.xlsx', workbook, structure };
  const [table] = analyzeSheetForImport('テーブル', workbook.sheets['テーブル'], options).filter((c) => c.role === 'table');
  assert.equal(table.excelTable, 'T_受注明細');
  assert.deepEqual(table.reasons, ['excel-table']);
  assert.equal(table.proposal?.reference, '![[./features.xlsx#テーブル|B4:F8?header=first]]');
  assert.deepEqual(table.proposal?.preview.headers, ['明細ID', '商品', '数量', '単価', '金額']);
  assert.deepEqual(table.cautions.map((caution) => caution.code), ['totals-row-excluded']);

  const [named] = analyzeSheetForImport('名前', workbook.sheets['名前'], options).filter((c) => c.role === 'table');
  assert.deepEqual(named.names, ['受注一覧']);

  const [filtered] = analyzeSheetForImport('フィルター', workbook.sheets['フィルター'], options).filter((c) => c.role === 'table');
  assert.ok(filtered.cautions.some((caution) => caution.code === 'hidden-rows' && caution.message.includes('3・5行目')));
});

test('spilled values and in-cell checkboxes (as Excel 365 stores them) read as plain values', () => {
  // Built from the published file format: a dynamic-array anchor (cm="1") with
  // spilled cached values below it, and booleans styled as checkboxes.
  const ws = XLSX.utils.aoa_to_sheet([['seq', 'done'], [1, true], [2, false]]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'S');
  const CFB = (XLSX as unknown as { CFB: { read(d: Uint8Array, o: object): unknown; find(c: unknown, n: string): { content: Uint8Array }; write(c: unknown, o: object): Uint8Array } }).CFB;
  const zip = CFB.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const entry = CFB.find(zip, '/xl/worksheets/sheet1.xml');
  entry.content = Buffer.from(
    Buffer.from(entry.content)
      .toString('utf8')
      .replace(/<c r="A2"([^>]*)><v>1<\/v><\/c>/, '<c r="A2"$1 cm="1"><f t="array" ref="A2:A3">_xlfn.SEQUENCE(2)</f><v>1</v></c>'),
    'utf8',
  );
  const read = XLSX.read(CFB.write(zip, { fileType: 'zip', type: 'buffer' }), { type: 'buffer', dense: true });
  const rows = (read.Sheets.S['!data'] as { w?: string; v?: unknown }[][]).map((row) => row.map((cell) => cell?.w ?? String(cell?.v ?? '')));
  assert.deepEqual(rows, [['seq', 'done'], ['1', 'TRUE'], ['2', 'FALSE']]);
});
