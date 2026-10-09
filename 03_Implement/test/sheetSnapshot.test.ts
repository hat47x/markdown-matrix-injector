import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  columnLabel,
  MMI_SNAPSHOT_RENDERER,
  parseA1Range,
  renderSheetSvg,
  SNAPSHOT_FONT_FAMILY,
} from '../src/adapters/sheetSnapshot.js';
import { runSnapshot } from '../src/cli/snapshot.js';
import { main } from '../src/cli/mmi.js';
import { pngOf } from './helpers/buildXlsxWithImages.js';
import { buildStyledXlsx, shape, shapeDesignSheet, twoCell } from './helpers/buildStyledXlsx.js';

const sha = (bytes: Uint8Array | string): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const count = (text: string, needle: string): number => text.split(needle).length - 1;

/**
 * 方眼紙風の基本ブック。
 * 列: A=10, B=20, C=非表示, D・E=既定（Yu Gothic 11pt では 72px）。
 * 行: 1=30pt(40px), 2=既定15pt(20px), 3=非表示, 4〜6=既定。
 */
function basicBook(): Buffer {
  return buildStyledXlsx([
    {
      name: '方眼紙',
      cols: [
        { min: 1, max: 1, width: 10 },
        { min: 2, max: 2, width: 20 },
        { min: 3, max: 3, width: 5, hidden: true },
      ],
      rows: [{ r: 1, ht: 30 }, { r: 3, hidden: true }],
      cells: [
        { ref: 'A1', value: '見出し', style: 1 },
        { ref: 'C3', value: '非表示の行と列' },
        { ref: 'A4', value: '本文', style: 2 },
        { ref: 'B4', value: 123, style: 2 },
        { ref: 'D4', value: 'X', style: 3 },
        { ref: 'E6', value: '範囲外' },
      ],
      merges: ['A1:B2'],
    },
    { name: '空', cells: [] },
  ], {
    styles: {
      fonts: [
        '<sz val="11"/><name val="Yu Gothic"/>',
        '<b/><sz val="14"/><color rgb="FFC00000"/><name val="Yu Gothic"/>',
      ],
      fills: [
        '<patternFill patternType="none"/>',
        '<patternFill patternType="gray125"/>',
        '<patternFill patternType="solid"><fgColor rgb="FFFFC000"/><bgColor indexed="64"/></patternFill>',
        '<patternFill patternType="solid"><fgColor theme="4" tint="0.39997558519241921"/><bgColor indexed="64"/></patternFill>',
      ],
      borders: [
        { body: '<left/><right/><top/><bottom/><diagonal/>' },
        { body: '<left style="thin"><color rgb="FF1F4E79"/></left><right style="thin"><color rgb="FF1F4E79"/></right><top style="thin"><color rgb="FF1F4E79"/></top><bottom style="thin"><color rgb="FF1F4E79"/></bottom><diagonal/>' },
        { body: '<left/><right/><top/><bottom style="medium"><color rgb="FFFF0000"/></bottom><diagonal/>' },
      ],
      cellXfs: [
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
        '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>',
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/>',
      ],
    },
  });
}

/** 図形入りの設計シートを、座標が読みやすいよう A1 から描く。 */
const SHAPES_RANGE = 'A1:T14';

test('(a) the same input renders to the same bytes, with renderer, digest, sheet and range in metadata', () => {
  const book = basicBook();
  const first = renderSheetSvg({ bytes: book, sheet: '方眼紙' });
  const second = renderSheetSvg({ bytes: Buffer.from(basicBook()), sheet: '方眼紙' });
  assert.ok(first.svg);
  assert.equal(first.svg, second.svg);
  assert.equal(sha(first.svg), sha(second.svg as string));
  assert.equal(first.renderer, MMI_SNAPSHOT_RENDERER);
  assert.equal(first.sourceDigest, sha(book));
  assert.match(first.svg, /<metadata><mmi:snapshot xmlns:mmi="urn:mmi:sheet-snapshot:1" renderer="mmi-sheet-svg\/1" source-digest="sha256:[0-9a-f]{64}" source-bytes="\d+" sheet="方眼紙" range="A1:E6"/u);
  assert.ok(first.svg.includes(`font-family="${SNAPSHOT_FONT_FAMILY}"`));
  // 時刻・絶対パスを含めない。
  assert.doesNotMatch(first.svg, /\d{4}-\d{2}-\d{2}T|[A-Za-z]:\\|\/tmp\/|\/home\//u);
  // 要素の順序が固定: 背景 → 枠線 → 塗り → 罫線 → 文字。
  const order = ['data-mmi-layer="background"', 'data-mmi-layer="gridlines"', 'data-mmi-layer="fills"', 'data-mmi-layer="borders"', 'data-mmi-layer="cells"'].map((layer) => first.svg!.indexOf(layer));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.ok(order.every((index) => index > 0));
  // 図形入りのシートも、画像の埋め込みを含めて同じバイト列になる。
  const png = pngOf(8, 6, [30, 90, 200]);
  assert.equal(
    renderSheetSvg({ bytes: shapeDesignSheet(png), sheet: '画面遷移' }).svg,
    renderSheetSvg({ bytes: shapeDesignSheet(png), sheet: '画面遷移' }).svg,
  );
});

test('(b) a merged area is one rectangle with the top-left cell\'s fill, and its text is drawn once', () => {
  const { svg } = renderSheetSvg({ bytes: basicBook(), sheet: '方眼紙' });
  assert.ok(svg);
  const merged = [...svg.matchAll(/<rect [^>]*data-mmi-merge="A1:B2"[^>]*\/>/gu)].map((m) => m[0]);
  assert.equal(merged.length, 1);
  // A=80px + B=160px、行1=40px + 行2=20px。
  assert.match(merged[0], /x="0" y="0" width="240" height="60" fill="#FFC000"/u);
  assert.equal(count(svg, '>見出し<'), 1);
  assert.match(svg, /<text x="120" y="30" text-anchor="middle" dominant-baseline="central" font-size="18.67" fill="#C00000" font-weight="bold">見出し<\/text>/u);
});

test('(c) fill and border colours are drawn, theme colour tints resolve, and a shared edge is drawn once', () => {
  const { svg } = renderSheetSvg({ bytes: basicBook(), sheet: '方眼紙' });
  assert.ok(svg);
  assert.match(svg, /fill="#FFC000"/u);
  // テーマ accent1 (#4472C4) の 40% 明るい色（tint 0.4、HLSの輝度で計算）。
  // Excel の表示値は #8EA9DB で、整数の丸めの違いにより各成分が1ずれる。
  assert.match(svg, /<rect x="0" y="60" width="240" height="20" fill="#8FAADC"\/>/u);
  assert.match(svg, /stroke="#1F4E79" stroke-width="1" data-mmi-border="thin"/u);
  assert.match(svg, /stroke="#FF0000" stroke-width="2" data-mmi-border="medium"/u);
  // A4 と B4 の間（x=80）の縦線は1本だけ。
  assert.equal(count(svg, 'M79.5 60V80'), 1);
  // A4・B4 の上辺は1本の線にまとまる（非表示の行3は境界を作らない）。
  assert.equal(count(svg, 'M0 59.5H240'), 1);
});

test('(d) column widths, row heights and hidden rows/columns set the dimensions', () => {
  const full = renderSheetSvg({ bytes: basicBook(), sheet: '方眼紙' });
  assert.equal(full.range, 'A1:E6');
  // 80 + 160 + 0(C非表示) + 72 + 72、40 + 20 + 0(行3非表示) + 20 + 20 + 20。
  assert.equal(full.width, 384);
  assert.equal(full.height, 120);
  assert.match(full.svg ?? '', /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:xlink="http:\/\/www.w3.org\/1999\/xlink" width="384" height="120" viewBox="0 0 384 120">/u);
  assert.doesNotMatch(full.svg ?? '', /非表示の行と列/u);
  // 数値は既定で右寄せ。
  assert.match(full.svg ?? '', /<text x="238" y="68.83" text-anchor="end"[^>]*>123<\/text>/u);
});

test('(e) pasted pictures are embedded as <image> data URIs at their anchor', () => {
  const png = pngOf(8, 6, [30, 90, 200]);
  const result = renderSheetSvg({ bytes: shapeDesignSheet(png), sheet: '画面遷移', range: SHAPES_RANGE });
  assert.ok(result.svg);
  const images = [...result.svg.matchAll(/<image [^>]*\/>/gu)].map((m) => m[0]);
  assert.equal(images.length, 1);
  assert.ok(images[0].includes(`xlink:href="data:image/png;base64,${png.toString('base64')}"`));
  // F9:I12 の位置（列幅 3.25 → 26px、行 20px）。
  assert.match(images[0], /x="130" y="160" width="104" height="80" preserveAspectRatio="none"/u);
});

test('(f) supported shapes are drawn; unsupported ones are reported with kind and position and framed', () => {
  const result = renderSheetSvg({ bytes: shapeDesignSheet(pngOf(2, 2, [0, 0, 0])), sheet: '画面遷移', range: SHAPES_RANGE });
  assert.ok(result.svg);
  const svg = result.svg;
  assert.match(svg, /<rect x="26" y="80" width="130" height="60" fill="#DDEBF7" stroke="#2F5597" stroke-width="1.33"\/>/u);
  assert.match(svg, /<rect x="234" y="80" width="130" height="60" rx="[\d.]+" ry="[\d.]+" fill="#E2F0D9"/u);
  assert.match(svg, /<ellipse cx="442" cy="110"/u);
  assert.match(svg, /<line x1="156" y1="110" x2="234" y2="110" fill="none" stroke="#000000"/u);
  assert.match(svg, /<polygon points="234,110 [^"]+" fill="#000000"\/>/u, 'arrow head at the tail end');
  // 右向きのブロック矢印（先端は右端の中央）。
  assert.match(svg, /<polygon points="26,170 [^"]*104,180 [^"]*" fill="#F4B183"\/>/u);
  assert.match(svg, />ログイン<\/text>/u);
  assert.match(svg, />メニュー<\/text>/u);

  const unsupported = result.diagnostics.filter((d) => d.code === 'MMI_SNAPSHOT_UNSUPPORTED_SHAPE');
  assert.deepEqual(unsupported.map((d) => [d.kind, d.at]), [
    ['chart', 'K9:M12'],
    ['group', 'O9:P10'],
    ['prst:wedgeRectCallout', 'Q9:R10'],
    ['custGeom', 'O12:P13'],
  ]);
  assert.ok(unsupported.every((d) => d.severity === 'warning' && d.sheet === '画面遷移' && d.message.length > 0));
  assert.equal(count(svg, 'data-mmi-unsupported='), 4);
  assert.match(svg, /未対応: グラフ/u);
  // 警告だけなので SVG は出る。
  assert.ok(!result.diagnostics.some((d) => d.severity === 'error'));
});

test('(g) a broken zip, a missing sheet and an invalid range are diagnosed without an SVG', () => {
  const notZip = renderSheetSvg({ bytes: Buffer.from('これは xlsx ではない'), sheet: 'Sheet1' });
  assert.equal(notZip.svg, undefined);
  assert.deepEqual(notZip.diagnostics.map((d) => [d.code, d.severity]), [['MMI_SNAPSHOT_NOT_A_PACKAGE', 'error']]);

  const book = basicBook();
  const truncated = renderSheetSvg({ bytes: book.subarray(0, book.length - 30), sheet: '方眼紙' });
  assert.equal(truncated.svg, undefined);
  assert.equal(truncated.diagnostics[0].severity, 'error');

  const missing = renderSheetSvg({ bytes: book, sheet: '存在しない' });
  assert.equal(missing.svg, undefined);
  assert.equal(missing.diagnostics[0].code, 'MMI_SNAPSHOT_SHEET_NOT_FOUND');
  assert.match(missing.diagnostics[0].message, /「方眼紙」/u);

  for (const range of ['foo', 'A0:B2', 'A1:XFE1', 'A1:B2:C3', '']) {
    const invalid = renderSheetSvg({ bytes: book, sheet: '方眼紙', range });
    assert.equal(invalid.svg, undefined, range);
    assert.equal(invalid.diagnostics[0].code, 'MMI_SNAPSHOT_INVALID_RANGE', range);
  }
  const hiddenOnly = renderSheetSvg({ bytes: book, sheet: '方眼紙', range: 'C3' });
  assert.equal(hiddenOnly.diagnostics[0].code, 'MMI_SNAPSHOT_INVALID_RANGE');

  const tooLarge = renderSheetSvg({ bytes: book, sheet: '方眼紙', range: 'A1:Z100', limits: { maxRangeCells: 100 } });
  assert.equal(tooLarge.diagnostics[0].code, 'MMI_SNAPSHOT_RANGE_TOO_LARGE');

  const empty = renderSheetSvg({ bytes: book, sheet: '空' });
  assert.ok(empty.svg);
  assert.equal(empty.diagnostics[0].code, 'MMI_SNAPSHOT_EMPTY_SHEET');

  // 壊れた描画は警告にして、セルは描く。
  const brokenDrawing = buildStyledXlsx([{ name: 'S', cells: [{ ref: 'A1', value: 'ok' }], rawDrawing: '<xdr:wsDr xmlns:xdr="x"><xdr:twoCellAnchor>' }]);
  const partial = renderSheetSvg({ bytes: brokenDrawing, sheet: 'S' });
  assert.ok(partial.svg);
  assert.ok(partial.diagnostics.some((d) => d.code === 'MMI_SNAPSHOT_PART_UNREADABLE' && d.severity === 'warning'));
  assert.match(partial.svg, />ok<\/text>/u);
});

test('(h) the source digest is unchanged by rendering, through the function and the CLI', () => {
  const book = basicBook();
  const copy = Buffer.from(book);
  renderSheetSvg({ bytes: book, sheet: '方眼紙' });
  assert.ok(book.equals(copy));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-'));
  const source = path.join(dir, 'book.xlsx');
  fs.writeFileSync(source, book);
  const before = sha(fs.readFileSync(source));
  const out: string[] = [];
  const err: string[] = [];
  const code = runSnapshot(['book.xlsx'], { sheet: '方眼紙', range: 'A1:D4', out: 'out/snap.svg', json: true }, { out: (t) => out.push(t), err: (t) => err.push(t), cwd: dir });
  assert.equal(code, 0, err.join('\n'));
  assert.equal(sha(fs.readFileSync(source)), before);
  const summary = JSON.parse(out.join(''));
  assert.equal(summary.sourceUnchanged, true);
  assert.equal(summary.sourceDigest, before);
  assert.equal(summary.output, 'out/snap.svg');
  assert.equal(summary.range, 'A1:D4');
  assert.equal(summary.renderer, MMI_SNAPSHOT_RENDERER);
  const written = fs.readFileSync(path.join(dir, 'out', 'snap.svg'), 'utf8');
  assert.equal(summary.svgDigest, sha(written));
  assert.equal(written, renderSheetSvg({ bytes: book, sheet: '方眼紙', range: 'A1:D4', sourceLabel: 'book.xlsx' }).svg);
  assert.ok(!written.includes(dir));
  assert.match(written, / source="book.xlsx" /u);
});

test('(i) a range excludes cells outside it and sets the viewBox to the range', () => {
  const ranged = renderSheetSvg({ bytes: basicBook(), sheet: '方眼紙', range: 'a1:d4' });
  assert.equal(ranged.range, 'A1:D4');
  assert.equal(ranged.width, 312);
  assert.equal(ranged.height, 80);
  assert.doesNotMatch(ranged.svg ?? '', /範囲外/u);
  assert.match(renderSheetSvg({ bytes: basicBook(), sheet: '方眼紙' }).svg ?? '', /範囲外/u);
  // 範囲の途中から: B4 だけ。
  const one = renderSheetSvg({ bytes: basicBook(), sheet: '方眼紙', range: '$B$4' });
  assert.equal(one.width, 160);
  assert.equal(one.height, 20);
  assert.doesNotMatch(one.svg ?? '', /本文|見出し/u);
  assert.match(one.svg ?? '', />123<\/text>/u);
  // 範囲外の図形は描かず、埋め込みもしない。
  const shapes = renderSheetSvg({ bytes: shapeDesignSheet(pngOf(2, 2, [0, 0, 0])), sheet: '画面遷移', range: 'A1:D4' });
  assert.doesNotMatch(shapes.svg ?? '', /<image |data-mmi-unsupported/u);
  assert.ok(!shapes.diagnostics.some((d) => d.code === 'MMI_SNAPSHOT_UNSUPPORTED_SHAPE'));
});

test('a large ruled sheet stays bounded, and malformed XML fails fast as a diagnostic', () => {
  const cells: { ref: string; style: number }[] = [];
  for (let r = 1; r <= 150; r += 1) for (let c = 0; c < 60; c += 1) cells.push({ ref: `${columnLabel(c)}${r}`, style: 1 });
  const book = buildStyledXlsx([{ name: 'S', cells }], {
    styles: {
      borders: [
        { body: '<left/><right/><top/><bottom/><diagonal/>' },
        { body: '<left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/>' },
      ],
      cellXfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>'],
    },
  });
  const started = Date.now();
  const result = renderSheetSvg({ bytes: book, sheet: 'S' });
  assert.ok(result.svg);
  assert.ok(Date.now() - started < 10_000);
  // 罫線は1本の path にまとまり、セルごとの要素にならない。
  assert.equal(count(result.svg, 'data-mmi-border="thin"'), 1);

  const hostile = buildStyledXlsx([{ name: 'S', cells: [{ ref: 'A1', value: 'x' }] }]);
  const broken = renderSheetSvg({ bytes: hostile, sheet: 'S', limits: { maxXmlElements: 3 } });
  assert.equal(broken.svg, undefined);
  assert.ok(broken.diagnostics.some((d) => d.code === 'MMI_SNAPSHOT_LIMIT_EXCEEDED'));
});

test('parseA1Range accepts A1 forms and rejects out-of-sheet references', () => {
  assert.deepEqual(parseA1Range('F20:A1'), { startRow: 0, startCol: 0, endRow: 19, endCol: 5 });
  assert.deepEqual(parseA1Range('XFD1048576'), { startRow: 1048575, startCol: 16383, endRow: 1048575, endCol: 16383 });
  assert.equal(parseA1Range('A1048577'), undefined);
  assert.equal(parseA1Range('A:C'), undefined);
});

test('shape text wraps and lines with arrow heads are drawn without an image library', () => {
  const book = buildStyledXlsx([{
    name: 'S',
    cols: [{ min: 1, max: 10, width: 10 }],
    anchors: [
      twoCell([0, 0], [2, 3], shape({ id: 2, name: 'box', prst: 'rect', paint: '<a:noFill/><a:ln w="9525"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:prstDash val="dash"/></a:ln>', text: '長い説明文がここに入り、図形の幅で折り返されます', bodyPr: 'wrap="square" anchor="t"' })),
      twoCell([3, 0], [5, 2], shape({ id: 3, name: 'arrow', prst: 'line', connector: true, xfrm: '<a:xfrm flipV="1"><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>', paint: '<a:ln w="19050"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:headEnd type="oval"/><a:tailEnd type="stealth"/></a:ln>' })),
    ],
  }]);
  const result = renderSheetSvg({ bytes: book, sheet: 'S', range: 'A1:F4' });
  assert.ok(result.svg);
  assert.match(result.svg, /fill="none" stroke="#000000" stroke-width="1" stroke-dasharray="4 3"/u);
  assert.ok(count(result.svg, '<tspan ') >= 2, 'wrapped into several lines');
  // flipV: 左下から右上へ。
  assert.match(result.svg, /<line x1="240" y1="40" x2="400" y2="0"[^>]*stroke="#FF0000" stroke-width="2"/u);
  assert.match(result.svg, /<ellipse cx="240" cy="40"/u);
});

test('mmi snapshot exits 1 with diagnostics for unusable input and 2 for usage errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-cli-'));
  fs.writeFileSync(path.join(dir, 'book.xlsx'), basicBook());
  fs.writeFileSync(path.join(dir, 'text.xlsx'), 'plain text');
  const run = (args: string[], options: Parameters<typeof runSnapshot>[1]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runSnapshot(args, options, { out: (t) => out.push(t), err: (t) => err.push(t), cwd: dir });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const missingSheet = run(['book.xlsx'], { sheet: 'nope', out: 'a.svg' });
  assert.equal(missingSheet.code, 1);
  assert.match(missingSheet.err, /MMI_SNAPSHOT_SHEET_NOT_FOUND/u);
  assert.equal(fs.existsSync(path.join(dir, 'a.svg')), false);
  const badRange = run(['book.xlsx'], { sheet: '方眼紙', range: 'ZZ', out: 'b.svg', json: true });
  assert.equal(badRange.code, 1);
  assert.equal(JSON.parse(badRange.out).diagnostics[0].code, 'MMI_SNAPSHOT_INVALID_RANGE');
  const notXlsx = run(['text.xlsx'], { sheet: 'S', out: 'c.svg' });
  assert.equal(notXlsx.code, 1);
  assert.match(notXlsx.err, /MMI_SNAPSHOT_NOT_A_PACKAGE/u);
  const absent = run(['absent.xlsx'], { sheet: 'S', out: 'd.svg' });
  assert.equal(absent.code, 1);
  assert.match(absent.err, /MMI_SNAPSHOT_SOURCE_UNREADABLE/u);
  assert.equal(run(['book.xlsx'], { out: 'e.svg' }).code, 2);
  assert.equal(run(['book.xlsx'], { sheet: '方眼紙' }).code, 2);
  assert.equal(run(['book.xlsx'], { sheet: '方眼紙', out: 'book.xlsx' }).code, 2);
  const sourceBeforeAliasCheck = fs.readFileSync(path.join(dir, 'book.xlsx'));
  fs.linkSync(path.join(dir, 'book.xlsx'), path.join(dir, 'alias.svg'));
  assert.equal(run(['book.xlsx'], { sheet: '方眼紙', out: 'alias.svg' }).code, 2);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'book.xlsx')), sourceBeforeAliasCheck);
  const ok = run(['book.xlsx'], { sheet: '方眼紙', out: 'ok.svg' });
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^snapshot: ok\.svg \(方眼紙!A1:E6, 384x120px, mmi-sheet-svg\/1\)$/u);

  // mmi.ts の配線（--range を含む）。
  const cwd = process.cwd();
  const write = process.stdout.write;
  try {
    process.chdir(dir);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    assert.equal(await main(['snapshot', 'book.xlsx', '--sheet', '方眼紙', '--range', 'A1:B2', '-o', 'main.svg', '--json']), 0);
  } finally {
    process.stdout.write = write;
    process.chdir(cwd);
  }
  assert.match(fs.readFileSync(path.join(dir, 'main.svg'), 'utf8'), /range="A1:B2"/u);
});
