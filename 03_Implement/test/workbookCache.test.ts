import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
