import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';

test('T7: byte-aligned delivery can include a non-OOXML file named xlsx', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-format-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  fs.mkdirSync(docs);
  fs.mkdirSync(excel);

  const valid = path.join(excel, 'valid.xlsx');
  const invalid = path.join(excel, 'invalid.xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ID', '名称'],
    [1, '設計'],
  ]), 'Design');
  fs.writeFileSync(valid, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const invalidBytes = Buffer.from('NOT-AN-OOXML-WORKBOOK\n', 'utf8');
  fs.writeFileSync(invalid, invalidBytes);
  const markdown = path.join(docs, 'delivery.md');
  fs.writeFileSync(markdown, [
    '# Delivery',
    '![[../excel/invalid.xlsx]]',
    '![[../excel/valid.xlsx]]',
  ].join('\n'));

  // Independent narrow negative oracle: these bytes do not start with the
  // ZIP local file header. It is NOT a general OOXML/XLSX validator.
  const zipLocalFileHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  assert.notDeepEqual(invalidBytes.subarray(0, 4), zipLocalFileHeader);
  assert.deepEqual(fs.readFileSync(valid).subarray(0, 4), zipLocalFileHeader);

  const before = [fs.readFileSync(invalid), fs.readFileSync(valid)];
  const cli = spawnSync(process.execPath, [
    '--import', 'tsx', 'src/cli/bootstrap.ts',
    'delivery-audit', markdown, excel, '--root', root, '--json',
  ], { encoding: 'utf8' });

  assert.equal(cli.status, 0, cli.stderr);
  const report = JSON.parse(cli.stdout);
  assert.equal(report.comparison.alignment, 'aligned');
  assert.equal(report.comparison.counts.matched, 2);
  assert.equal(report.delivery.counts.resolved, 2);
  assert.equal(report.inventory.status, 'complete');
  assert.equal(report.inventory.inspectionRequested, false);
  assert.equal(report.inventory.entries[0].state, 'identified');
  assert.equal(report.inventory.entries[0].identity.digest, report.delivery.references[0].digest);
  assert.deepEqual([fs.readFileSync(invalid), fs.readFileSync(valid)], before);
});
