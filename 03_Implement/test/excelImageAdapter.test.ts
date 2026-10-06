import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { imageCandidates, readExcelImages, readImageBytes, relationToTables, shapeCandidates, type TableRect } from '../src/adapters/excelImageAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';
import { readZip, ZipError } from '../src/core/zipReader.js';
import { buildXlsxWithImages, emfOf, pngOf, screenDesignWorkbook, zipOf } from './helpers/buildXlsxWithImages.js';

const sha = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const TABLE: TableRect = { a1: 'A1:B3', startRow: 0, startCol: 0, endRow: 2, endCol: 1 };

test('lists every picture with sheet, anchor, name, format, size and digest -- same media twice keeps one digest', () => {
  const { bytes, media } = screenDesignWorkbook();
  const result = readExcelImages(bytes);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.images.map((image) => [image.ordinal, image.sheet, image.name, image.range, image.anchor.kind, image.format, image.extractable]),
    [
      [1, '画面一覧', 'ログイン画面', 'D1:F4', 'twoCellAnchor', 'png', true], // `to` at offset 0 is an edge: ends in the previous cell
      [2, '画面一覧', 'メニュー画面', 'A6', 'oneCellAnchor', 'png', true], // one-cell: only the start cell is known
      [3, '画面一覧', 'ログイン画面(再掲)', 'I9:K11', 'twoCellAnchor', 'png', true],
      [4, '遷移図', '遷移', undefined, 'absoluteAnchor', 'png', true],
    ],
  );
  assert.equal(result.images[0].description, 'ログイン画面のダンプ');
  assert.equal(result.images[0].digest, sha(media['image1.png']));
  assert.equal(result.images[0].bytes, media['image1.png'].length);
  assert.equal(result.images[0].digest, result.images[2].digest);
  assert.equal(result.images[1].digest, result.images[3].digest);
  assert.notEqual(result.images[0].digest, result.images[1].digest);
  assert.deepEqual(result.images[3].anchor.extentEmu, { cx: 1905000, cy: 952500 });
});

test('a workbook without pictures yields nothing and no diagnostics', () => {
  const none = buildXlsxWithImages([{ name: 'S', cells: [[0, 0, 'x']] }], {});
  assert.deepEqual(readExcelImages(none), {
    images: [],
    shapes: [],
    diagnostics: [],
    snapshotHints: [],
    skipped: { shapes: 0, charts: 0 },
  });
});

test('candidates: package facts are observed/M0, the table relation is inferred/M1 geometry; digest is the fingerprint', () => {
  const { bytes } = screenDesignWorkbook();
  const { images } = readExcelImages(bytes);
  const candidates = imageCandidates({ source: './d.xlsx', sourceDigest: sha(bytes), images, tablesBySheet: { 画面一覧: [TABLE] } });
  assert.equal(candidates.length, 4);
  for (const candidate of candidates) assert.equal(candidateProblem(candidate), undefined);
  const [first, second, third, fourth] = candidates;
  const claim = (c: (typeof candidates)[number], aspect: string) => c.claims.find((x) => x.aspect === aspect);
  assert.deepEqual([first.kind, first.status, first.execution, first.method], ['image', 'observed', 'deterministic', 'M0']);
  assert.deepEqual([claim(first, 'location')?.status, claim(first, 'digest')?.status, claim(first, 'format')?.value], ['observed', 'observed', 'png']);
  // To the right of the table, one empty column between; below it with a gap of two rows; the far one and the sheet without a table: none.
  assert.deepEqual([claim(first, 'nearby-table')?.value, claim(first, 'nearby-table')?.status, claim(first, 'nearby-table')?.method, claim(first, 'nearby-table')?.reasonCode], ['A1:B3', 'inferred', 'M1', 'geometry-right']);
  assert.equal(claim(second, 'nearby-table')?.reasonCode, 'geometry-below');
  assert.deepEqual(claim(second, 'nearby-table')?.evidence, [{ code: 'below', detail: 'gap=2 cells' }]);
  assert.equal(claim(third, 'nearby-table'), undefined);
  assert.equal(claim(fourth, 'nearby-table'), undefined);
  assert.equal(claim(fourth, 'location'), undefined, 'an absolute anchor has no cell, so no location is asserted');
  // Same picture placed twice: same fingerprint, different places.
  assert.equal(first.fingerprint.digest, third.fingerprint.digest);
  assert.notEqual(first.locator.range, third.locator.range);
  assert.deepEqual(candidates, imageCandidates({ source: './d.xlsx', sourceDigest: sha(bytes), images, tablesBySheet: { 画面一覧: [TABLE] } }), 'deterministic');
});

test('table relation: overlap, adjacency and the distance limit', () => {
  const base = { ordinal: 1, sheet: 's', mediaPart: 'm', format: 'png' as const, bytes: 1, digest: 'sha256:x', extractable: true };
  const at = (fromCol: number, fromRow: number, toCol?: number, toRow?: number) => ({
    ...base,
    anchor: { kind: 'twoCellAnchor' as const, from: { col: fromCol, row: fromRow }, ...(toCol === undefined ? {} : { to: { col: toCol, row: toRow as number } }) },
  });
  assert.equal(relationToTables(at(1, 1, 3, 3), [TABLE])?.relation, 'overlaps');
  assert.deepEqual(relationToTables(at(0, 3), [TABLE]), { table: TABLE, relation: 'below', gap: 0 });
  assert.equal(relationToTables(at(5, 0), [TABLE])?.relation, 'right');
  assert.equal(relationToTables(at(0, 14), [TABLE]), undefined, 'farther than 10 cells is not "nearby"');
  assert.equal(relationToTables(at(4, 5), [TABLE]), undefined, 'diagonal neighbours are not related');
});

test('diagnostics: unsupported format, missing media, external link, broken drawing -- named, and the rest still extracts', () => {
  const ok = pngOf(2, 2, [0, 128, 0]);
  const bytes = buildXlsxWithImages(
    [
      {
        name: 'A',
        anchors: [
          { kind: 'two', from: [0, 0], to: [1, 1], media: 'good.png', name: 'good' },
          { kind: 'two', from: [2, 0], to: [3, 1], media: 'vector.emf', name: 'vec' },
          { kind: 'two', from: [4, 0], to: [5, 1], media: 'x.png', name: 'lost', missing: true },
          { kind: 'two', from: [6, 0], to: [7, 1], media: 'remote.png', name: 'remote', via: 'link' },
        ],
      },
      { name: 'B', rawDrawing: '<xdr:wsDr xmlns:xdr="x"><xdr:twoCellAnchor><xdr:from><xdr:col>0' },
    ],
    { 'good.png': ok, 'vector.emf': emfOf() },
  );
  const result = readExcelImages(bytes);
  assert.deepEqual(result.images.map((image) => [image.name, image.format, image.extractable]), [['good', 'png', true], ['vec', 'emf', false]]);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.sheet]),
    [
      ['MMI_IMAGE_UNSUPPORTED_FORMAT', 'A'],
      ['MMI_IMAGE_MEDIA_MISSING', 'A'],
      ['MMI_IMAGE_EXTERNAL_LINK', 'A'],
      ['MMI_IMAGE_DRAWING_UNREADABLE', 'B'],
    ],
  );
  assert.ok(result.diagnostics.every((d) => d.severity === 'warning' && d.message.length > 0));
});

test('not a package: text, truncated zip and a flipped byte are reported, not thrown', () => {
  assert.equal(readExcelImages(Buffer.from('a,b\n1,2\n')).diagnostics[0].code, 'MMI_IMAGE_NOT_A_PACKAGE');
  const { bytes } = screenDesignWorkbook();
  assert.equal(readExcelImages(bytes.subarray(0, bytes.length - 40)).diagnostics[0].code, 'MMI_IMAGE_NOT_A_PACKAGE');
  // Damage one byte of a stored media entry's data: the CRC catches it and the picture is reported, not returned.
  const corruptEntry = zipOf({ ...Object.fromEntries([...readZip(bytes)].map(([name, entry]) => [name, entry.read()])), 'xl/media/image1.png': pngOf(8, 6, [1, 2, 3]) }, false);
  corruptEntry[corruptEntry.indexOf(Buffer.from('xl/media/image1.png')) + 'xl/media/image1.png'.length + 20] ^= 0xff;
  const result = readExcelImages(corruptEntry);
  assert.ok(result.diagnostics.some((d) => d.code === 'MMI_IMAGE_MEDIA_MISSING' && /CRC|size|inflate/u.test(d.message)));
  assert.ok(result.images.length < 4);
});

test('zip reader refuses oversized entries and too many entries instead of inflating them', () => {
  const big = zipOf({ 'a.bin': Buffer.alloc(300_000, 7) });
  assert.throws(() => readZip(big, { maxEntries: 10, maxEntryBytes: 1000 }).get('a.bin')!.read(), (error: unknown) => error instanceof ZipError && error.code === 'too-large');
  assert.throws(() => readZip(zipOf({ a: '1', b: '2', c: '3' }), { maxEntries: 2, maxEntryBytes: 10 }), (error: unknown) => error instanceof ZipError && error.code === 'too-large');
  assert.equal(readZip(zipOf({ 'x.txt': 'hello' }, false)).get('x.txt')!.read().toString(), 'hello');
});

test('readImageBytes returns the exact media and refuses a changed package', () => {
  const { bytes, media } = screenDesignWorkbook();
  const [image] = readExcelImages(bytes).images;
  assert.deepEqual(readImageBytes(bytes, image), media['image1.png']);
  const swapped = screenDesignWorkbook();
  const other = buildXlsxWithImages([{ name: '画面一覧', anchors: [{ kind: 'one', from: [0, 0], media: 'image1.png' }] }], { 'image1.png': pngOf(3, 3, [9, 9, 9]) });
  assert.throws(() => readImageBytes(other, image), /changed since it was listed/u);
  assert.ok(swapped.bytes.length > 0);
});


test('drawing shapes and graphic frames are diagnosed instead of disappearing silently', () => {
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">',
    '  <xdr:twoCellAnchor>',
    '    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '    <xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '    <xdr:sp/>',
    '    <xdr:cxnSp/>',
    '    <xdr:clientData/>',
    '  </xdr:twoCellAnchor>',
    '  <xdr:absoluteAnchor>',
    '    <xdr:pos x="0" y="0"/>',
    '    <xdr:ext cx="1000" cy="1000"/>',
    '    <xdr:graphicFrame/>',
    '    <xdr:clientData/>',
    '  </xdr:absoluteAnchor>',
    '</xdr:wsDr>',
  ].join('');
  const bytes = buildXlsxWithImages(
    [{ name: '構成図', rawDrawing: drawing }],
    {},
  );

  const result = readExcelImages(bytes);

  assert.deepEqual(result.images, []);
  assert.deepEqual(
    result.shapes.map((shape) => ({
      objectKind: shape.objectKind,
      sheet: shape.sheet,
      range: shape.range,
    })),
    [
      { objectKind: 'shape', sheet: '構成図', range: 'A1:B2' },
      { objectKind: 'connector', sheet: '構成図', range: 'A1:B2' },
    ],
  );
  assert.deepEqual(result.skipped, { shapes: 2, charts: 1 });
  assert.deepEqual(
    result.snapshotHints,
    [
      {
        ordinal: 1,
        sheet: '構成図',
        anchor: {
          kind: 'twoCellAnchor',
          from: { col: 0, row: 0 },
          to: { col: 1, row: 1 },
        },
        range: 'A1:B2',
        shapeCount: 2,
        graphicFrameCount: 0,
        reasonCode: 'drawing-two-cell-anchor',
      },
      {
        ordinal: 2,
        sheet: '構成図',
        anchor: {
          kind: 'absoluteAnchor',
          extentEmu: { cx: 1000, cy: 1000 },
        },
        shapeCount: 0,
        graphicFrameCount: 1,
        reasonCode: 'drawing-absolute-anchor-needs-range',
      },
    ],
  );
  assert.deepEqual(
    result.diagnostics.map((item) => [
      item.code,
      item.severity,
      item.sheet,
      item.message,
    ]),
    [
      [
        'MMI_DRAWING_SHAPES_NOT_EXTRACTED',
        'warning',
        '構成図',
        '2 shape/connector object(s) are present; MMI exposes them as Candidates but does not extract them yet',
      ],
      [
        'MMI_DRAWING_GRAPHIC_FRAMES_NOT_EXTRACTED',
        'warning',
        '構成図',
        '1 graphic-frame object(s) are present; these may include charts or diagrams and are not extracted yet',
      ],
    ],
  );
});


test('DrawingML shape properties become observed M0 shape Candidates', () => {
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:sp>',
    '<xdr:nvSpPr><xdr:cNvPr id="7" name="受付" descr="開始点"/></xdr:nvSpPr>',
    '<xdr:spPr><a:prstGeom prst="roundRect"/></xdr:spPr>',
    '<xdr:txBody><a:p><a:r><a:t>申請</a:t></a:r><a:r><a:t>受付</a:t></a:r></a:p></xdr:txBody>',
    '</xdr:sp>',
    '<xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  const bytes = buildXlsxWithImages(
    [{ name: '業務フロー', rawDrawing: drawing }],
    {},
  );
  const read = readExcelImages(bytes);
  assert.equal(read.shapes.length, 1);
  assert.deepEqual(read.shapes[0], {
    ordinal: 1,
    sheet: '業務フロー',
    drawingPart: 'xl/drawings/drawing1.xml',
    objectKind: 'shape',
    objectId: '7',
    name: '受付',
    description: '開始点',
    textRuns: ['申請', '受付'],
    presetGeometry: 'roundRect',
    anchor: {
      kind: 'twoCellAnchor',
      from: { col: 1, row: 2 },
      to: { col: 3, row: 4 },
    },
    range: 'B3:D5',
    structuralPath: 'drawing:xl/drawings/drawing1.xml#shape:7',
  });

  const candidate = shapeCandidates({
    source: './flow.xlsx',
    sourceDigest: 'sha256:' + 'a'.repeat(64),
    shapes: read.shapes,
  })[0];
  assert.equal(candidate.kind, 'shape');
  assert.equal(candidate.status, 'observed');
  assert.equal(candidate.execution, 'deterministic');
  assert.equal(candidate.method, 'M0');
  assert.equal(candidate.locator.range, undefined);
  assert.equal(
    candidate.locator.structuralPath,
    'drawing:xl/drawings/drawing1.xml#shape:7',
  );
  assert.equal(
    candidate.claims.find((claim) => claim.aspect === 'location')?.value,
    'B3:D5',
  );
  assert.deepEqual(
    candidate.claims.find((claim) => claim.aspect === 'text-runs')?.value,
    ['申請', '受付'],
  );
  assert.equal(candidateProblem(candidate), undefined);
});

test('shape content fingerprint is independent from its cell anchor', () => {
  const makeDrawing = (startCol: number): string => [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<xdr:twoCellAnchor>',
    `<xdr:from><xdr:col>${startCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`,
    `<xdr:to><xdr:col>${startCol + 2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`,
    '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="3" name="処理"/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="rect"/></xdr:spPr><xdr:txBody><a:p><a:r><a:t>処理</a:t></a:r></a:p></xdr:txBody></xdr:sp>',
    '<xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  const first = readExcelImages(buildXlsxWithImages(
    [{ name: 'Flow', rawDrawing: makeDrawing(0) }],
    {},
  ));
  const moved = readExcelImages(buildXlsxWithImages(
    [{ name: 'Flow', rawDrawing: makeDrawing(4) }],
    {},
  ));
  const inputDigest = 'sha256:' + 'b'.repeat(64);
  const firstCandidate = shapeCandidates({
    source: './flow.xlsx',
    sourceDigest: inputDigest,
    shapes: first.shapes,
  })[0];
  const movedCandidate = shapeCandidates({
    source: './flow.xlsx',
    sourceDigest: inputDigest,
    shapes: moved.shapes,
  })[0];
  assert.notEqual(
    first.shapes[0].range,
    moved.shapes[0].range,
  );
  assert.equal(
    firstCandidate.fingerprint.digest,
    movedCandidate.fingerprint.digest,
  );
});


test('duplicate DrawingML object ids keep distinct occurrence identities', () => {
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="7" name="A"/></xdr:nvSpPr></xdr:sp>',
    '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="7" name="B"/></xdr:nvSpPr></xdr:sp>',
    '<xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  const read = readExcelImages(buildXlsxWithImages(
    [{ name: 'Flow', rawDrawing: drawing }],
    {},
  ));

  assert.deepEqual(
    read.shapes.map((shape) => shape.structuralPath),
    [
      'drawing:xl/drawings/drawing1.xml#shape:7',
      'drawing:xl/drawings/drawing1.xml#shape:7:occurrence:2',
    ],
  );
  const candidates = shapeCandidates({
    source: './flow.xlsx',
    sourceDigest: 'sha256:' + 'd'.repeat(64),
    shapes: read.shapes,
  });
  assert.notEqual(
    candidates[0].locator.structuralPath,
    candidates[1].locator.structuralPath,
  );
});
