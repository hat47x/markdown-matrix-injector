import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { extractTable } from '../src/cli/extract.js';
import { main } from '../src/cli/mmi.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-table-extract-'));
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  const source = path.join(data, 'roles.csv');
  const doc = path.join(docs, 'spec.md');
  fs.writeFileSync(source, 'ID,操作,備考\nOP-01,申請,a|b\nOP-02,承認,\n');
  fs.writeFileSync(doc, '# Spec\n');
  return {
    root,
    source,
    doc,
    outDir: path.join(docs, 'assets'),
    ledgerPath: path.join(root, 'mmi-ledger.json'),
  };
}

const digest = (file: string) =>
  `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('extractTable writes a standard GFM asset, records provenance, and never changes the source', () => {
  const f = workspace();
  const sourceBefore = digest(f.source);

  const result = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.equal(result.extracted.status, 'written');
  assert.match(path.basename(result.extracted.file), /^table-[0-9a-f]{12}\.md$/u);
  assert.equal(digest(result.extracted.file), result.extracted.digest);
  assert.match(
    result.extracted.markdown,
    /^\| ID \| 操作 \| 備考 \|\n\| --- \| --- \| --- \|\n\| OP-01 \| 申請 \| a\\\|b \|\n\| OP-02 \| 承認 \|  \|/u,
  );
  assert.match(
    result.extracted.markdown,
    /<!-- mmi:extracted-table source="\.\.\/data\/roles\.csv" sheet="Sheet1" range="A1:C3" source-sha256="[0-9a-f]{64}" candidate-sha256="[0-9a-f]{64}" -->$/u,
  );
  assert.equal(digest(f.source), sourceBefore);

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'table-range');
  assert.equal(ledger.entries[0].sheet, 'Sheet1');
  assert.equal(ledger.entries[0].place, 'A1:C3');
  assert.equal(ledger.entries[0].basis, 'mmi extract --table');
  assert.deepEqual(ledger.entries[0].conversion, {
    mode: 'gfm-table-v1',
    header: 'first',
  });

  const again = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:C3',
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
  });
  assert.deepEqual(again.problems, []);
  assert.equal(again.extracted?.status, 'unchanged');
  assert.equal(again.extracted?.file, result.extracted.file);
});

test('extractTable rejects arbitrary ranges that are not current table Candidates', () => {
  const f = workspace();
  const result = extractTable({
    sourcePath: f.source,
    sheet: 'Sheet1',
    range: 'A1:B2',
    outDir: f.outDir,
    fromDocument: f.doc,
    ledgerPath: f.ledgerPath,
  });

  assert.equal(result.extracted, undefined);
  assert.equal(result.problems[0]?.code, 'MMI_TABLE_CANDIDATE_NOT_FOUND');
  assert.equal(fs.existsSync(f.outDir), false);
  assert.equal(fs.existsSync(f.ledgerPath), false);
});

async function captureMain(argv: string[]): Promise<{ code: number; output: string }> {
  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    return { code: await main(argv), output: written.join('') };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('CLI table extraction joins the existing ledger and unimported Candidate workflow', async () => {
  const f = workspace();

  assert.equal((await captureMain(['extract', f.source, '--root', f.root])).code, 2);
  assert.equal(
    (await captureMain([
      'extract',
      f.source,
      '--image',
      'all',
      '--table',
      'A1:C3',
      '--sheet',
      'Sheet1',
      '--root',
      f.root,
    ])).code,
    2,
  );
  assert.equal(
    (await captureMain([
      'extract',
      f.source,
      '--table',
      'A1:C3',
      '--root',
      f.root,
    ])).code,
    2,
  );

  const extracted = await captureMain([
    'extract',
    f.source,
    '--table',
    'A1:C3',
    '--sheet',
    'Sheet1',
    '--out-dir',
    f.outDir,
    '--from',
    f.doc,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(extracted.code, 0);
  const payload = JSON.parse(extracted.output);
  assert.equal(payload.extracted.sheet, 'Sheet1');
  assert.equal(payload.extracted.range, 'A1:C3');

  const unimported = await captureMain([
    'inspect',
    f.source,
    '--from',
    f.doc,
    '--root',
    f.root,
    '--unimported',
    '--json',
  ]);
  assert.equal(unimported.code, 0);
  const inspected = JSON.parse(unimported.output);
  assert.equal(
    inspected.candidates.some(
      (candidate: any) =>
        candidate.kind === 'table-range'
        && candidate.locator.sheet === 'Sheet1'
        && candidate.locator.range === 'A1:C3',
    ),
    false,
  );
});
