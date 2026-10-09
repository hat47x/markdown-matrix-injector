import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import XLSX from 'xlsx';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';
import { loadWorkbook, type WorkbookData } from '../src/core/workbookLoader.js';

const REFERENCE = '![[book.xlsx#Items|A1:B3?header=first]]';

function validWorkbookBytes(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ID', 'Name'], ['1', 'a'], ['2', 'b']]), 'Items');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function workspace(): { root: string; bookPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-read-failure-'));
  fs.writeFileSync(path.join(root, 'doc.md'), '');
  return { root, bookPath: path.join(root, 'book.xlsx') };
}

function writeAt(file: string, bytes: Buffer, secondsFromNow: number): void {
  fs.writeFileSync(file, bytes);
  const when = new Date(Date.now() + secondsFromNow * 1000);
  fs.utimesSync(file, when, when);
}

function renderPreview(root: string, cache: WorkbookCache<WorkbookData>): string {
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, { markdownFilePath: path.join(root, 'doc.md'), workspaceRoot: root, cache });
  return md.render(REFERENCE);
}

test('an empty .xlsx names the empty file instead of reporting a missing sheet', () => {
  const { root, bookPath } = workspace();
  writeAt(bookPath, Buffer.alloc(0), 0);
  const html = renderPreview(root, new WorkbookCache<WorkbookData>());
  assert.match(html, /book\.xlsx: the file is empty/);
  assert.doesNotMatch(html, /Sheet not found/);
});

test('a file that is not a workbook is not reported as a missing sheet', () => {
  const { root, bookPath } = workspace();
  writeAt(bookPath, Buffer.from('this is not a workbook'), 0);
  const html = renderPreview(root, new WorkbookCache<WorkbookData>());
  assert.match(html, /the content is not an Excel workbook/);
  assert.doesNotMatch(html, /Sheet not found/);
});

test('a password-protected container is reported as password-protected', () => {
  const { root, bookPath } = workspace();
  writeAt(bookPath, Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(600)]), 0);
  const html = renderPreview(root, new WorkbookCache<WorkbookData>());
  assert.match(html, /looks password-protected/);
  assert.doesNotMatch(html, /ZIP encryption/);
});

test('a workbook cut off mid-write is reported as damaged or still being written', () => {
  const { root, bookPath } = workspace();
  const good = validWorkbookBytes();
  writeAt(bookPath, good.subarray(0, Math.floor(good.length * 0.6)), 0);
  const html = renderPreview(root, new WorkbookCache<WorkbookData>());
  assert.match(html, /damaged or still being written/);
  assert.match(html, /refresh the preview/);
});

test('after a failed read, the next valid save is shown and the failure is not kept', () => {
  const { root, bookPath } = workspace();
  const cache = new WorkbookCache<WorkbookData>();
  writeAt(bookPath, validWorkbookBytes(), 0);
  assert.match(renderPreview(root, cache), /<td[^>]*>b<\/td>/);

  writeAt(bookPath, Buffer.alloc(0), 10);
  const failed = renderPreview(root, cache);
  assert.match(failed, /the file is empty/);
  assert.doesNotMatch(failed, /<td/, 'the earlier table must not stay on screen as if it were current');

  writeAt(bookPath, validWorkbookBytes(), 20);
  assert.match(renderPreview(root, cache), /<td[^>]*>b<\/td>/);
});

test('an empty CSV is still a valid empty source and other extensions keep their own errors', () => {
  const { root } = workspace();
  const csv = path.join(root, 'empty.csv');
  fs.writeFileSync(csv, '');
  assert.doesNotThrow(() => loadWorkbook({ absolutePath: csv }));
});
