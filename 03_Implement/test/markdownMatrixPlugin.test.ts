import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import XLSX from 'xlsx';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';

function createMarkdownIt(markdownFilePath: string, workspaceRoot?: string): MarkdownIt {
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    markdownFilePath,
    workspaceRoot,
    cache: new WorkbookCache(),
  });
  return md;
}

function createCsvFixture(rows: string[][]): { markdownFilePath: string; filePath: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-csv-'));
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const filePath = path.join(docsDir, 'roles.csv');
  fs.writeFileSync(filePath, rows.map((row) => row.join(',')).join('\n'));
  return {
    markdownFilePath: path.join(docsDir, 'spec.md'),
    filePath,
  };
}

test('markdownMatrixPlugin renders csv embeds as html tables', () => {
  const fixture = createCsvFixture([
    ['Name', 'Role'],
    ['Alice', 'Admin'],
    ['Bob', 'User'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:B3?header=first]]');

  assert.match(html, /<table class="mmi-table">/);
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  assert.match(html, /<td>Alice<\/td><td>Admin<\/td>/);
});

test('markdownMatrixPlugin supports columns and grep query parameters', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
    ['2', 'Bob', 'User'],
    ['3', 'Carol', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C4?header=first&columns=B,C&grep=Admin]]');

  assert.doesNotMatch(html, /<th>ID<\/th>/);
  assert.match(html, /<th>Name<\/th><th>Role<\/th>/);
  assert.match(html, /<td>Alice<\/td><td>Admin<\/td>/);
  assert.match(html, /<td>Carol<\/td><td>Admin<\/td>/);
  assert.doesNotMatch(html, /Bob/);
});

test('markdownMatrixPlugin supports transpose and numeric header rows', () => {
  const fixture = createCsvFixture([
    ['Metric', 'Q1', 'Q2'],
    ['Revenue', '10', '20'],
    ['Cost', '5', '8'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C3?transpose=true&header=2]]');

  assert.match(html, /<th>Q1<\/th><th>10<\/th><th>5<\/th>/);
  assert.match(html, /<td>Metric<\/td><td>Revenue<\/td><td>Cost<\/td>/);
});



test('markdownMatrixPlugin renders card mode without loading a table', () => {
  const fixture = createCsvFixture([
    ['ID', 'Name', 'Role'],
    ['1', 'Alice', 'Admin'],
  ]);

  const md = createMarkdownIt(fixture.markdownFilePath);
  const html = md.render('![[./roles.csv#Sheet1|A1:C2?mode=card]]');

  assert.match(html, /class="mmi-card"/);
  assert.match(html, /roles.csv/);
  assert.match(html, /Sheet1 \/ A1:C2/);
  assert.doesNotMatch(html, /mmi-table/);
});

test('markdownMatrixPlugin resolves workspace fallback paths and xlsx sheets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-xlsx-'));
  const docsDir = path.join(tempDir, 'docs');
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['ID', 'State'],
    ['1', 'Draft'],
    ['2', 'Done'],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'States');
  XLSX.writeFile(workbook, path.join(workspaceDir, 'states.xlsx'));

  const md = createMarkdownIt(path.join(docsDir, 'spec.md'), workspaceDir);
  const html = md.render('prefix ![[states.xlsx#States|A1:B3?header=first]] suffix');

  assert.match(html, /prefix/);
  assert.match(html, /<td>1<\/td><td>Draft<\/td>/);
  assert.match(html, /suffix/);
});

test('markdownMatrixPlugin emits error html for unsupported xml', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-plugin-xml-'));
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'broken.xml'), '<root />');

  const md = createMarkdownIt(path.join(docsDir, 'spec.md'));
  const html = md.render('![[./broken.xml]]');

  assert.match(html, /class="mmi-error"/);
  assert.match(html, /Unsupported XML format/);
});
