import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classify, readLedger } from '../src/core/importLedger.js';
import { inspectSource } from '../src/cli/mmi.js';
import { materializeWorkbookImport } from '../src/importAssist/importMaterialization.js';
import { buildXlsxWithImages, emfOf, pngOf, screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

const digest = (file: string): string =>
  `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('one workbook import keeps tables linked and materializes embedded images into the shared ledger', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-materialize-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'docs', 'design-import.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.mkdirSync(path.dirname(draftPath), { recursive: true });
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  const sourceBefore = digest(sourcePath);

  const result = materializeWorkbookImport({
    sourcePath,
    draftPath,
    ledgerPath,
  });

  assert.equal(result.imageProblems.length, 0);
  assert.equal(result.extractedImages.length, 4);
  assert.equal(fs.readdirSync(result.imageOutDir).length, 2, 'duplicate image bytes share one asset file');
  assert.equal((result.markdown.match(/<!-- mmi:extracted /gu) ?? []).length, 4);
  assert.match(
    result.markdown,
    /!\[\[\.\.\/design\.xlsx#画面一覧\|A1:B3\?header=first\]\]/u,
  );
  assert.match(result.markdown, /### 抽出した画像/u);
  assert.match(result.markdown, /ログイン画面のダンプ/u);
  assert.match(result.markdown, /メニュー画面/u);
  assert.equal(digest(sourcePath), sourceBefore, 'source workbook remains byte-identical');

  const ledger = readLedger(ledgerPath);
  assert.equal(ledger.entries.length, 4);
  assert.ok(ledger.entries.every((entry) => entry.kind === 'image'));

  const inspected = inspectSource(sourcePath, 0, draftPath);
  const imageStates = inspected.candidates
    .filter((candidate) => candidate.kind === 'image')
    .map((candidate) => classify(ledger, ledgerPath, sourcePath, candidate));
  assert.deepEqual(imageStates, ['imported', 'imported', 'imported', 'imported']);

  const table = inspected.candidates.find(
    (candidate) => candidate.kind === 'table-range'
      && candidate.locator.sheet === '画面一覧'
      && candidate.locator.range === 'A1:B3',
  );
  assert.ok(table);
  assert.equal(
    classify(ledger, ledgerPath, sourcePath, table),
    'unimported',
    'Linked tables are not falsely recorded as Extracted',
  );
});

test('re-running the same workbook import is idempotent for assets and occurrence ledger entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-materialize-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'design-import.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const first = materializeWorkbookImport({ sourcePath, draftPath, ledgerPath });
  const firstFiles = fs.readdirSync(first.imageOutDir).sort();
  const firstLedger = readLedger(ledgerPath);

  const second = materializeWorkbookImport({ sourcePath, draftPath, ledgerPath });
  const secondFiles = fs.readdirSync(second.imageOutDir).sort();
  const secondLedger = readLedger(ledgerPath);

  assert.deepEqual(second.extractedImages.map((image) => image.status), [
    'unchanged',
    'unchanged',
    'unchanged',
    'unchanged',
  ]);
  assert.deepEqual(secondFiles, firstFiles);
  assert.equal(secondLedger.entries.length, firstLedger.entries.length);
  assert.equal(secondLedger.entries.length, 4);
  assert.equal(second.markdown, first.markdown);
});

test('an image that cannot become a Markdown asset stays visible as an import warning', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-materialize-'));
  const sourcePath = path.join(root, 'legacy-shape.xlsx');
  const draftPath = path.join(root, 'legacy-shape-import.md');
  const png = pngOf(2, 2, [20, 30, 40]);
  const bytes = buildXlsxWithImages(
    [{
      name: '画面',
      cells: [[0, 0, '画面']],
      anchors: [
        { kind: 'one', from: [0, 2], media: 'ok.png', name: '通常画像' },
        { kind: 'one', from: [3, 2], media: 'legacy.emf', name: '旧図形' },
      ],
    }],
    { 'ok.png': png, 'legacy.emf': emfOf() },
  );
  fs.writeFileSync(sourcePath, bytes);

  const result = materializeWorkbookImport({ sourcePath, draftPath });

  assert.equal(result.extractedImages.length, 1);
  assert.equal(result.imageProblems.length, 1);
  assert.equal(result.imageProblems[0].sheet, '画面');
  assert.equal(result.imageProblems[0].code, 'MMI_IMAGE_UNSUPPORTED_FORMAT');
  assert.match(result.markdown, /## 画像の注意/u);
  assert.match(result.markdown, /MMI_IMAGE_UNSUPPORTED_FORMAT/u);
  assert.match(result.markdown, /\[画面\]/u);
  assert.match(result.markdown, /通常画像/u);
  assert.match(result.markdown, /旧図形/u);
});
