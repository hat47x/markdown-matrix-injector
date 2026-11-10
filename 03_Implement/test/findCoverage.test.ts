import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';
import { describeFindCoverage, FIND_MAX_CANDIDATES, runFind } from '../src/cli/navigateCommands.js';
import { WorkspaceRegionIndex } from '../src/search/workspaceRegionIndex.js';
import { loadWorkbookFromBytes } from '../src/core/workbookLoader.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-find-coverage-'));
}

function writeBook(file: string, sheet: string): void {
  const rows = [['ID', '名称', '数量'], ['A-1', 'ボルト', 10], ['A-2', 'ナット', 20], ['A-3', 'ワッシャ', 30]];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheet);
  fs.writeFileSync(file, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

async function find(root: string, query: string): Promise<{ code: number; json: any }> {
  const out: string[] = [];
  const code = await runFind([query], { root, json: true } as never, { out: (text) => out.push(text), err: () => undefined, cwd: root });
  return { code, json: JSON.parse(out.join('\n')) };
}

test('find reports workbooks it could not read, so no-match is not read as "nothing there"', async () => {
  const root = tmp();
  try {
    // A password-protected book is a CFB container; an empty file and a text file are not workbooks either.
    fs.writeFileSync(path.join(root, '受注一覧.xlsx'), Buffer.from('d0cf11e0a1b11ae10000', 'hex'));
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', '空.xlsx'), '');
    fs.writeFileSync(path.join(root, 'sub', '偽物.xlsx'), 'not a workbook');
    const { code, json } = await find(root, '受注一覧');
    assert.equal(code, 1);
    assert.equal(json.status, 'no-match');
    assert.deepEqual(json.coverage.unreadable, [
      { path: 'sub/偽物.xlsx', reason: 'not-a-workbook' },
      { path: 'sub/空.xlsx', reason: 'empty' },
      { path: '受注一覧.xlsx', reason: 'password-protected' },
    ]);
    assert.equal(json.coverage.booksListed, 3);
    assert.equal(json.coverage.booksIndexed, 0);
    assert.equal(json.coverage.indexCapped, false);
    assert.equal(json.coverage.candidatesTruncated, false);
    // No host path or file text leaks into the result.
    assert.ok(!JSON.stringify(json).includes(root.replace(/\\/g, '\\\\')), 'coverage must not carry the host path');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('find on a readable workspace reports full coverage and no unreadable books', async () => {
  const root = tmp();
  try {
    writeBook(path.join(root, '部品表.xlsx'), '部品表');
    const { code, json } = await find(root, '部品表');
    assert.equal(code, 0);
    assert.deepEqual(json.coverage, { booksListed: 1, booksIndexed: 1, unreadable: [], indexCapped: false, cancelled: false, candidatesTruncated: false, maxCandidates: FIND_MAX_CANDIDATES });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('find marks the candidate list as truncated only when more than the cap matched', async () => {
  const root = tmp();
  try {
    const sheets = ['部品表A', '部品表B', '部品表C', '部品表D', '部品表E', '部品表F', '部品表G'];
    for (const sheet of sheets) writeBook(path.join(root, `${sheet}.xlsx`), '部品表');
    const many = await find(root, '部品表');
    assert.equal(many.json.candidates.length, FIND_MAX_CANDIDATES);
    assert.equal(many.json.coverage.candidatesTruncated, true);
    for (const sheet of sheets.slice(FIND_MAX_CANDIDATES - 1)) fs.rmSync(path.join(root, `${sheet}.xlsx`));
    const few = await find(root, '部品表');
    assert.equal(few.json.candidates.length, FIND_MAX_CANDIDATES - 1);
    assert.equal(few.json.coverage.candidatesTruncated, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the index reports capped when the region limit stops it, and describeFindCoverage passes that on', async () => {
  const root = tmp();
  try {
    const files = ['a.xlsx', 'b.xlsx', 'c.xlsx'].map((name) => path.join(root, name));
    for (const file of files) writeBook(file, '部品表');
    const index = new WorkspaceRegionIndex({
      loadWorkbook: (file) => loadWorkbookFromBytes(file, fs.readFileSync(file)),
      statFile: (file) => ({ mtimeMs: fs.statSync(file).mtimeMs, size: fs.statSync(file).size }),
      maxRegions: 1,
    });
    const refreshed = await index.refresh(files);
    assert.equal(refreshed.capped, true);
    const coverage = describeFindCoverage(refreshed, root, files.length, false);
    assert.equal(coverage.indexCapped, true);
    assert.equal(coverage.booksListed, 3);
    assert.ok(coverage.booksIndexed < 3, 'a capped refresh must not claim every book was indexed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
