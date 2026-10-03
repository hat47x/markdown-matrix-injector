import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { readLedger } from '../src/core/importLedger.js';
import {
  buildXlsxWithImages,
  emfOf,
  pngOf,
  screenDesignWorkbook,
} from './helpers/buildXlsxWithImages.js';

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

function portable(target: string): string {
  return path.relative(process.cwd(), target).split(path.sep).join('/')
    || path.basename(target);
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
  assert.equal(summary.status, 'created');
  assert.equal(summary.sourceInput, portable(source));
  assert.equal(summary.source, portable(source));
  assert.equal(summary.sourceCopied, false);
  assert.equal(summary.extractedImages, 4);
  assert.deepEqual(summary.imageProblems, []);
  assert.deepEqual(summary.reviewSkippedImages, []);
  assert.deepEqual(summary.reviewSkippedTables, []);
  assert.equal(fs.existsSync(draft), true);
  const markdown = fs.readFileSync(draft, 'utf8');
  assert.match(markdown, /!\[\[\.\.\/design\.xlsx#画面一覧\|A1:B3\?header=first\]\]/u);
  assert.equal((markdown.match(/<!-- mmi:extracted /gu) ?? []).length, 4);

  const assetDir = path.join(root, 'docs', 'assets', 'design');
  assert.equal(fs.readdirSync(assetDir).length, 2);
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

test('mmi import contains draft, assets, ledger and source intake within --root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-outside-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  for (const argv of [
    ['import', source, '--root', root, '--draft', path.join(outside, 'draft.md')],
    ['import', source, '--root', root, '--draft', path.join(root, 'draft.md'), '--out-dir', path.join(outside, 'assets')],
    ['import', source, '--root', root, '--draft', path.join(root, 'draft.md'), '--ledger', path.join(outside, 'ledger.json')],
    ['import', source, '--root', root, '--draft', path.join(root, 'draft.md'), '--copy-source', path.join(outside, 'design.xlsx')],
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

test('mmi import requires explicit source intake for a legacy workbook outside --root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-project-'));
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-legacy-'));
  const source = path.join(legacyRoot, 'legacy-design.xlsx');
  const draft = path.join(root, 'docs', 'legacy-design.md');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const refused = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
  ]);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /use --copy-source/u);
  assert.equal(fs.existsSync(draft), false);

  const copiedSource = path.join(root, 'sources', 'legacy-design.xlsx');
  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '--copy-source', copiedSource,
    '--json',
  ]);

  assert.equal(result.code, 0, result.err);
  const summary = JSON.parse(result.out);
  assert.equal(summary.status, 'created');
  assert.equal(summary.sourceCopied, true);
  assert.equal(summary.sourceInput, portable(source));
  assert.equal(summary.source, portable(copiedSource));
  assert.equal(fs.readFileSync(copiedSource).equals(fs.readFileSync(source)), true);
  assert.equal(fs.existsSync(draft), true);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'assets', 'legacy-design')), true);

  const markdown = fs.readFileSync(draft, 'utf8');
  const relativeSource = path.relative(path.dirname(draft), copiedSource).split(path.sep).join('/');
  assert.equal(markdown.includes(relativeSource), true);
  assert.equal(fs.readdirSync(legacyRoot).sort().join(','), 'legacy-design.xlsx');
});

test('mmi import succeeds with created-with-warnings when unsupported images are preserved as review notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-cli-'));
  const source = path.join(root, 'legacy-shape.xlsx');
  const draft = path.join(root, 'legacy-shape.md');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [{
        name: '画面',
        cells: [[0, 0, '画面']],
        anchors: [
          { kind: 'one', from: [0, 2], media: 'ok.png', name: '通常画像' },
          { kind: 'one', from: [3, 2], media: 'legacy.emf', name: '旧図形' },
        ],
      }],
      {
        'ok.png': pngOf(2, 2, [20, 30, 40]),
        'legacy.emf': emfOf(),
      },
    ),
  );

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '--json',
  ]);

  assert.equal(result.code, 0, result.err);
  const summary = JSON.parse(result.out);
  assert.equal(summary.status, 'created-with-warnings');
  assert.equal(summary.extractedImages, 1);
  assert.equal(summary.imageProblems.length, 1);
  assert.equal(summary.imageProblems[0].code, 'MMI_IMAGE_UNSUPPORTED_FORMAT');
  assert.match(result.err, /warning: MMI_IMAGE_UNSUPPORTED_FORMAT/u);
  assert.match(fs.readFileSync(draft, 'utf8'), /## 画像の注意/u);
});

test('mmi import never overwrites a different --copy-source destination', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-project-'));
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-legacy-'));
  const source = path.join(legacyRoot, 'legacy.xlsx');
  const destination = path.join(root, 'sources', 'legacy.xlsx');
  const draft = path.join(root, 'draft.md');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  fs.writeFileSync(destination, 'different-content');

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '--copy-source', destination,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.err, /already exists with different content/u);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'different-content');
  assert.equal(fs.existsSync(draft), false);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});

test('mmi import reuses an identical --copy-source destination', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-project-'));
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-legacy-'));
  const source = path.join(legacyRoot, 'legacy.xlsx');
  const destination = path.join(root, 'sources', 'legacy.xlsx');
  const draft = path.join(root, 'draft.md');
  const bytes = screenDesignWorkbook().bytes;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(source, bytes);
  fs.writeFileSync(destination, bytes);

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '--copy-source', destination,
    '--json',
  ]);

  assert.equal(result.code, 0, result.err);
  const summary = JSON.parse(result.out);
  assert.equal(summary.sourceCopied, true);
  assert.equal(fs.readFileSync(destination).equals(bytes), true);
  assert.equal(fs.existsSync(draft), true);
});

test('mmi import removes a newly copied source when the later import commit fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-project-'));
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-legacy-'));
  const source = path.join(legacyRoot, 'legacy.xlsx');
  const destination = path.join(root, 'sources', 'legacy.xlsx');
  const draft = path.join(root, 'draft.md');
  fs.writeFileSync(source, Buffer.from('not-an-xlsx'));

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', draft,
    '--copy-source', destination,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.err, /import failed/u);
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.existsSync(draft), false);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});

test('mmi import requires --copy-source to preserve the workbook extension', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-project-'));
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-legacy-'));
  const source = path.join(legacyRoot, 'legacy.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet([
    'import',
    source,
    '--root', root,
    '--draft', path.join(root, 'draft.md'),
    '--copy-source', path.join(root, 'sources', 'legacy.bin'),
  ]);

  assert.equal(result.code, 1);
  assert.match(result.err, /must keep the source extension/u);
  assert.equal(fs.existsSync(path.join(root, 'sources', 'legacy.bin')), false);
});
