import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  discardUnrecordedImageExtraction,
  extractImages,
  finalizeReviewedImageExtraction,
} from '../src/cli/extract.js';
import { sliceRegion } from '../src/core/tableGeometry.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { inspectSource, main } from '../src/cli/mmi.js';
import { imageCandidates, readExcelImages } from '../src/adapters/excelImageAdapter.js';
import { readLedger } from '../src/core/importLedger.js';
import { readSourceFileIdentity } from '../src/core/sourceIdentity.js';
import { buildXlsxWithImages, emfOf, pngOf, screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

function workspace(): { root: string; book: string; doc: string; bytes: Buffer; media: Record<string, Buffer> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-img-'));
  fs.mkdirSync(path.join(root, 'data'));
  const { bytes, media } = screenDesignWorkbook();
  const book = path.join(root, 'data', '設計.xlsx');
  fs.writeFileSync(book, bytes);
  return { root, book, doc: path.join(root, 'docs', 'spec.md'), bytes, media };
}

/**
 * Image Candidates as the review flow builds them (no `nearby-table` claim). `inspect` adds that geometry claim,
 * and finalizing a review rediscovers the Candidate the review flow's way, so a Candidate taken from `inspect`
 * would always look changed.
 */
function reviewCandidates(book: string, doc: string) {
  const source = path.relative(path.dirname(doc), book).split(path.sep).join('/');
  return imageCandidates({
    source,
    sourceDigest: readSourceFileIdentity(book).digest,
    images: readExcelImages(fs.readFileSync(book)).images,
  });
}

const fileDigest = (file: string) => `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('inspect lists pictures per sheet with anchor, digest and nearest table; candidates carry them as image candidates', () => {
  const { book, doc, media } = workspace();
  const result = inspectSource(book, 0, doc);
  assert.deepEqual(
    result.images.map((image) => [image.ordinal, image.sheet, image.range, image.format, image.nearbyTable?.relation]),
    [
      [1, '画面一覧', 'D1:F4', 'png', 'right'],
      [2, '画面一覧', 'A6', 'png', 'below'],
      [3, '画面一覧', 'I9:K11', 'png', undefined],
      [4, '遷移図', undefined, 'png', undefined],
    ],
  );
  assert.equal(result.images[0].digest, `sha256:${createHash('sha256').update(media['image1.png']).digest('hex')}`);
  assert.deepEqual(result.imageDiagnostics, []);
  const kinds = result.candidates.map((candidate) => candidate.kind);
  assert.equal(kinds.filter((kind) => kind === 'image').length, 4);
  assert.equal(kinds.filter((kind) => kind === 'table-range').length, result.sheets.flatMap((sheet) => sheet.regions).length);
  // The existing table output is untouched by the picture support.
  assert.equal(result.sheets[0].regions[0].a1, 'A1:B3');
});

test('regression: a workbook with pictures still loads and slices exactly its cell values', () => {
  const { book } = workspace();
  const sheet = loadWorkbook({ absolutePath: book }).sheets['画面一覧'];
  assert.deepEqual(sliceRegion(sheet, 'A1:B3'), [['画面ID', '画面名'], ['S01', 'ログイン'], ['S02', 'メニュー']]);
  assert.deepEqual(Object.keys(loadWorkbook({ absolutePath: book }).sheets), ['画面一覧', '遷移図', 'メモ']);
});

test('extract writes each distinct picture once, named by digest; references are relative to the document and carry provenance', () => {
  const { root, book, doc, bytes } = workspace();
  const sourceBefore = fileDigest(book);
  const outDir = path.join(root, 'docs', 'assets');
  const result = extractImages({ sourcePath: book, selection: 'all', outDir, fromDocument: doc });
  assert.deepEqual(result.problems, []);
  assert.equal(result.extracted.length, 4);
  // 4 pictures, 2 distinct images: two files on disk.
  assert.equal(fs.readdirSync(outDir).length, 2);
  assert.deepEqual(result.extracted.map((item) => item.status), ['written', 'written', 'unchanged', 'unchanged']);
  const [first] = result.extracted;
  assert.match(first.reference, /^assets\/[0-9a-f]{12}\.png$/u);
  assert.equal(`sha256:${first.reference.slice(7, 19)}`, first.digest.slice(0, 19));
  assert.equal(fileDigest(path.join(outDir, path.basename(first.reference))), first.digest);
  assert.equal(
    first.markdown,
    `![ログイン画面のダンプ](${first.reference})\n<!-- mmi:extracted source="../data/設計.xlsx" sheet="画面一覧" anchor="D1:F4" sha256="${first.digest.slice(7)}" -->`,
  );
  // The source is only read.
  assert.equal(fileDigest(book), sourceBefore);
  assert.deepEqual(fs.readFileSync(book), bytes);
  // A re-run changes nothing.
  const again = extractImages({ sourcePath: book, selection: 'all', outDir, fromDocument: doc });
  assert.deepEqual(again.extracted.map((item) => item.status), ['unchanged', 'unchanged', 'unchanged', 'unchanged']);
});

test('human-reviewed image alt text is recorded without changing image bytes or Candidate origin', () => {
  const { root, book, doc } = workspace();
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  const outDir = path.join(root, 'docs', 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const sourceBefore = fileDigest(book);
  const reviewed = reviewCandidates(book, doc).find(
    (candidate) =>
      candidate.kind === 'image'
      && candidate.locator.sheet === '画面一覧'
      && candidate.locator.range === 'D1:F4',
  );
  assert.ok(reviewed);

  const draft = extractImages({
    sourcePath: book,
    selection: '1',
    outDir,
    fromDocument: doc,
  });
  assert.deepEqual(draft.problems, []);
  assert.equal(draft.extracted.length, 1);
  const imageBefore = fileDigest(draft.extracted[0].file);

  const finalized = finalizeReviewedImageExtraction({
    sourcePath: book,
    ledgerPath,
    extracted: draft.extracted[0],
    candidate: reviewed,
    altText: 'ログイン画面（レビュー修正）',
    fromDocument: doc,
    basis: 'test reviewed image alt text',
  });

  assert.deepEqual(finalized.problems, []);
  assert.ok(finalized.extracted);
  assert.equal(finalized.extracted.reviewState, 'modified');
  assert.equal(
    finalized.extracted.reviewAdjustment.originalCharacters,
    Array.from(draft.extracted[0].altText).length,
  );
  assert.equal(
    finalized.extracted.reviewAdjustment.reviewedCharacters,
    Array.from('ログイン画面（レビュー修正）').length,
  );
  assert.ok(finalized.extracted.reviewAdjustment.changedSpanCharacters > 0);
  assert.equal(
    finalized.extracted.altText,
    'ログイン画面（レビュー修正）',
  );
  assert.match(
    finalized.extracted.markdown,
    /^!\[ログイン画面（レビュー修正）\]\(/u,
  );
  assert.equal(fileDigest(finalized.extracted.file), imageBefore);
  assert.equal(fileDigest(book), sourceBefore);

  const ledger = readLedger(ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].reviewState, 'modified');
  assert.equal(
    ledger.entries[0].conversion.reviewMode,
    'modified-reference-v1',
  );
  assert.equal(
    ledger.entries[0].conversion.altText,
    'ログイン画面（レビュー修正）',
  );
  assert.equal(ledger.entries[0].outputDigest, imageBefore);
});

test('unchanged image alt text remains accepted and stale review context fails closed', () => {
  const { root, book, doc } = workspace();
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  const outDir = path.join(root, 'docs', 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const reviewed = reviewCandidates(book, doc).find(
    (candidate) =>
      candidate.kind === 'image'
      && candidate.locator.sheet === '画面一覧'
      && candidate.locator.range === 'D1:F4',
  );
  assert.ok(reviewed);

  const draft = extractImages({
    sourcePath: book,
    selection: '1',
    outDir,
    fromDocument: doc,
  });
  assert.deepEqual(draft.problems, []);
  const accepted = finalizeReviewedImageExtraction({
    sourcePath: book,
    ledgerPath,
    extracted: draft.extracted[0],
    candidate: reviewed,
    altText: draft.extracted[0].altText,
    fromDocument: doc,
  });
  assert.ok(accepted.extracted);
  assert.equal(accepted.extracted.reviewState, 'accepted');
  assert.deepEqual(accepted.extracted.reviewAdjustment, {
    originalCharacters: Array.from(draft.extracted[0].altText).length,
    reviewedCharacters: Array.from(draft.extracted[0].altText).length,
    changedSpanCharacters: 0,
  });
  assert.equal(readLedger(ledgerPath).entries[0].reviewState, 'accepted');

  const staleDraft = extractImages({
    sourcePath: book,
    selection: '1',
    outDir: path.join(root, 'stale-assets'),
    fromDocument: doc,
  });
  assert.equal(staleDraft.extracted.length, 1);
  fs.writeFileSync(
    book,
    screenDesignWorkbook({ loginName: 'ログイン画面（改名）' }).bytes,
  );
  const stale = finalizeReviewedImageExtraction({
    sourcePath: book,
    ledgerPath,
    extracted: staleDraft.extracted[0],
    candidate: reviewed,
    altText: '人手説明',
    fromDocument: doc,
  });
  assert.equal(stale.extracted, undefined);
  assert.equal(stale.problems[0].code, 'MMI_IMAGE_REVIEW_STALE');
});

test('unrecorded image review draft is removed only when this review created it', () => {
  const { root, book, doc } = workspace();
  const created = extractImages({
    sourcePath: book,
    selection: '1',
    outDir: path.join(root, 'review-assets'),
    fromDocument: doc,
  }).extracted[0];
  assert.equal(created.status, 'written');
  assert.equal(discardUnrecordedImageExtraction(created), true);
  assert.equal(fs.existsSync(created.file), false);

  const existingDir = path.join(root, 'existing-assets');
  const first = extractImages({
    sourcePath: book,
    selection: '1',
    outDir: existingDir,
    fromDocument: doc,
  }).extracted[0];
  const existing = extractImages({
    sourcePath: book,
    selection: '1',
    outDir: existingDir,
    fromDocument: doc,
  }).extracted[0];
  assert.equal(first.status, 'written');
  assert.equal(existing.status, 'unchanged');
  assert.equal(discardUnrecordedImageExtraction(existing), false);
  assert.equal(fs.existsSync(existing.file), true);
});

test('extract: one picture by number; unknown numbers, non-xlsx sources and name collisions are refused with a code', () => {
  const { root, book, doc } = workspace();
  const outDir = path.join(root, 'out');
  const one = extractImages({ sourcePath: book, selection: '2', outDir, fromDocument: doc });
  assert.deepEqual([one.extracted.length, one.extracted[0].ordinal, fs.readdirSync(outDir).length], [1, 2, 1]);
  assert.equal(extractImages({ sourcePath: book, selection: '9', outDir, fromDocument: doc }).problems[0].code, 'MMI_IMAGE_NOT_FOUND');
  const csv = path.join(root, 'data', 'roles.csv');
  fs.writeFileSync(csv, 'a,b\n1,2\n');
  assert.equal(extractImages({ sourcePath: csv, selection: 'all', outDir, fromDocument: doc }).problems[0].code, 'MMI_IMAGE_PACKAGE_UNSUPPORTED');
  // Same name, different bytes: never overwritten.
  const target = path.join(outDir, path.basename(one.extracted[0].reference));
  fs.writeFileSync(target, 'someone else');
  const collision = extractImages({ sourcePath: book, selection: '2', outDir, fromDocument: doc });
  assert.equal(collision.problems[0].code, 'MMI_EXTRACT_NAME_COLLISION');
  assert.equal(fs.readFileSync(target, 'utf8'), 'someone else');
});

test('unsupported formats and a workbook without pictures are diagnosed, not skipped silently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-img-'));
  const mixed = path.join(root, 'mixed.xlsx');
  fs.writeFileSync(
    mixed,
    buildXlsxWithImages(
      [{ name: 'S', anchors: [{ kind: 'one', from: [0, 0], media: 'a.png', name: 'a' }, { kind: 'one', from: [0, 3], media: 'v.emf', name: 'v' }] }],
      { 'a.png': pngOf(2, 2, [5, 5, 5]), 'v.emf': emfOf() },
    ),
  );
  const inspected = inspectSource(mixed, 0);
  assert.deepEqual(inspected.images.map((i) => [i.format, i.extractable]), [['png', true], ['emf', false]]);
  assert.deepEqual(inspected.imageDiagnostics.map((d) => d.code), ['MMI_IMAGE_UNSUPPORTED_FORMAT']);
  const result = extractImages({ sourcePath: mixed, selection: 'all', outDir: path.join(root, 'assets') });
  assert.equal(result.extracted.length, 1);
  assert.deepEqual(result.problems.map((p) => [p.code, p.ordinal]), [['MMI_IMAGE_UNSUPPORTED_FORMAT', 2]]);

  const plain = path.join(root, 'plain.xlsx');
  fs.writeFileSync(plain, buildXlsxWithImages([{ name: 'S', cells: [[0, 0, 'x']] }], {}));
  assert.equal(extractImages({ sourcePath: plain, selection: 'all', outDir: path.join(root, 'a2') }).problems[0].code, 'MMI_IMAGE_NONE');
});

test('CLI exit codes and text output: usage errors are 2, failures 1; a workbook without pictures prints no image lines', async () => {
  const { root, book, doc } = workspace();
  const quiet = async (argv: string[]) => {
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
  };
  assert.equal((await quiet(['extract', book])).code, 2);
  const outDir = path.join(root, 'assets');
  const ok = await quiet(['extract', book, '--image', '1', '--out-dir', outDir, '--from', doc, '--root', root]);
  assert.equal(ok.code, 0);
  assert.match(ok.output, /^!\[ログイン画面のダンプ\]\(\.\.\/assets\/[0-9a-f]{12}\.png\)\n<!-- mmi:extracted /u);
  assert.equal((await quiet(['extract', book, '--image', '99', '--out-dir', outDir])).code, 1);
  const text = (await quiet(['inspect', book])).output;
  assert.match(text, /image #1  D1:F4  png  \d+ bytes  sha256:[0-9a-f]{12}…  "ログイン画面"  near table A1:B3 \(right, gap 1\)/u);
  const csv = path.join(root, 'r.csv');
  fs.writeFileSync(csv, 'a,b\n1,2\n');
  assert.doesNotMatch((await quiet(['inspect', csv])).output, /image/u);
});


test('extract records the project ledger and inspect keeps occurrence/content identity separate', async () => {
  const { root, book, doc } = workspace();
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  const outDir = path.join(root, 'docs', 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');

  const quiet = async (argv: string[]) => {
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
  };

  const extracted = await quiet([
    'extract', book,
    '--image', '1',
    '--out-dir', outDir,
    '--from', doc,
    '--root', root,
    '--json',
  ]);
  assert.equal(extracted.code, 0);
  assert.equal(fs.existsSync(ledgerPath), true);

  const all = JSON.parse((await quiet([
    'inspect', book,
    '--from', doc,
    '--root', root,
    '--json',
  ])).output);
  assert.equal(all.ledger.file, path.relative(process.cwd(), ledgerPath).split(path.sep).join('/'));
  assert.equal(all.ledger.filter, 'all');
  const allImageStates = all.ledger.candidates
    .filter((item: any) => item.kind === 'image')
    .map((item: any) => [item.sheet, item.place, item.state]);
  assert.deepEqual(allImageStates, [
    ['画面一覧', 'D1:F4', 'imported'],
    ['画面一覧', 'A6', 'unimported'],
    ['画面一覧', 'I9:K11', 'duplicate'],
    ['遷移図', 'name:遷移', 'unimported'],
  ]);

  const unimported = JSON.parse((await quiet([
    'inspect', book,
    '--from', doc,
    '--root', root,
    '--unimported',
    '--json',
  ])).output);
  assert.equal(
    unimported.images.some((image: any) => image.sheet === '画面一覧' && image.range === 'D1:F4'),
    false,
  );
  assert.equal(
    unimported.ledger.candidates.some(
      (item: any) => item.kind === 'image' && item.place === 'I9:K11' && item.state === 'duplicate',
    ),
    true,
  );

  // Whole-source digest changes alone do not stale the image review basis.
  fs.writeFileSync(book, screenDesignWorkbook({ memoText: '無関係なメモ変更' }).bytes);
  const unrelatedChange = JSON.parse((await quiet([
    'inspect', book,
    '--from', doc,
    '--root', root,
    '--json',
  ])).output);
  assert.equal(
    unrelatedChange.ledger.candidates.find(
      (item: any) => item.kind === 'image' && item.place === 'D1:F4',
    ).state,
    'imported',
  );

  // Same content and occurrence, but an observed Claim used at review time changed.
  fs.writeFileSync(book, screenDesignWorkbook({
    loginName: 'ログイン画面（改名）',
    memoText: '無関係なメモ変更',
  }).bytes);
  const stale = JSON.parse((await quiet([
    'inspect', book,
    '--from', doc,
    '--root', root,
    '--exclude-imported',
    '--json',
  ])).output);
  const staleImage = stale.ledger.candidates.find(
    (item: any) => item.kind === 'image' && item.place === 'D1:F4',
  );
  assert.equal(staleImage.state, 'stale');
  assert.deepEqual(staleImage.staleClaims, ['name']);

  const replacement = pngOf(8, 6, [20, 180, 80]);
  fs.writeFileSync(book, screenDesignWorkbook({ login: replacement }).bytes);

  const attention = JSON.parse((await quiet([
    'inspect', book,
    '--from', doc,
    '--root', root,
    '--exclude-imported',
    '--json',
  ])).output);
  assert.equal(
    attention.ledger.candidates.some(
      (item: any) => item.kind === 'image' && item.place === 'D1:F4' && item.state === 'changed',
    ),
    true,
  );

  const neverImported = JSON.parse((await quiet([
    'inspect', book,
    '--from', doc,
    '--root', root,
    '--unimported',
    '--json',
  ])).output);
  assert.equal(
    neverImported.ledger.candidates.some(
      (item: any) => item.kind === 'image' && item.place === 'D1:F4',
    ),
    false,
  );
});


test('inspect reports shapes and graphic frames as drawing problems', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-drawing-'));
  const book = path.join(root, 'drawing.xlsx');
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">',
    '<xdr:oneCellAnchor>',
    '<xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:ext cx="1000" cy="1000"/><xdr:sp/><xdr:clientData/>',
    '</xdr:oneCellAnchor>',
    '<xdr:absoluteAnchor>',
    '<xdr:pos x="0" y="0"/><xdr:ext cx="1000" cy="1000"/>',
    '<xdr:graphicFrame/><xdr:clientData/>',
    '</xdr:absoluteAnchor>',
    '</xdr:wsDr>',
  ].join('');
  fs.writeFileSync(
    book,
    buildXlsxWithImages(
      [{ name: '図', cells: [[0, 0, '図']], rawDrawing: drawing }],
      {},
    ),
  );

  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  try {
    const code = await main(['inspect', book]);
    assert.equal(code, 0);
  } finally {
    process.stdout.write = out;
  }

  const output = written.join('');
  assert.match(output, /drawing problems:/u);
  assert.match(output, /MMI_DRAWING_SHAPES_NOT_EXTRACTED \[図\]/u);
  assert.match(output, /MMI_DRAWING_GRAPHIC_FRAMES_NOT_EXTRACTED \[図\]/u);
});


test('inspect exposes actionable two-cell drawing snapshot hints', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-drawing-hint-'));
  const book = path.join(root, 'drawing.xlsx');
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>4</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:sp/><xdr:cxnSp/><xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '<xdr:oneCellAnchor>',
    '<xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>6</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:ext cx="1000" cy="1000"/><xdr:graphicFrame/><xdr:clientData/>',
    '</xdr:oneCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  fs.writeFileSync(
    book,
    buildXlsxWithImages(
      [{ name: '構成図', cells: [[0, 0, '構成図']], rawDrawing: drawing }],
      {},
    ),
  );

  const jsonChunks: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => (jsonChunks.push(String(chunk)), true)) as typeof process.stdout.write;
  try {
    assert.equal(await main(['inspect', book, '--json']), 0);
  } finally {
    process.stdout.write = out;
  }
  const inspected = JSON.parse(jsonChunks.join(''));
  assert.deepEqual(inspected.snapshotHints, [
    {
      ordinal: 1,
      sheet: '構成図',
      range: 'A1:C4',
      fromCell: 'A1',
      anchorKind: 'twoCellAnchor',
      shapeCount: 2,
      graphicFrameCount: 0,
      reasonCode: 'drawing-two-cell-anchor',
      ready: true,
    },
    {
      ordinal: 2,
      sheet: '構成図',
      fromCell: 'F7',
      anchorKind: 'oneCellAnchor',
      shapeCount: 0,
      graphicFrameCount: 1,
      reasonCode: 'drawing-one-cell-anchor-needs-range',
      ready: false,
    },
  ]);

  const textChunks: string[] = [];
  process.stdout.write = ((chunk: string) => (textChunks.push(String(chunk)), true)) as typeof process.stdout.write;
  try {
    assert.equal(await main(['inspect', book]), 0);
  } finally {
    process.stdout.write = out;
  }
  const textOutput = textChunks.join('');
  assert.match(textOutput, /snapshot hint #1\s+A1:C4\s+2 shape\/connector/u);
  assert.match(textOutput, /snapshot --hint 1 ready/u);
  assert.match(textOutput, /snapshot hint #2\s+F7\s+1 graphic-frame\s+\(range needs review/u);
});

test('snapshot --hint refuses anchors without a safe end cell before renderer startup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-drawing-hint-'));
  const book = path.join(root, 'drawing.xlsx');
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">',
    '<xdr:oneCellAnchor>',
    '<xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:ext cx="1000" cy="1000"/><xdr:sp/><xdr:clientData/>',
    '</xdr:oneCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  fs.writeFileSync(
    book,
    buildXlsxWithImages([{ name: '図', rawDrawing: drawing }], {}),
  );

  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
  try {
    assert.equal(
      await main(['snapshot', book, '--root', root, '--hint', '1']),
      2,
    );
  } finally {
    console.error = original;
  }
  assert.match(errors.join('\n'), /has no safe end cell/u);
  assert.match(errors.join('\n'), /starts at B3/u);
});

test('snapshot --hint resolves a ready hint before renderer input validation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-drawing-hint-'));
  const book = path.join(root, 'drawing.xlsx');
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:sp/><xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  fs.writeFileSync(
    book,
    buildXlsxWithImages([{ name: '図', rawDrawing: drawing }], {}),
  );

  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
  try {
    assert.equal(
      await main([
        'snapshot',
        book,
        '--root', root,
        '--hint', '1',
        '--dpi', '1',
      ]),
      1,
    );
  } finally {
    console.error = original;
  }
  assert.match(errors.join('\n'), /MMI_SNAPSHOT_RANGE_INVALID/u);
  assert.match(errors.join('\n'), /dpi must be an integer from 72 to 600/u);
  assert.doesNotMatch(errors.join('\n'), /hint #1/u);
});
