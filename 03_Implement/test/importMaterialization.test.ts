import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classify, readLedger } from '../src/core/importLedger.js';
import {
  recordDeferredDecision,
  recordRejectedDecision,
} from '../src/core/candidateReviewDecisions.js';
import { buildCandidateReviewInventory } from '../src/application/candidateReviewInventory.js';
import { inspectSource } from '../src/cli/mmi.js';
import { loadWorkbookFromBytes } from '../src/core/workbookLoader.js';
import {
  materializeWorkbookImport,
  writeWorkbookImportDraft,
} from '../src/importAssist/importMaterialization.js';
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
  assert.equal(result.sourceDigest, digest(sourcePath));
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
  assert.ok(ledger.entries.every((entry) => entry.basis === 'mmi import'));

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


test('an image-free workbook stays a normal import without image warnings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-materialize-'));
  const sourcePath = path.join(root, 'plain.xlsx');
  const draftPath = path.join(root, 'plain-import.md');
  fs.writeFileSync(
    sourcePath,
    buildXlsxWithImages(
      [{ name: '一覧', cells: [[0, 0, 'コード'], [0, 1, '名称'], [1, 0, '01'], [1, 1, '受付']] }],
      {},
    ),
  );

  const result = materializeWorkbookImport({ sourcePath, draftPath });

  assert.equal(result.extractedImages.length, 0);
  assert.deepEqual(result.imageProblems, []);
  assert.doesNotMatch(result.markdown, /画像の注意/u);
  assert.match(result.markdown, /!\[\[\.\/plain\.xlsx#一覧\|A1:B2\?header=first\]\]/u);
});

test('an image-only sheet still renders its extracted image instead of being called empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-materialize-'));
  const sourcePath = path.join(root, 'image-only.xlsx');
  const draftPath = path.join(root, 'image-only-import.md');
  fs.writeFileSync(
    sourcePath,
    buildXlsxWithImages(
      [{ name: '図', anchors: [{ kind: 'one', from: [1, 1], media: 'diagram.png', name: '構成図' }] }],
      { 'diagram.png': pngOf(3, 3, [80, 90, 100]) },
    ),
  );

  const result = materializeWorkbookImport({ sourcePath, draftPath });

  assert.equal(result.extractedImages.length, 1);
  assert.match(result.markdown, /## 図/u);
  assert.match(result.markdown, /### 抽出した画像/u);
  assert.match(result.markdown, /構成図/u);
  assert.doesNotMatch(result.markdown, /## 図\n\n> 内容がありません。/u);
});


test('linked and missing workbook images stay visible as import warnings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-materialize-'));
  const sourcePath = path.join(root, 'broken-images.xlsx');
  const draftPath = path.join(root, 'broken-images-import.md');
  fs.writeFileSync(
    sourcePath,
    buildXlsxWithImages(
      [{
        name: '画面',
        cells: [[0, 0, '画面']],
        anchors: [
          { kind: 'one', from: [0, 2], media: 'remote.png', name: '外部画像', via: 'link' },
          { kind: 'one', from: [3, 2], media: 'missing.png', name: '欠落画像', missing: true },
        ],
      }],
      {},
    ),
  );

  const result = materializeWorkbookImport({ sourcePath, draftPath });
  const codes = result.imageProblems.map((problem) => problem.code);

  assert.equal(result.extractedImages.length, 0);
  assert.ok(codes.includes('MMI_IMAGE_EXTERNAL_LINK'));
  assert.ok(codes.includes('MMI_IMAGE_MEDIA_MISSING'));
  assert.match(result.markdown, /## 画像の注意/u);
  assert.match(result.markdown, /MMI_IMAGE_EXTERNAL_LINK/u);
  assert.match(result.markdown, /MMI_IMAGE_MEDIA_MISSING/u);
  assert.match(result.markdown, /\[画面\]/u);
});


test('transactional workbook import writes the draft only after materialization succeeds', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-commit-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'docs', 'design.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const result = writeWorkbookImportDraft({
    sourcePath,
    draftPath,
    ledgerPath,
  });

  assert.equal(fs.readFileSync(draftPath, 'utf8'), result.markdown);
  assert.equal(result.extractedImages.length, 4);
  assert.equal(readLedger(ledgerPath).entries.length, 4);
});

test('workbook analysis failure happens before asset or ledger side effects', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-rollback-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'docs', 'design.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const imageOutDir = path.join(root, 'docs', 'assets', 'design');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  fs.mkdirSync(imageOutDir, { recursive: true });
  fs.writeFileSync(path.join(imageOutDir, 'keep.txt'), 'pre-existing asset');
  const ledgerBefore = '{\n  "schema": "mmi.ledger/v1",\n  "entries": []\n}\n';
  fs.writeFileSync(ledgerPath, ledgerBefore);
  const preparedSourceDigest = digest(sourcePath);

  assert.throws(
    () => writeWorkbookImportDraft({
      sourcePath,
      draftPath,
      ledgerPath,
      imageOutDir,
      // Invalid prepared analysis data must fail before extraction begins.
      workbook: { sheets: null } as any,
      preparedSourceDigest,
    }),
  );

  assert.equal(fs.existsSync(draftPath), false);
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), ledgerBefore);
  assert.deepEqual(fs.readdirSync(imageOutDir), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(imageOutDir, 'keep.txt'), 'utf8'), 'pre-existing asset');
});

test('transactional workbook import never overwrites an existing draft or mutates assets/ledger', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-existing-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'design.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  fs.writeFileSync(draftPath, 'existing draft');

  assert.throws(
    () => writeWorkbookImportDraft({ sourcePath, draftPath, ledgerPath }),
    /MMI_IMPORT_DRAFT_EXISTS/u,
  );

  assert.equal(fs.readFileSync(draftPath, 'utf8'), 'existing draft');
  assert.equal(fs.existsSync(ledgerPath), false);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'design')), false);
});


test('transactional workbook import aborts and rolls back when the source changes during the operation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-source-change-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'docs', 'design.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const imageOutDir = path.join(root, 'docs', 'assets', 'design');
  const initialBytes = screenDesignWorkbook().bytes;
  const changedBytes = screenDesignWorkbook({
    login: pngOf(8, 6, [10, 180, 70]),
  }).bytes;
  fs.writeFileSync(sourcePath, initialBytes);
  const preparedSourceDigest = digest(sourcePath);
  const frozenWorkbook = loadWorkbookFromBytes(sourcePath, initialBytes);
  let changed = false;
  const workbook = {
    get sheets() {
      if (!changed) {
        fs.writeFileSync(sourcePath, changedBytes);
        changed = true;
      }
      return frozenWorkbook.sheets;
    },
  } as any;

  assert.throws(
    () => writeWorkbookImportDraft({
      sourcePath,
      draftPath,
      ledgerPath,
      imageOutDir,
      workbook,
      preparedSourceDigest,
    }),
    /MMI_IMPORT_SOURCE_CHANGED/u,
  );

  assert.equal(changed, true);
  assert.equal(fs.existsSync(draftPath), false);
  assert.equal(fs.existsSync(ledgerPath), false);
  assert.equal(fs.existsSync(imageOutDir), false);
  assert.equal(digest(sourcePath), `sha256:${createHash('sha256').update(changedBytes).digest('hex')}`);
});


test('workbook import rejects overlapping output roles before mutation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-path-role-'));
  const sourcePath = path.join(root, 'design.xlsx');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  const sourceBefore = digest(sourcePath);

  const cases = [
    {
      draftPath: path.join(root, 'same.json'),
      ledgerPath: path.join(root, 'same.json'),
      imageOutDir: path.join(root, 'assets'),
    },
    {
      draftPath: path.join(root, 'docs', 'draft.md'),
      ledgerPath: sourcePath,
      imageOutDir: path.join(root, 'assets'),
    },
    {
      draftPath: path.join(root, 'out', 'draft.md'),
      ledgerPath: path.join(root, 'ledger.json'),
      imageOutDir: path.join(root, 'out'),
    },
    {
      draftPath: path.join(root, 'draft.md'),
      ledgerPath: path.join(root, 'out', 'ledger.json'),
      imageOutDir: path.join(root, 'out'),
    },
    {
      draftPath: path.join(root, 'draft.md'),
      ledgerPath: path.join(root, 'ledger.json'),
      imageOutDir: root,
    },
  ];

  for (const options of cases) {
    assert.throws(
      () => writeWorkbookImportDraft({ sourcePath, ...options }),
      /MMI_IMPORT_OUTPUT_CONFLICT/u,
    );
  }

  assert.equal(digest(sourcePath), sourceBefore);
  assert.equal(fs.existsSync(path.join(root, 'same.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'ledger.json')), false);
});


test('prepared workbook data must be explicitly bound to the current source snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-prepared-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'design.md');
  const bytes = screenDesignWorkbook().bytes;
  fs.writeFileSync(sourcePath, bytes);
  const workbook = loadWorkbookFromBytes(sourcePath, bytes);

  assert.throws(
    () => writeWorkbookImportDraft({
      sourcePath,
      draftPath,
      workbook,
    }),
    /MMI_IMPORT_PREPARED_SOURCE_DIGEST_REQUIRED/u,
  );
  assert.equal(fs.existsSync(draftPath), false);

  assert.throws(
    () => writeWorkbookImportDraft({
      sourcePath,
      draftPath,
      workbook,
      preparedSourceDigest: 'sha256:' + '0'.repeat(64),
    }),
    /MMI_IMPORT_PREPARED_SOURCE_STALE/u,
  );
  assert.equal(fs.existsSync(draftPath), false);
});


test('bulk import preserves exact rejected and deferred image decisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-review-gate-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'draft.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const decisionPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const inventory = buildCandidateReviewInventory(sourcePath, './design.xlsx');
  const images = inventory.items.filter((item) => item.kind === 'image');
  assert.equal(images.length, 4);
  recordRejectedDecision(
    decisionPath,
    sourcePath,
    images[0].candidate,
    'test rejection',
  );
  recordDeferredDecision(
    decisionPath,
    sourcePath,
    images[1].candidate,
    'test defer',
  );

  const result = writeWorkbookImportDraft({
    sourcePath,
    draftPath,
    ledgerPath,
    reviewDecisionsPath: decisionPath,
  });

  assert.deepEqual(
    result.reviewSkippedImages.map((item) => [item.ordinal, item.code]),
    [
      [1, 'MMI_IMPORT_REVIEW_REJECTED'],
      [2, 'MMI_IMPORT_REVIEW_DEFERRED'],
    ],
  );
  assert.deepEqual(
    result.extractedImages.map((item) => item.ordinal),
    [3, 4],
  );
  assert.equal(readLedger(ledgerPath).entries.length, 2);
  assert.match(result.markdown, /## 既存のレビュー判断/u);
  assert.match(result.markdown, /却下 \[画面一覧\] 「ログイン画面」/u);
  assert.match(result.markdown, /保留 \[画面一覧\] 「メニュー画面」/u);
});

test('changed reviewed image basis returns to bulk import instead of inheriting rejection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-review-refresh-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'draft.md');
  const decisionPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const inventory = buildCandidateReviewInventory(sourcePath, './design.xlsx');
  const image = inventory.items.find(
    (item) => item.kind === 'image' && item.image.ordinal === 1,
  );
  assert.ok(image && image.kind === 'image');
  recordRejectedDecision(
    decisionPath,
    sourcePath,
    image.candidate,
    'test rejection',
  );

  // Content bytes and occurrence stay the same, but the observed drawing-name
  // Claim used by the old review decision changes.
  fs.writeFileSync(
    sourcePath,
    screenDesignWorkbook({ loginName: 'ログイン画面（改名）' }).bytes,
  );

  const result = writeWorkbookImportDraft({
    sourcePath,
    draftPath,
    reviewDecisionsPath: decisionPath,
  });

  assert.equal(result.reviewSkippedImages.length, 0);
  assert.deepEqual(
    result.extractedImages.map((item) => item.ordinal),
    [1, 2, 3, 4],
  );
});

test('malformed review decisions fail before bulk-import side effects', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-review-invalid-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'draft.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const decisionPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  fs.writeFileSync(decisionPath, '{"schema":"wrong","entries":[]}');

  assert.throws(
    () => writeWorkbookImportDraft({
      sourcePath,
      draftPath,
      ledgerPath,
      reviewDecisionsPath: decisionPath,
    }),
    /is not an mmi\.review-decisions\/v1 file/u,
  );
  assert.equal(fs.existsSync(draftPath), false);
  assert.equal(fs.existsSync(ledgerPath), false);
  assert.equal(
    fs.existsSync(path.join(root, 'assets', 'design')),
    false,
  );
});

test('existing adopted image history takes precedence over an obsolete rejection record', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-review-adopted-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const firstDraft = path.join(root, 'first.md');
  const secondDraft = path.join(root, 'second.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const decisionPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const first = writeWorkbookImportDraft({
    sourcePath,
    draftPath: firstDraft,
    ledgerPath,
    reviewDecisionsPath: decisionPath,
  });
  assert.equal(first.extractedImages.length, 4);

  const inventory = buildCandidateReviewInventory(sourcePath, './design.xlsx');
  const image = inventory.items.find(
    (item) => item.kind === 'image' && item.image.ordinal === 1,
  );
  assert.ok(image && image.kind === 'image');
  recordRejectedDecision(
    decisionPath,
    sourcePath,
    image.candidate,
    'obsolete rejection after adoption',
  );

  const second = writeWorkbookImportDraft({
    sourcePath,
    draftPath: secondDraft,
    ledgerPath,
    reviewDecisionsPath: decisionPath,
  });
  assert.equal(second.reviewSkippedImages.length, 0);
  assert.deepEqual(
    second.extractedImages.map((item) => item.ordinal),
    [1, 2, 3, 4],
  );
});

test('when every image is rejected or deferred, bulk import writes no image assets or ledger', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-import-review-all-skipped-'));
  const sourcePath = path.join(root, 'design.xlsx');
  const draftPath = path.join(root, 'draft.md');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const decisionPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const inventory = buildCandidateReviewInventory(sourcePath, './design.xlsx');
  const images = inventory.items.filter((item) => item.kind === 'image');
  images.forEach((item, index) => {
    if (index % 2 === 0) {
      recordRejectedDecision(
        decisionPath,
        sourcePath,
        item.candidate,
        'test rejection',
      );
    } else {
      recordDeferredDecision(
        decisionPath,
        sourcePath,
        item.candidate,
        'test defer',
      );
    }
  });

  const result = writeWorkbookImportDraft({
    sourcePath,
    draftPath,
    ledgerPath,
    reviewDecisionsPath: decisionPath,
  });

  assert.equal(result.reviewSkippedImages.length, 4);
  assert.equal(result.extractedImages.length, 0);
  assert.equal(fs.existsSync(result.imageOutDir), false);
  assert.equal(fs.existsSync(ledgerPath), false);
  assert.equal(fs.existsSync(draftPath), true);
  assert.match(
    result.markdown,
    /既存のレビュー判断により取り込まなかった画像: 4件/u,
  );
});
