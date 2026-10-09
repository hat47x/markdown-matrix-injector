
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readLedger } from '../src/core/importLedger.js';
import {
  NATIVE_SVG_SNAPSHOT_RENDERER,
  renderNativeSvgRegionSnapshot,
} from '../src/snapshot/nativeSvgRegionSnapshot.js';
import {
  buildXlsxWithImages,
  screenDesignWorkbook,
} from './helpers/buildXlsxWithImages.js';

const sha256 = (bytes: Buffer): string =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');

test('native SVG snapshot is dependency-free, byte-stable and ledger-backed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-svg-'));
  const source = path.join(root, 'design.xlsx');
  const outDir = path.join(root, 'assets', 'snapshots');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  const before = fs.readFileSync(source);

  const first = renderNativeSvgRegionSnapshot({
    sourcePath: source,
    sourceLabel: './design.xlsx',
    sheet: '画面一覧',
    range: 'A1:G6',
    outDir,
    ledgerPath,
  });
  const second = renderNativeSvgRegionSnapshot({
    sourcePath: source,
    sourceLabel: './design.xlsx',
    sheet: '画面一覧',
    range: 'a1:g6',
    outDir,
    ledgerPath,
  });

  assert.equal(first.status, 'written');
  assert.equal(second.status, 'unchanged');
  assert.equal(first.manifest.artifact.digest, second.manifest.artifact.digest);
  assert.equal(first.manifest.renderedAtUtc, second.manifest.renderedAtUtc);
  assert.equal(first.manifest.renderer.id, NATIVE_SVG_SNAPSHOT_RENDERER);
  assert.equal(first.manifest.artifact.mediaType, 'image/svg+xml');
  assert.ok(first.manifest.limitations.includes('font-rasterization-environment-dependent'));

  const svg = fs.readFileSync(first.svgFile, 'utf8');
  assert.match(svg, /^<\?xml version="1\.0"/u);
  assert.match(svg, />画面ID</u);
  assert.match(svg, />ログイン</u);
  assert.match(svg, /<image class="mmi-image"/u);
  assert.match(svg, /data:image\/png;base64,/u);
  assert.equal(sha256(Buffer.from(svg, 'utf8')), first.manifest.artifact.digest);
  assert.deepEqual(fs.readFileSync(source), before);

  const ledger = readLedger(ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'region-snapshot');
  assert.equal(ledger.entries[0].sheet, '画面一覧');
  assert.equal(ledger.entries[0].place, 'A1:G6');
  assert.equal(ledger.entries[0].conversion.mode, 'region-snapshot-native-svg-v1');
  assert.equal(ledger.entries[0].conversion.renderer, NATIVE_SVG_SNAPSHOT_RENDERER);
});

test('native SVG snapshot renders basic DrawingML shape geometry but declares style approximation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-svg-shape-'));
  const source = path.join(root, 'shape.xlsx');
  const drawing = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ',
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>4</xdr:col><xdr:colOff>100</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>100</xdr:rowOff></xdr:to>',
    '<xdr:sp>',
    '<xdr:nvSpPr><xdr:cNvPr id="7" name="判断"/><xdr:cNvSpPr/></xdr:nvSpPr>',
    '<xdr:spPr><a:prstGeom prst="roundRect"/></xdr:spPr>',
    '<xdr:txBody><a:p><a:r><a:t>承認</a:t></a:r></a:p></xdr:txBody>',
    '</xdr:sp><xdr:clientData/>',
    '</xdr:twoCellAnchor></xdr:wsDr>',
  ].join('');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [{ name: 'フロー', cells: [[0, 0, '申請フロー']], rawDrawing: drawing }],
      {},
    ),
  );

  const result = renderNativeSvgRegionSnapshot({
    sourcePath: source,
    sheet: 'フロー',
    range: 'A1:F5',
    outDir: path.join(root, 'assets'),
  });

  const svg = fs.readFileSync(result.svgFile, 'utf8');
  assert.match(svg, /class="mmi-shape"/u);
  assert.match(svg, />承認</u);
  assert.ok(result.manifest.limitations.includes('drawing-shape-style-approximated'));
});

test('native SVG snapshot does not invent a position for absolute-anchor drawings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-svg-absolute-'));
  const source = path.join(root, 'absolute.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = renderNativeSvgRegionSnapshot({
    sourcePath: source,
    sheet: '遷移図',
    range: 'A1:D6',
    outDir: path.join(root, 'assets'),
  });

  const svg = fs.readFileSync(result.svgFile, 'utf8');
  assert.ok(result.manifest.limitations.includes('absolute-anchor-position-unavailable'));
  assert.doesNotMatch(svg, /<image class="mmi-image"/u);
  assert.match(svg, />遷移図</u);
});


test('native SVG snapshot preserves an external XLSX double border as two strokes and declares metric approximation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-svg-double-border-'));
  const source = path.join(root, 'double-border.xlsx');
  const fixtureText = fs.readFileSync(
    new URL('./fixtures/native-double-border.xlsx.base64', import.meta.url),
    'utf8',
  );
  const fixtureBytes = Buffer.from(fixtureText.replace(/\s/gu, ''), 'base64');
  assert.equal(
    sha256(fixtureBytes),
    'sha256:9881302c8f76b9ca4b5e2d1903179b9d1e3771591b959e2306e68680229a2002',
  );
  fs.writeFileSync(source, fixtureBytes);
  const before = fs.readFileSync(source);

  const result = renderNativeSvgRegionSnapshot({
    sourcePath: source,
    sheet: 'Borders',
    range: 'A1:B2',
    outDir: path.join(root, 'assets'),
  });

  const svg = fs.readFileSync(result.svgFile, 'utf8');
  const doubleStrokes = svg.match(/class="mmi-border-double"/gu) ?? [];
  assert.equal(doubleStrokes.length, 2);
  assert.ok(
    result.manifest.limitations.includes(
      'border-double-metrics-approximated',
    ),
  );
  assert.equal(
    result.manifest.limitations.includes(
      'border-style-approximated:double',
    ),
    false,
  );
  assert.deepEqual(fs.readFileSync(source), before);
});
