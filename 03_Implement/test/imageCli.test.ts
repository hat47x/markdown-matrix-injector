import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { extractImages } from '../src/cli/extract.js';
import { sliceRegion } from '../src/core/tableGeometry.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { inspectSource, main } from '../src/cli/mmi.js';
import { buildXlsxWithImages, emfOf, pngOf, screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

function workspace(): { root: string; book: string; doc: string; bytes: Buffer; media: Record<string, Buffer> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-img-'));
  fs.mkdirSync(path.join(root, 'data'));
  const { bytes, media } = screenDesignWorkbook();
  const book = path.join(root, 'data', '設計.xlsx');
  fs.writeFileSync(book, bytes);
  return { root, book, doc: path.join(root, 'docs', 'spec.md'), bytes, media };
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
  const ok = await quiet(['extract', book, '--image', '1', '--out-dir', outDir, '--from', doc]);
  assert.equal(ok.code, 0);
  assert.match(ok.output, /^!\[ログイン画面のダンプ\]\(\.\.\/assets\/[0-9a-f]{12}\.png\)\n<!-- mmi:extracted /u);
  assert.equal((await quiet(['extract', book, '--image', '99', '--out-dir', outDir])).code, 1);
  const text = (await quiet(['inspect', book])).output;
  assert.match(text, /image #1  D1:F4  png  \d+ bytes  sha256:[0-9a-f]{12}…  "ログイン画面"  near table A1:B3 \(right, gap 1\)/u);
  const csv = path.join(root, 'r.csv');
  fs.writeFileSync(csv, 'a,b\n1,2\n');
  assert.doesNotMatch((await quiet(['inspect', csv])).output, /image/u);
});
