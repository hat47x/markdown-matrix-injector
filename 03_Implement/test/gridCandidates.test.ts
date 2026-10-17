import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';
import { tableCandidates } from '../src/adapters/tableRegionAdapter.js';
import { extractTable } from '../src/cli/extract.js';
import { inspectSource } from '../src/cli/mmi.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';

/** 受注登録: a 方眼紙 table (No B:C, 項目名 D:H, 必須 I:J) under a numbered heading, and a plain table elsewhere. */
function book(): string {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const put = (r: number, c: number, v: string, width = 1) => {
    ws[XLSX.utils.encode_cell({ r, c })] = /^\d+$/.test(v) ? { t: 'n', v: Number(v) } : { t: 's', v };
    if (width > 1) merges.push({ s: { r, c }, e: { r, c: c + width - 1 } });
  };
  put(0, 1, '2. 画面項目', 9);
  const rows = [['No', '項目名', '必須'], ['1', '受注番号', '○'], ['2', '備考', ''], ['3', '受注日', '○']];
  const widths = [2, 5, 2];
  rows.forEach((values, i) => {
    let col = 1;
    values.forEach((value, j) => {
      if (value) put(i + 1, col, value, widths[j]);
      col += widths[j];
    });
  });
  ws['!ref'] = 'A1:J5';
  ws['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '画面');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-grid-cand-'));
  const file = path.join(dir, '設計.xlsx');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return file;
}

test('a 方眼紙 table is one table Candidate whose reference shows its logical columns', () => {
  const file = book();
  const sheet = loadWorkbook({ absolutePath: file }).sheets['画面'];
  const [candidate] = tableCandidates({ source: './設計.xlsx', sourceDigest: `sha256:${'0'.repeat(64)}`, sheetName: '画面', sheet });
  assert.equal(candidate.locator.range, 'B2:J5');
  assert.equal(candidate.reference, '![[./設計.xlsx#画面|B2:J5?header=first&columns=A,C,H]]');
  assert.equal(candidate.claims.find((claim) => claim.aspect === 'header')?.status, 'inferred');
  assert.ok(candidate.claims.find((claim) => claim.aspect === 'boundary')?.evidence?.some((e) => e.code === 'merged-grid-columns' && e.detail === '3'));
});

test('inspect lists the 方眼紙 table with the reference that renders it, and extract writes the logical table', () => {
  const file = book();
  const inspected = inspectSource(file, 0, path.join(path.dirname(file), 'doc.md'));
  assert.equal(inspected.sheets[0].regions[0].reference, '![[./設計.xlsx#画面|B2:J5?header=first&columns=A,C,H]]');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-grid-out-'));
  const result = extractTable({ sourcePath: file, sheet: '画面', range: 'B2:J5', outDir: out, fromDocument: path.join(path.dirname(file), 'doc.md') });
  assert.deepEqual(result.problems, []);
  assert.match(result.extracted!.markdown, /^\| No \| 項目名 \| 必須 \|\n\| --- \| --- \| --- \|\n\| 1 \| 受注番号 \| ○ \|\n\| 2 \| 備考 \|  \|\n\| 3 \| 受注日 \| ○ \|/);
});

test('select --candidate takes a table Candidate straight from inspect, and select/find report the same identity', async () => {
  const { runSelect, runFind } = await import('../src/cli/navigateCommands.js');
  const file = book();
  const dir = path.dirname(file);
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out: (t: string) => out.push(t), err: (t: string) => err.push(t), cwd: dir, lines: { out, err } };
  };
  const inspected = inspectSource(file, 0, path.join(dir, 'doc.md'));
  assert.ok(inspected.candidates.length > 0);
  const table = inspected.candidates.find((c) => c.kind === 'table-range')!;
  const fingerprint = table.fingerprint.digest;

  const a = io();
  assert.equal(runSelect([file], { candidate: fingerprint, columns: '項目名,必須', from: path.join(dir, 'doc.md'), json: true }, a), 0);
  const selected = JSON.parse(a.lines.out.join(''));
  assert.equal(selected.result.reference, '![[./設計.xlsx#画面|B2:J5?columns=C,H&header=first&x-headers=項目名,必須&x-below=0]]'.replace('./設計', './' + path.basename(file, '.xlsx')));
  assert.equal(selected.candidate.fingerprint, fingerprint, 'the selection is traceable to the Candidate');

  const stale = io();
  assert.equal(runSelect([file], { candidate: 'sha256:' + '0'.repeat(64) }, stale), 1);
  assert.match(stale.lines.err.join(''), /no table Candidate with fingerprint/);
  assert.equal(runSelect([file], { candidate: fingerprint, table: 'x' }, io()), 2);

  const f = io();
  const code = await runFind(['画面の画面項目の表'], { root: dir, from: path.join(dir, 'doc.md'), json: true }, f);
  assert.equal(code, 0, f.lines.out.join('') + f.lines.err.join(''));
  assert.equal(JSON.parse(f.lines.out.join('')).candidates[0].candidate.fingerprint, fingerprint);
});
