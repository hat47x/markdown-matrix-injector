import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';

import { auditDeliveryReferences } from '../src/application/deliveryAudit.js';

const digest = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture(t: { after(callback: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-revision-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  fs.mkdirSync(docs);
  fs.mkdirSync(excel);
  const workbook = path.join(excel, 'a.xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ID', '説明'],
    [1, '元原本'],
  ]), 'Design');
  fs.writeFileSync(workbook, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const document = path.join(docs, 'delivery.md');
  const d0 = '# Delivery\n![[../excel/a.xlsx]]\n';
  fs.writeFileSync(document, d0);
  const audit = () => auditDeliveryReferences({
    markdownFilePath: document,
    inventoryDirectory: excel,
    workspaceRoot: root,
  });
  const cli = () => spawnSync(process.execPath, [
    '--import', 'tsx', 'src/cli/bootstrap.ts',
    'delivery-audit', document, excel, '--root', root, '--json',
  ], { encoding: 'utf8' });
  return { root, document, workbook, d0, audit, cli };
}

test('T13 S13-1/2: unsaved editor text is not the on-disk Markdown audited by CLI', (t) => {
  const f = fixture(t);
  const editorBuffer = f.d0 + '![[../excel/missing.xlsx]]\n';
  assert.notEqual(digest(Buffer.from(editorBuffer)), digest(fs.readFileSync(f.document)));

  const onDiskReport = f.audit();
  assert.equal(onDiskReport.comparison.alignment, 'aligned');
  assert.equal(onDiskReport.delivery.counts.references, 1);
  assert.equal(f.cli().status, 0);
  // The editor buffer is merely in memory. The CLI cannot inspect its extra reference.
  assert.equal(fs.readFileSync(f.document, 'utf8'), f.d0);

  fs.writeFileSync(f.document, editorBuffer);
  const savedResult = f.cli();
  assert.equal(savedResult.status, 1, savedResult.stderr);
  const afterSave = JSON.parse(savedResult.stdout);
  assert.equal(afterSave.comparison.alignment, 'differences');
  assert.equal(afterSave.comparison.counts['reference-missing'], 1);
  assert.equal(afterSave.delivery.counts.references, 2);
});

test('T13 S13-3: identical audit JSON does not pin the raw Markdown revision', (t) => {
  const f = fixture(t);
  const beforeBytes = fs.readFileSync(f.document);
  const first = f.audit();
  assert.equal(first.comparison.alignment, 'aligned');

  // This prose is not a file-only Excel embed, and is after the existing reference.
  fs.appendFileSync(f.document, '\nEdited explanatory prose.\n');
  const afterBytes = fs.readFileSync(f.document);
  assert.notEqual(digest(beforeBytes), digest(afterBytes));

  const second = f.audit();
  assert.deepEqual(second, first);
  assert.equal(second.document, 'docs/delivery.md');
  assert.equal(Object.hasOwn(second, 'documentDigest'), false);
  assert.equal(Object.hasOwn(second, 'markdownDigest'), false);
});

test('T13 S13-4: a later independent consumer may read different source bytes', (t) => {
  const f = fixture(t);
  const report = f.audit();
  assert.equal(report.comparison.alignment, 'aligned');
  const auditedDigest = report.delivery.references[0].digest;
  const oldBytes = fs.readFileSync(f.workbook);
  assert.equal(auditedDigest, digest(oldBytes));

  // Deliberately modify the source after the successful audit.
  fs.appendFileSync(f.workbook, Buffer.from('changed-after-audit'));
  // This simulates a subsequent independent byte consumer, NOT the real renderer.
  const consumedBytes = fs.readFileSync(f.workbook);
  assert.notEqual(digest(consumedBytes), auditedDigest);
  assert.equal(report.comparison.alignment, 'aligned');

  const next = f.audit();
  assert.equal(next.comparison.alignment, 'aligned');
  assert.equal(next.delivery.references[0].digest, digest(consumedBytes));
});
