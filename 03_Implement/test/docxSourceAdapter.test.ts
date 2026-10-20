import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { candidateProblem } from '../src/core/candidate.js';
import { readDocx, readDocxImageBytes } from '../src/adapters/docxSourceAdapter.js';
import { pngOf, zipOf } from './helpers/buildXlsxWithImages.js';
import {
  buildDocx,
  commentsXml,
  drawing,
  markedComment,
  paragraph,
  relationship,
  stylesXml,
  table,
  tableWithHeaderRow,
} from './helpers/buildDocx.js';

const sha = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const PNG = pngOf(4, 3, [12, 34, 56]);

function claims(candidate: { claims: readonly { aspect: string; value?: string | readonly string[]; status: string; method: string; reasonCode: string }[] }, aspect: string) {
  return candidate.claims.find((claim) => claim.aspect === aspect);
}

test('headings: explicit heading styles become observed Section Candidates with source paths', () => {
  const bytes = buildDocx({
    styles: stylesXml([
      { id: 'Heading1', name: 'heading 1' },
      { id: 'CustomHeading', name: '見出し 2', basedOn: 'Heading1' },
      { id: 'BodyText' },
    ]),
    body:
      paragraph('概要', { styleId: 'Heading1' })
      + paragraph('本文')
      + paragraph('詳細', { styleId: 'CustomHeading' })
      + paragraph('アウトライン', { outlineLevel: 2 })
      + paragraph('本文ではない', { styleId: 'BodyText' }),
  });
  const result = readDocx(bytes, './design.docx');
  assert.equal(result.documentReadable, true);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.headings.map((heading) => [heading.ordinal, heading.level, heading.text, heading.structuralPath]), [
    [1, 1, '概要', '/body/p[1]'],
    [2, 2, '詳細', '/body/p[3]'],
    [3, 3, 'アウトライン', '/body/p[4]'],
  ]);
  for (const heading of result.headings) {
    assert.equal(candidateProblem(heading.candidate), undefined);
    assert.deepEqual([heading.candidate.kind, heading.candidate.status, heading.candidate.execution, heading.candidate.method], ['section', 'observed', 'deterministic', 'M0']);
    assert.equal(claims(heading.candidate, 'heading-level')?.status, 'observed');
    assert.equal(heading.candidate.locator.structuralPath, heading.structuralPath);
  }
  assert.equal(result.headings[1].candidate.claims.some((claim) => claim.aspect === 'style-id' && claim.value === 'CustomHeading'), true);
});

test('headings: style outline levels and style ids resolve without guessing from formatting', () => {
  const bytes = buildDocx({
    styles: stylesXml([
      { id: 'CustomOutline', name: '章見出し', outlineLevel: 3 },
      { id: 'BodyText' },
    ]),
    body:
      paragraph('章', { styleId: 'CustomOutline' })
      + paragraph('直接指定', { styleId: 'Heading4' })
      + paragraph('太字だけ', { styleId: 'BodyText' }),
  });
  const result = readDocx(bytes, './outline.docx');
  assert.deepEqual(result.headings.map((heading) => [heading.level, heading.text]), [
    [4, '章'],
    [4, '直接指定'],
  ]);
  // No direct formatting inference: a body-styled paragraph is not a heading.
  assert.equal(result.headings.some((heading) => heading.text === '太字だけ'), false);
});

test('headings: a heading style inside a table is reported, not promoted to a Section Candidate', () => {
  const bytes = buildDocx({
    styles: stylesXml([{ id: 'Heading1', name: 'heading 1' }]),
    body: table([[{ text: '見出し' }]]).replace(
      '<w:p><w:r><w:t xml:space="preserve">見出し</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>見出し</w:t></w:r></w:p>',
    ),
  });
  const result = readDocx(bytes, './in-table.docx');
  assert.equal(result.headings.length, 0);
  assert.ok(result.diagnostics.some((item) => item.code === 'MMI_DOCX_HEADING_IN_TABLE'));
});

test('tables: gridSpan, explicit header row, shape claims and deterministic fingerprint', () => {
  const bytes = buildDocx({
    body: tableWithHeaderRow(['項目', '内容'], [['名前', 'MMI'], ['範囲', 'A1:B2']])
      + table([[{ text: '結合', gridSpan: 2 }]]),
  });
  const result = readDocx(bytes, './tables.docx');
  assert.equal(result.tables.length, 2);
  assert.deepEqual(result.tables[0].grid, [
    ['項目', '内容'],
    ['名前', 'MMI'],
    ['範囲', 'A1:B2'],
  ]);
  assert.equal(result.tables[0].rows, 3);
  assert.equal(result.tables[0].columns, 2);
  assert.equal(result.tables[0].explicitHeaderRow, 1);
  assert.deepEqual(result.tables[1].grid, [['結合', '']]);
  for (const item of result.tables) assert.equal(candidateProblem(item.candidate), undefined);
  assert.deepEqual(
    [result.tables[0].candidate.kind, result.tables[0].candidate.status, result.tables[0].candidate.execution, result.tables[0].candidate.method],
    ['table-range', 'observed', 'deterministic', 'M0'],
  );
  assert.deepEqual(
    [claims(result.tables[0].candidate, 'header-row')?.status, claims(result.tables[0].candidate, 'header-row')?.value],
    ['observed', '1'],
  );
  assert.equal(claims(result.tables[1].candidate, 'header-row')?.status, 'abstained');
  assert.equal(claims(result.tables[1].candidate, 'header-row')?.reasonCode, 'no-explicit-header-row');
  assert.equal(result.tables[0].candidate.locator.structuralPath, '/body/tbl[1]');
  assert.equal(result.tables[1].candidate.locator.structuralPath, '/body/tbl[2]');
  assert.deepEqual(readDocx(bytes, './tables.docx').candidates, result.candidates, 'deterministic');
});

test('nested tables are observed separately and the outer cell is not flattened silently', () => {
  const nested = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>内側</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
  const body = `<w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:r><w:t>外側</w:t></w:r></w:p>${nested}</w:tc></w:tr></w:tbl>`;
  const result = readDocx(buildDocx({ body }), './nested.docx');
  assert.deepEqual(result.tables.map((item) => item.structuralPath), [
    '/body/tbl[1]',
    '/body/tbl[1]/tr[1]/tc[1]/tbl[1]',
  ]);
  assert.ok(result.diagnostics.some((item) => item.code === 'MMI_DOCX_NESTED_TABLE_NOT_FLATTENED'));
});

test('images: embedded media is observed; name, alt text, extent and digest are separate claims', () => {
  const bytes = buildDocx({
    relationships: [relationship({ id: 'rId1', target: 'media/image1.png' })],
    media: { 'image1.png': PNG },
    body: drawing({
      relationshipId: 'rId1',
      name: '構成図',
      description: 'システム構成',
      extent: { cx: 1905000, cy: 952500 },
    }),
  });
  const result = readDocx(bytes, './images.docx');
  assert.equal(result.images.length, 1);
  const image = result.images[0];
  assert.deepEqual(
    [image.structuralPath, image.mediaPart, image.format, image.bytes, image.extractable],
    ['/body/p[1]/drawing[1]', 'word/media/image1.png', 'png', PNG.length, true],
  );
  assert.equal(image.digest, sha(PNG));
  assert.deepEqual(image.extentEmu, { cx: 1905000, cy: 952500 });
  assert.equal(image.description, 'システム構成');
  assert.equal(candidateProblem(image.candidate), undefined);
  assert.equal(claims(image.candidate, 'extent-emu')?.value, '1905000x952500');
  assert.deepEqual(readDocxImageBytes(bytes, image), PNG);
});

test('images: external, missing and non-Markdown media are named and do not stop other pictures', () => {
  const emf = Buffer.concat([Buffer.alloc(40), Buffer.from([0x20, 0x45, 0x4d, 0x46])]);
  const bytes = buildDocx({
    relationships: [
      relationship({ id: 'rId1', target: 'media/good.png' }),
      relationship({ id: 'rId2', target: 'https://example.invalid/a.png', external: true }),
      relationship({ id: 'rId3', target: 'media/missing.png' }),
      relationship({ id: 'rId4', target: 'media/vector.emf' }),
    ],
    media: { 'good.png': PNG, 'vector.emf': emf },
    body:
      drawing({ relationshipId: 'rId1', name: 'good' })
      + drawing({ externalRelationshipId: 'rId2', name: 'remote' })
      + drawing({ relationshipId: 'rId3', name: 'lost' })
      + drawing({ relationshipId: 'rId4', name: 'vec' }),
  });
  const result = readDocx(bytes, './diagnostics.docx');
  assert.deepEqual(result.images.map((image) => [image.name, image.format, image.extractable]), [
    ['good', 'png', true],
    ['vec', 'emf', false],
  ]);
  assert.deepEqual(result.diagnostics.map((item) => item.code), [
    'MMI_DOCX_IMAGE_EXTERNAL_LINK',
    'MMI_DOCX_IMAGE_MEDIA_MISSING',
    'MMI_DOCX_IMAGE_UNSUPPORTED_FORMAT',
  ]);
});

test('comments: text, author/date and anchor are observed; an orphan comment does not disappear', () => {
  const bytes = buildDocx({
    comments: commentsXml([
      { id: '0', text: '確認してください', author: 'レビュア', initials: 'RV', date: '2026-10-20T00:00:00Z' },
      { id: '1', text: '孤立したコメント' },
    ]),
    body: markedComment('対象の段落', '0') + paragraph('別の段落'),
  });
  const result = readDocx(bytes, './comments.docx');
  assert.equal(result.comments.length, 2);
  assert.deepEqual(
    [result.comments[0].structuralPath, result.comments[0].author, result.comments[0].date, result.comments[0].text],
    ['/body/p[1]', 'レビュア', '2026-10-20T00:00:00Z', '確認してください'],
  );
  assert.equal(result.comments[1].structuralPath, undefined);
  assert.equal(candidateProblem(result.comments[0].candidate), undefined);
  assert.equal(claims(result.comments[0].candidate, 'anchor')?.status, 'observed');
  assert.equal(claims(result.comments[1].candidate, 'anchor')?.status, 'abstained');
  assert.ok(result.diagnostics.some((item) => item.code === 'MMI_DOCX_COMMENT_ANCHOR_MISSING'));
});

test('package failures are diagnostics, not exceptions; optional parts do not block the document', () => {
  assert.deepEqual(readDocx(Buffer.from('not a zip'), './x.docx').diagnostics.map((item) => item.code), ['MMI_DOCX_NOT_A_PACKAGE']);
  assert.deepEqual(readDocx(zipOf({ 'word/styles.xml': '<w:styles/>' }), './x.docx').diagnostics.map((item) => item.code), ['MMI_DOCX_MAIN_DOCUMENT_MISSING']);
  const malformed = readDocx(buildDocx({ documentXml: '<w:document><w:body><w:p>' }), './x.docx');
  assert.equal(malformed.documentReadable, false);
  assert.deepEqual(malformed.diagnostics.map((item) => item.code), ['MMI_DOCX_MAIN_DOCUMENT_UNREADABLE']);

  const brokenStyles = buildDocx({ styles: '<w:styles><w:style', body: paragraph('本文') });
  const usable = readDocx(brokenStyles, './x.docx');
  assert.equal(usable.documentReadable, true);
  assert.ok(usable.diagnostics.some((item) => item.code === 'MMI_DOCX_PART_UNREADABLE'));
});

test('readDocx never writes to the package bytes and all Candidates satisfy the shared contract', () => {
  const bytes = buildDocx({
    styles: stylesXml([{ id: 'Heading1', name: 'heading 1' }]),
    comments: commentsXml([{ id: '0', text: 'コメント' }]),
    relationships: [relationship({ id: 'rId1', target: 'media/image1.png' })],
    media: { 'image1.png': PNG },
    body:
      paragraph('見出し', { styleId: 'Heading1' })
      + tableWithHeaderRow(['A', 'B'], [['1', '2']])
      + drawing({ relationshipId: 'rId1' })
      + markedComment('本文', '0'),
  });
  const before = Buffer.from(bytes);
  const result = readDocx(bytes, './all.docx');
  assert.deepEqual(bytes, before);
  assert.equal(result.candidates.length, 4);
  for (const candidate of result.candidates) {
    assert.equal(candidateProblem(candidate), undefined);
    assert.equal(candidate.locator.sourceDigest, sha(bytes));
    assert.equal(candidate.provenance.run.inputDigest, candidate.locator.sourceDigest);
  }
});
