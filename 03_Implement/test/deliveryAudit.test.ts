import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';

import { auditDeliveryReferences } from '../src/application/deliveryAudit.js';

function fixture(t: { after(callback: () => void): void }, count = 2) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  fs.mkdirSync(docs);
  fs.mkdirSync(excel);
  const files: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const filename = `設計書-${String(index).padStart(2, '0')}.xlsx`;
    const file = path.join(excel, filename);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['ID', '名称', '区分'],
      [index, `画面${index}`, '設計対象'],
    ]), '基本設計');
    XLSX.writeFile(book, file);
    files.push(file);
  }
  const markdownFilePath = path.join(docs, 'delivery.md');
  const references = (subset: string[] = files) => [
    '# 納品構成',
    '## 基本設計',
    ...subset.map(file => `![[../excel/${path.basename(file)}]]`),
  ].join('\n');
  const write = (text: string) => { fs.writeFileSync(markdownFilePath, text); return text; };
  const cli = (extra: string[]) => spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/bootstrap.ts', 'delivery-audit', markdownFilePath, excel, '--root', root, '--json', ...extra],
    { encoding: 'utf8' },
  );
  return { root, docs, excel, files, markdownFilePath, references, write, cli };
}

test('16 genuine XLSX workbooks are matched in stable order without changing originals', (t) => {
  const f = fixture(t, 16);
  f.write(f.references());
  const before = f.files.map(file => fs.readFileSync(file));
  const result = f.cli([]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, 'mmi.delivery-audit/v0');
  assert.equal(report.document, 'docs/delivery.md');
  assert.equal(report.comparison.alignment, 'aligned');
  assert.equal(report.inventory.consistency, 'per-file-observation');
  assert.equal(report.comparison.consistency, 'independent-observations');
  assert.equal(report.comparison.counts.matched, 16);
  assert.equal(report.delivery.counts.references, 16);
  assert.equal(report.inventory.entries.length, 16);
  assert.ok(report.inventory.entries.every((entry: { identity?: { digest: string } }) =>
    /^sha256:[a-f0-9]{64}$/u.test(entry.identity?.digest ?? '')));
  assert.deepEqual(f.files.map(file => fs.readFileSync(file)), before);
  const reread = f.cli([]);
  assert.equal(reread.status, 0, reread.stderr);
  assert.deepEqual(JSON.parse(reread.stdout), report);
});

test('an unlisted workbook and a broken declared link remain separate differences', (t) => {
  const f = fixture(t, 16);
  f.write(f.references(f.files.slice(0, 15)) + '\n![[../excel/not-present.xlsx]]');
  const result = f.cli([]);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.comparison.alignment, 'differences');
  assert.equal(report.comparison.counts.matched, 15);
  assert.equal(report.comparison.counts['reference-missing'], 1);
  assert.equal(report.comparison.counts['inventory-unreferenced'], 1);
  assert.equal(report.comparison.findings.find((item: { relation: string }) =>
    item.relation === 'inventory-unreferenced').path,
  'excel/設計書-16.xlsx');
});

test('duplicate references and equal bytes in separate files retain their identities', (t) => {
  const f = fixture(t);
  fs.copyFileSync(f.files[0], f.files[1]);
  f.write(f.references() + `\n![[../excel/${path.basename(f.files[0])}]]`);
  const report = auditDeliveryReferences({
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
    inventoryDirectory: f.excel,
  });
  assert.equal(report.comparison.alignment, 'aligned');
  assert.equal(report.comparison.counts.matched, 3);
  assert.equal(report.delivery.counts.sameContentDifferentFiles, 1);
  assert.equal(report.delivery.counts.duplicateReferences, 1);
  assert.equal(report.inventory.entries.length, 2);
});

test('a restrictive byte limit leaves excluded workbook evidence indeterminate', (t) => {
  const f = fixture(t);
  f.write(f.references());
  const result = f.cli(['--max-bytes', '1']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.inventory.status, 'partial');
  assert.equal(report.comparison.alignment, 'indeterminate');
  assert.equal(report.comparison.counts['inventory-unverifiable'], 2);
  assert.equal(report.comparison.counts['reference-missing'], 0);
});

test('a narrower directory scope is not misreported as missing Excel sources', (t) => {
  const f = fixture(t);
  f.write(f.references());
  const narrow = path.join(f.excel, 'sub');
  fs.mkdirSync(narrow);
  const report = auditDeliveryReferences({
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
    inventoryDirectory: narrow,
  });
  assert.equal(report.comparison.alignment, 'indeterminate');
  assert.equal(report.comparison.counts['reference-outside-inventory-scope'], 2);
  assert.equal(report.comparison.counts['reference-not-in-inventory'], 0);
});

test('an empty whole-file declaration is indeterminate even with physical files', (t) => {
  const f = fixture(t);
  f.write('# 参考表\n![[../excel/設計書-01.xlsx#基本設計|A1:B2]]\n');
  const result = f.cli([]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.delivery.referentialCompleteness, 'empty');
  assert.equal(report.comparison.counts['inventory-unreferenced'], 2);
});

test('CLI requires explicit --root and --json, and forbids output writes or unsupported options', (t) => {
  const f = fixture(t);
  f.write(f.references());
  const out = path.join(f.root, 'report.json');
  const notJson = spawnSync(process.execPath, [
    '--import', 'tsx', 'src/cli/bootstrap.ts', 'delivery-audit', f.markdownFilePath, f.excel, '--root', f.root,
  ], { encoding: 'utf8' });
  assert.equal(notJson.status, 2);
  const noRoot = spawnSync(process.execPath, [
    '--import', 'tsx', 'src/cli/bootstrap.ts', 'delivery-audit', f.markdownFilePath, f.excel, '--json',
  ], { encoding: 'utf8' });
  assert.equal(noRoot.status, 2);
  assert.equal(f.cli(['-o', out]).status, 2);
  assert.equal(fs.existsSync(out), false);
  assert.equal(f.cli(['--inspect']).status, 2);
  assert.equal(f.cli(['--exclude', '設計書-01.xlsx']).status, 2);
});

test('Markdown outside the workspace is rejected without reading its contents', (t) => {
  const f = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const outsideFile = path.join(outside, 'outside.md');
  fs.writeFileSync(outsideFile, '# secret body\n');
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', 'src/cli/bootstrap.ts', 'delivery-audit', outsideFile, f.excel,
    '--root', f.root, '--json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout + result.stderr, /secret body/u);
});

test('the reference scan reports Workspace-escaping Excel paths without exposing bytes', (t) => {
  const f = fixture(t);
  f.write('# 納品\n![[../../outside.xlsx]]\n![[../excel/設計書-01.xlsx]]');
  const result = f.cli([]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.delivery.counts.outsideWorkspace, 1);
  assert.equal(report.comparison.counts['reference-blocked'], 1);
  assert.equal(report.comparison.counts['inventory-unreferenced'], 1);
});
