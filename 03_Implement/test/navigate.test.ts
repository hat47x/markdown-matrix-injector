import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { runSelect } from '../src/cli/navigateCommands.js';
import { analyzeBook, describeWorkbook } from '../src/navigate/catalog.js';
import { selectFromBook } from '../src/navigate/select.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FEATURES = path.join(here, 'fixtures/excel-authored/features-excel2016.xlsx');

/** A 方眼紙 book on disk: 画面項目 with No (B:C), 項目名 (D:H), 型 (I:L), 必須 (M:N). */
function gridBook(dir: string): string {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const put = (r: number, c: number, v: string, width: number) => {
    ws[XLSX.utils.encode_cell({ r, c })] = /^\d+$/.test(v) ? { t: 'n', v: Number(v) } : { t: 's', v };
    if (width > 1) merges.push({ s: { r, c }, e: { r, c: c + width - 1 } });
  };
  const widths = [2, 5, 4, 2];
  const rows = [['No', '項目名', '型', '必須'], ['1', '受注番号', '文字', '○'], ['2', '備考', '文字', ''], ['3', '受注日', '日付', '○'], ['4', '○×区分', '文字', '']];
  put(0, 1, '2. 画面項目', 13);
  rows.forEach((values, i) => {
    let col = 1;
    values.forEach((value, j) => {
      if (value) put(i + 1, col, value, widths[j]);
      else if (widths[j] > 1) merges.push({ s: { r: i + 1, c: col }, e: { r: i + 1, c: col + widths[j] - 1 } });
      col += widths[j];
    });
  });
  ws['!ref'] = 'A1:N6';
  ws['!merges'] = merges;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, '受注登録');
  const file = path.join(dir, '画面定義書.xlsx');
  fs.writeFileSync(file, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  return file;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-navigate-'));

test('the catalog lists tables by source with column letters, and holds back cell values unless asked', () => {
  const catalog = describeWorkbook(FEATURES);
  const table = catalog.sheets.find((sheet) => sheet.name === 'テーブル')!.tables[0];
  assert.equal(table.source, 'excel-table');
  assert.equal(table.excelTable, 'T_受注明細');
  assert.deepEqual(table.columns.map((c) => [c.header, c.letter, c.sheetColumn]), [['明細ID', 'A', 'B'], ['商品', 'B', 'C'], ['数量', 'C', 'D'], ['単価', 'D', 'E'], ['金額', 'E', 'F']]);
  assert.equal(table.bodyRows, 4);
  assert.equal(table.sample, undefined);
  assert.equal(catalog.sheets.find((sheet) => sheet.name === '非表示シート')!.visibility, 'veryHidden');
  assert.ok(catalog.names.some((name) => name.name === '受注一覧' && name.range === 'A1:D6'));
  assert.ok(catalog.sheets.every((sheet) => sheet.otherBlocks.every((block) => block.excerpt === undefined)));
  const withValues = describeWorkbook(FEATURES, { sampleRows: 2 });
  assert.deepEqual(withValues.sheets.find((sheet) => sheet.name === 'テーブル')!.tables[0].sample, [['L-01', 'ボルト', '10', '50', '500'], ['L-02', 'ナット', '20', '30', '600']]);
});

test('columns are chosen by header name and rows by a keyword in one column, checked by rendering', () => {
  const book = analyzeBook(FEATURES, './features.xlsx');
  const exact = selectFromBook(book, './features.xlsx', { table: 'T_受注明細', columns: ['商品', '数量'], rows: { contains: 'ボルト', column: '商品' } });
  assert.equal(exact.reference, '![[./features.xlsx#テーブル|B4:F8?columns=B,C&header=first&grep=ボルト&x-headers=商品,数量&x-table=T_受注明細&x-below=1]]');
  assert.deepEqual(exact.rows, { mode: 'contains', shown: 2, ofTotal: 4, exact: true });
  assert.deepEqual(exact.preview?.headers, ['商品', '数量']);

  const loose = selectFromBook(book, './features.xlsx', { table: 'T_受注明細', columns: ['数量', '単価'], rows: { contains: '0', column: '数量' } });
  assert.equal(loose.ok, true);
  assert.equal(loose.rows?.exact, false);
  assert.ok(loose.warnings.some((w) => w.code === 'GREP_NOT_EXACT' && w.message.includes('2行') && w.message.includes('4行')));

  const byName = selectFromBook(book, './features.xlsx', { table: '受注一覧', columns: ['顧客'] });
  assert.equal(byName.reference, '![[./features.xlsx#名前|A1:D6?columns=B&header=first&x-headers=顧客&x-below=0]]');
});

test('selection errors name what is wrong and what exists', () => {
  const book = analyzeBook(FEATURES, './features.xlsx');
  const typo = selectFromBook(book, './features.xlsx', { table: 'T_受注明細', columns: ['商品名'] });
  assert.equal(typo.ok, false);
  assert.equal(typo.errors[0].code, 'COLUMN_NOT_FOUND');
  assert.equal(typo.errors[0].suggestions?.[0], '商品');
  const hidden = selectFromBook(book, './features.xlsx', { table: 'T_受注明細', columns: ['商品'], rows: { contains: '10', column: '数量' } });
  assert.equal(hidden.errors[0].code, 'FILTER_COLUMN_NOT_SHOWN');
  const missing = selectFromBook(book, './features.xlsx', { table: '存在しない表' });
  assert.equal(missing.errors[0].code, 'TABLE_NOT_FOUND');
  assert.ok((missing.errors[0].suggestions ?? []).length > 0);
});

test('on a 方眼紙 grid, header names map to the merge anchors and the first rows narrow the range', () => {
  const file = gridBook(tmp());
  const book = analyzeBook(file, './画面定義書.xlsx');
  const required = selectFromBook(book, './画面定義書.xlsx', { sheet: '受注登録', table: '画面項目', columns: ['項目名', '必須'], rows: { contains: '○', column: '必須' } });
  assert.equal(required.reference, '![[./画面定義書.xlsx#受注登録|B2:N6?columns=C,L&header=first&grep=○&mode=table&x-headers=項目名,必須&x-below=0]]');
  // 「○×区分」 also contains ○ in 項目名: the grep shows it, and the result says so.
  assert.deepEqual(required.rows, { mode: 'contains', shown: 3, ofTotal: 4, exact: false });
  const top = selectFromBook(book, './画面定義書.xlsx', { sheet: '受注登録', table: '画面項目', columns: ['項目名'], rows: { first: 2 } });
  assert.equal(top.reference, '![[./画面定義書.xlsx#受注登録|B2:N4?columns=C&header=first&mode=table&x-headers=項目名&x-below=2]]');
});

test('the CLI select prints the reference alone and signals failure with exit codes', () => {
  const dir = tmp();
  const bookPath = gridBook(dir);
  fs.mkdirSync(path.join(dir, 'docs'));
  const run = (args: string[], options: Parameters<typeof runSelect>[1]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runSelect(args, options, { out: (t) => out.push(t), err: (t) => err.push(t), cwd: dir });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };

  const selected = run([bookPath], { sheet: '受注登録', table: '画面項目', columns: '項目名,型', from: 'docs/設計.md' });
  assert.equal(selected.code, 0);
  assert.equal(selected.out, '![[../画面定義書.xlsx#受注登録|B2:N6?columns=C,H&header=first&mode=table&x-headers=項目名,型&x-below=0]]');

  assert.equal(run([bookPath], {}).code, 2);
  assert.equal(run([bookPath], { table: 'x', contains: 'a', first: '1' }).code, 2);
  assert.equal(run([bookPath], { table: '存在しない表' }).code, 1);
});
