import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { readLedger } from '../src/core/importLedger.js';
import { screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

async function quiet(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalError = console.error;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    outChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errChunks.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      out: outChunks.join(''),
      err: errChunks.join('\n'),
    };
  } finally {
    process.stdout.write = originalOut;
    console.error = originalError;
  }
}

test('mmi import creates one modernization draft, content-addressed assets and the shared ledger', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const source = path.join(root, 'design.xlsx');
  const draft = path.join(root, 'docs', 'design.md');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '--json',
  ]);

  assert.equal(result.code, 0, result.err);
  const summary = JSON.parse(result.out);
  assert.equal(summary.extractedImages, 4);
  assert.deepEqual(summary.imageProblems, []);
  assert.equal(fs.existsSync(draft), true);
  const markdown = fs.readFileSync(draft, 'utf8');
  assert.match(markdown, /!\[\[\.\.\/design\.xlsx#画面一覧\|A1:B3\?header=first\]\]/u);
  assert.equal((markdown.match(/<!-- mmi:extracted /gu) ?? []).length, 4);

  const assetDir = path.join(root, 'docs', 'assets', 'design');
  assert.deepEqual(fs.readdirSync(assetDir).length, 2);
  const ledger = readLedger(path.join(root, 'mmi-ledger.json'));
  assert.equal(ledger.entries.length, 4);
  assert.ok(ledger.entries.every((entry) => entry.kind === 'image'));
});

test('mmi import refuses to overwrite an existing draft', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const source = path.join(root, 'design.xlsx');
  const draft = path.join(root, 'design.md');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  fs.writeFileSync(draft, 'keep me');

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.err, /refusing to overwrite/u);
  assert.equal(fs.readFileSync(draft, 'utf8'), 'keep me');
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});

test('mmi import contains draft, assets and ledger within --root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-outside-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  for (const argv of [
    ['import', source, '--root', root, '--draft', path.join(outside, 'draft.md')],
    ['import', source, '--root', root, '--draft', path.join(root, 'draft.md'), '--out-dir', path.join(outside, 'assets')],
    ['import', source, '--root', root, '--draft', path.join(root, 'draft.md'), '--ledger', path.join(outside, 'ledger.json')],
  ]) {
    const result = await quiet(argv);
    assert.equal(result.code, 2);
    assert.match(result.err, /must stay within --root workspace/u);
  }

  assert.equal(fs.readdirSync(outside).length, 0);
});

test('mmi import requires an explicit draft destination', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet(['import', source, '--root', root]);

  assert.equal(result.code, 2);
  assert.match(result.err, /import needs --draft/u);
});


test('mmi import keeps --draft distinct from generic -o output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const source = path.join(root, 'design.xlsx');
  const draft = path.join(root, 'draft.md');
  const accidentalOut = path.join(root, 'summary.txt');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '-o', accidentalOut,
  ]);

  assert.equal(result.code, 2);
  assert.match(result.err, /does not use -o\/--out/u);
  assert.equal(fs.existsSync(draft), false);
  assert.equal(fs.existsSync(accidentalOut), false);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});


test('mmi import rejects a not-yet-created output below a symlink that leaves --root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-outside-'));
  const source = path.join(root, 'design.xlsx');
  const link = path.join(root, 'linked-outside');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', path.join(root, 'draft.md'),
    '--out-dir', path.join(link, 'new-assets'),
  ]);

  assert.equal(result.code, 2);
  assert.match(result.err, /must stay within --root workspace/u);
  assert.equal(fs.existsSync(path.join(outside, 'new-assets')), false);
  assert.equal(fs.existsSync(path.join(root, 'draft.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});
