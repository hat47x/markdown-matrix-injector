import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { resolveSourcePath } from '../src/core/pathResolver.js';
import { loadWorkbook, loadWorkbookFromBytes, type SheetSource } from '../src/core/workbookLoader.js';
import { sliceRegion } from '../src/core/tableGeometry.js';

/** Materialises a whole `SheetSource` (its used range) as a display matrix, for
 * assertions that compare against a plain `string[][]` fixture. */
function sheetToMatrix(sheet: SheetSource): string[][] {
  return sliceRegion(sheet);
}

test('WorkbookCache reuses workbook for identical mtime', () => {
  const cache = new WorkbookCache<{ id: number }>();
  const snapshot = { mtimeMs: 100 };
  let loads = 0;

  const first = cache.getOrCreate('file.xlsx', snapshot, () => {
    loads += 1;
    return { id: 1 };
  });
  const second = cache.getOrCreate('file.xlsx', snapshot, () => {
    loads += 1;
    return { id: 2 };
  });

  assert.equal(first, second);
  assert.equal(loads, 1);
});

test('WorkbookCache clear forces a reload even when filesystem mtime did not advance', () => {
  const cache = new WorkbookCache<{ value: string }>();
  const snapshot = { mtimeMs: 100 };

  const before = cache.getOrCreate('file.xlsx', snapshot, () => ({
    value: 'before save',
  }));
  cache.clear();
  const after = cache.getOrCreate('file.xlsx', snapshot, () => ({
    value: 'after save',
  }));

  assert.equal(before.value, 'before save');
  assert.equal(after.value, 'after save');
  assert.notEqual(before, after);
});


test('resolveSourcePath prefers markdown-relative path and falls back to workspace root', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-path-'));
  const docsDir = path.join(tempDir, 'docs');
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'matrix.csv'), 'A,B');

  const resolved = resolveSourcePath({
    markdownFilePath: path.join(docsDir, 'spec.md'),
    sourcePath: 'matrix.csv',
    workspaceRoot: workspaceDir,
  });

  assert.equal(resolved, path.join(workspaceDir, 'matrix.csv'));
});

test('loadWorkbook parses csv content into Sheet1', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-csv-'));
  const filePath = path.join(tempDir, 'matrix.csv');
  fs.writeFileSync(filePath, 'Name,Role\nAlice,Admin\nBob,User\n');

  const workbook = loadWorkbook({ absolutePath: filePath });

  assert.deepEqual(sheetToMatrix(workbook.sheets.Sheet1), [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['Bob', 'User'],
  ]);
});



test('loadWorkbookFromBytes matches the production path loader for CSV and XLSX', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workbook-bytes-'));

  const csvPath = path.join(tempDir, 'matrix.csv');
  fs.writeFileSync(csvPath, 'Name,Role\nAlice,Admin\n');
  assert.deepEqual(
    sheetToMatrix(loadWorkbookFromBytes(csvPath, fs.readFileSync(csvPath)).sheets.Sheet1),
    sheetToMatrix(loadWorkbook({ absolutePath: csvPath }).sheets.Sheet1),
  );

  const xlsxPath = path.join(tempDir, 'matrix.xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['ID', 'State'], ['1', 'Open']]), 'States');
  fs.writeFileSync(xlsxPath, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const fromBytes = loadWorkbookFromBytes(xlsxPath, fs.readFileSync(xlsxPath));
  const fromPath = loadWorkbook({ absolutePath: xlsxPath });
  assert.deepEqual(sheetToMatrix(fromBytes.sheets.States), sheetToMatrix(fromPath.sheets.States));
});

test('loadWorkbook accepts XML Spreadsheet 2003 files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xml-ok-'));
  const filePath = path.join(tempDir, 'matrix.xml');
  fs.writeFileSync(
    filePath,
    `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Table>
      <Row><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">Role</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Alice</Data></Cell><Cell><Data ss:Type="String">Admin</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`,
  );

  const workbook = loadWorkbook({ absolutePath: filePath });

  assert.deepEqual(sheetToMatrix(workbook.sheets.Sheet1), [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);
});

test('loadWorkbook rejects generic xml files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xml-'));
  const filePath = path.join(tempDir, 'matrix.xml');
  fs.writeFileSync(filePath, '<root><item>nope</item></root>');

  assert.throws(() => loadWorkbook({ absolutePath: filePath }), /Invalid XML Spreadsheet/);
});

// ── CSV: RFC4180 quoting (correctness fix — the naive line.split(',')
// implementation this replaces silently misaligned every column after a
// comma inside a quoted cell) ──────────────────────────────────────────────

function loadCsv(contents: string): string[][] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-csv-quote-'));
  const filePath = path.join(tempDir, 'matrix.csv');
  fs.writeFileSync(filePath, contents);
  return sheetToMatrix(loadWorkbook({ absolutePath: filePath }).sheets.Sheet1);
}

test('loadWorkbook keeps a comma inside a quoted cell as one field', () => {
  const rows = loadCsv('Name,Notes\nAlice,"Smith, John contact"\nBob,plain note\n');

  assert.deepEqual(rows, [
    ['Name', 'Notes'],
    ['Alice', 'Smith, John contact'],
    ['Bob', 'plain note'],
  ]);
});

test('loadWorkbook unescapes doubled quotes inside a quoted cell', () => {
  const rows = loadCsv('A,B\n1,"say ""hi"""\n');

  assert.deepEqual(rows, [
    ['A', 'B'],
    ['1', 'say "hi"'],
  ]);
});

test('loadWorkbook keeps an embedded newline inside a quoted cell as one logical row', () => {
  const rows = loadCsv('A,B\n1,"line1\nline2"\n2,plain\n');

  assert.deepEqual(rows, [
    ['A', 'B'],
    ['1', 'line1\nline2'],
    ['2', 'plain'],
  ]);
});

test('loadWorkbook trims unquoted cells but preserves whitespace inside quoted cells', () => {
  const rows = loadCsv('A,B\n" padded ", unquoted \n');

  assert.deepEqual(rows, [
    ['A', 'B'],
    [' padded ', 'unquoted'],
  ]);
});

test('loadWorkbook handles a quoted cell containing multiple commas and a trailing empty cell', () => {
  const rows = loadCsv('RuleId,QueryExample,Owner\nR1,"header=first&columns=A,B,C,J,K",author\n');

  assert.deepEqual(rows, [
    ['RuleId', 'QueryExample', 'Owner'],
    ['R1', 'header=first&columns=A,B,C,J,K', 'author'],
  ]);
});

test('loadWorkbook still parses plain (unquoted) CSV exactly as before', () => {
  const rows = loadCsv('Name,Role\nAlice,Admin\nBob,User\n');

  assert.deepEqual(rows, [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['Bob', 'User'],
  ]);
});

// ── CSV: physical record positions are source coordinates. A leading blank
// record still occupies a row; the parser must not compact the file before A1
// addressing is applied. A single final line terminator is structural, while
// repeated final terminators preserve the blank records between them. ──────

test('loadWorkbook preserves leading blank CSV rows so the header keeps its physical row number', () => {
  const rows = loadCsv('\n\nName,Role\nAlice,Admin\n');

  // Slicing returns a rectangle (input-assistance-source-model.md, option D): a blank record is as wide as the used range.
  assert.deepEqual(rows, [
    ['', ''],
    ['', ''],
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);
});

test('loadWorkbook does not invent a blank CSV row for a single trailing line terminator', () => {
  assert.deepEqual(loadCsv('Name,Role\nAlice,Admin\n'), [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);
});

test('loadWorkbook preserves an explicit trailing blank CSV record', () => {
  assert.deepEqual(loadCsv('Name,Role\nAlice,Admin\n\n'), [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['', ''],
  ]);
});

// ── XLSX: date cells render as unambiguous ISO-8601 (not locale-ambiguous
// short-form like "4/3/26", which a SIer-design-document reader could misread
// as either April 3 or March 4) ─────────────────────────────────────────────

test('loadWorkbook renders a real (Excel-typed) date cell as YYYY-MM-DD, not locale-ambiguous short form', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xlsx-date-'));
  const filePath = path.join(tempDir, 'dates.xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'EffectiveFrom'],
    ['Alice', new Date(2026, 3, 3)], // month is 0-indexed: April 3, 2026
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  fs.writeFileSync(filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  const rows = sheetToMatrix(loadWorkbook({ absolutePath: filePath }).sheets.Sheet1);

  assert.deepEqual(rows, [
    ['Name', 'EffectiveFrom'],
    ['Alice', '2026-04-03'],
  ]);
});

test('loadWorkbook leaves non-date numeric cells and date-like text cells untouched', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xlsx-date-'));
  const filePath = path.join(tempDir, 'mixed.xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Price', 'Percent', 'Label'],
    [1234.5, 0.15, '2026-04-03 as text'],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  fs.writeFileSync(filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  const rows = sheetToMatrix(loadWorkbook({ absolutePath: filePath }).sheets.Sheet1);

  assert.deepEqual(rows, [
    ['Price', 'Percent', 'Label'],
    ['1234.5', '0.15', '2026-04-03 as text'],
  ]);
});

// ── XLSX: origin-preserving coordinates, blank rows, error cells, declared
// merges (issue-0114 / ADR-0016). Fixed reproduction:
// input-assistance-source-model.md §1. `aoa_to_sheet` always originates at
// A1, so these fixtures are built from explicit cell addresses instead --
// the same shape `XLSX.read()` sees for a real Excel-authored workbook whose
// used range starts away from A1. ───────────────────────────────────────────

/** Writes a worksheet built from explicit `{ addr: cellObject }` entries (not
 * `aoa_to_sheet`, which always originates at A1) and returns the loaded
 * `SheetSource`. */
function loadXlsxSheet(cells: Record<string, XLSX.CellObject>, ref: string, merges?: XLSX.Range[]): SheetSource {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xlsx-origin-'));
  const filePath = path.join(tempDir, 'sheet.xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet: XLSX.WorkSheet = { ...cells, '!ref': ref, ...(merges ? { '!merges': merges } : {}) };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  fs.writeFileSync(filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  return loadWorkbook({ absolutePath: filePath }).sheets.Sheet1;
}

test('loadWorkbook preserves a non-A1 used-range origin and a genuinely blank row in between', () => {
  // The flagship reproduction: used range starts at C5 (not A1), row 9 is
  // entirely blank between two populated rows.
  const sheet = loadXlsxSheet(
    {
      C5: { t: 's', v: 'ID' }, D5: { t: 's', v: '操作' },
      C6: { t: 's', v: 'ST-001' }, D6: { t: 's', v: '申請' },
      C8: { t: 's', v: 'ST-004' }, D8: { t: 's', v: '取消' },
    },
    'C5:D8',
  );

  assert.deepEqual(sheetToMatrix(sheet), [
    ['ID', '操作'],
    ['ST-001', '申請'],
    ['', ''],
    ['ST-004', '取消'],
  ]);
  // The same block must be addressable by its real A1 coordinates -- this is
  // what makes `![[...|C5:D8]]` show the right cells instead of an A1-relative
  // 4-row slice from a completely different part of the sheet.
  assert.deepEqual(sliceRegion(sheet, 'C5:D8'), sheetToMatrix(sheet));
});

test('loadWorkbook exposes a cached error value as its display text instead of an empty string', () => {
  const sheet = loadXlsxSheet(
    { A1: { t: 's', v: 'Result' }, A2: { t: 'e', v: 7, f: '1/0' } },
    'A1:A2',
  );

  assert.deepEqual(sheetToMatrix(sheet), [['Result'], ['#DIV/0!']]);
});

test('loadWorkbook exposes declared merges without inferring them from adjacent blank cells', () => {
  const sheet = loadXlsxSheet(
    { A1: { t: 's', v: '合計' } },
    'A1:B2',
    [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }], // A1:B2 declares only A1:B1 merged
  );

  assert.deepEqual(sheet.merges, [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }]);
});

test('loadWorkbook reports no merges when none are declared, even with adjacent blank cells', () => {
  const sheet = loadXlsxSheet({ A1: { t: 's', v: 'x' } }, 'A1:B2');
  assert.deepEqual(sheet.merges, []);
});

test('sliceRegion with no range reads the sheet\'s used range, not an assumed A1 block', () => {
  const sheet = loadXlsxSheet({ C5: { t: 's', v: 'only-cell' } }, 'C5:C5');
  assert.deepEqual(sliceRegion(sheet), [['only-cell']]);
});
