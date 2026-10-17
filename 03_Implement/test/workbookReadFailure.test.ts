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
import { localizeError } from '../src/core/messages/index.js';

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

test('every workbook read failure is a LocalizedError whose sentence the preview host can phrase in Japanese', () => {
  const { bookPath, root } = workspace();
  const capture = (): Error => {
    try {
      loadWorkbook({ absolutePath: bookPath });
    } catch (error) {
      return error as Error;
    }
    throw new Error('the fixture should have failed');
  };

  fs.writeFileSync(bookPath, Buffer.alloc(0));
  assert.match(capture().message, /book\.xlsx: the file is empty/);
  assert.match(localizeError(capture(), 'ja'), /ファイルが空/);

  fs.writeFileSync(bookPath, Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(600)]));
  assert.match(capture().message, /looks password-protected/);
  assert.match(localizeError(capture(), 'ja'), /パスワードで保護/);

  fs.writeFileSync(bookPath, Buffer.from('this is not a workbook'));
  assert.match(capture().message, /the content is not an Excel workbook/);
  assert.match(localizeError(capture(), 'ja'), /Excelブックではありません/);

  fs.writeFileSync(bookPath, validWorkbookBytes().subarray(0, 40));
  assert.match(capture().message, /damaged or still being written/);
  assert.match(localizeError(capture(), 'ja'), /もう一度保存/);
});

test('CSV byte decode failures keep their Japanese sentence and gain an English one for other locales', () => {
  const { root } = workspace();
  const write = (name: string, bytes: Buffer): void => {
    fs.writeFileSync(path.join(root, name), bytes);
  };

  write('utf16.csv', Buffer.from([0xff, 0xfe, 0x61, 0x00]));
  let error: unknown;
  try {
    loadWorkbook({ absolutePath: path.join(root, 'utf16.csv') });
  } catch (e) {
    error = e;
  }
  assert.match(localizeError(error, 'ja'), /UTF-16には対応していません/);
  assert.match(localizeError(error, 'en'), /UTF-8 or CP932/);

  write('broken-utf8.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xff, 0x22, 0xfe])]));
  try {
    loadWorkbook({ absolutePath: path.join(root, 'broken-utf8.csv') });
  } catch (e) {
    error = e;
  }
  assert.match(localizeError(error, 'ja'), /UTF-8データが不正/);

  write('crud.csv', Buffer.from([0x41, 0xff, 0x42]));
  try {
    loadWorkbook({ absolutePath: path.join(root, 'crud.csv') });
  } catch (e) {
    error = e;
  }
  assert.match(localizeError(error, 'ja'), /文字コードを確認してください/);
  assert.match(localizeError(error, 'en'), /encoding/);
});
