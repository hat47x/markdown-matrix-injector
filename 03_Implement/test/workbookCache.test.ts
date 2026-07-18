import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { resolveSourcePath } from '../src/core/pathResolver.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';

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

  assert.deepEqual(workbook.sheets.Sheet1, [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['Bob', 'User'],
  ]);
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

  assert.deepEqual(workbook.sheets.Sheet1, [
    ['Name', 'Role'],
    ['Alice', 'Admin'],
  ]);
});

test('loadWorkbook rejects generic xml files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-xml-'));
  const filePath = path.join(tempDir, 'matrix.xml');
  fs.writeFileSync(filePath, '<root><item>nope</item></root>');

  assert.throws(() => loadWorkbook({ absolutePath: filePath }), /Unsupported XML format/);
});

// ── CSV: RFC4180 quoting (correctness fix — the naive line.split(',')
// implementation this replaces silently misaligned every column after a
// comma inside a quoted cell) ──────────────────────────────────────────────

function loadCsv(contents: string): string[][] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-csv-quote-'));
  const filePath = path.join(tempDir, 'matrix.csv');
  fs.writeFileSync(filePath, contents);
  return loadWorkbook({ absolutePath: filePath }).sheets.Sheet1;
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
  XLSX.writeFile(workbook, filePath);

  const rows = loadWorkbook({ absolutePath: filePath }).sheets.Sheet1;

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
  XLSX.writeFile(workbook, filePath);

  const rows = loadWorkbook({ absolutePath: filePath }).sheets.Sheet1;

  assert.deepEqual(rows, [
    ['Price', 'Percent', 'Label'],
    ['1234.5', '0.15', '2026-04-03 as text'],
  ]);
});
