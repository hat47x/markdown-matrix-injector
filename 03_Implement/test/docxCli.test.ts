import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectSource } from '../src/cli/mmi.js';
import { extractDocxImage, extractDocxTable } from '../src/application/extractDocx.js';
import { checkExtractedProvenanceFreshness } from '../src/application/detachFreshness.js';
import { readLedger } from '../src/core/importLedger.js';
import { candidateProblem } from '../src/core/candidate.js';
import { pngOf } from './helpers/buildXlsxWithImages.js';
import {
  buildDocx,
  drawing,
  paragraph,
  relationship,
  stylesXml,
  tableWithHeaderRow,
} from './helpers/buildDocx.js';

const PNG = pngOf(6, 4, [10, 20, 30]);

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-docx-'));
}

test('inspectSource routes .docx to Word Candidates without workbook sections', () => {
  const root = workspace();
  try {
    const file = path.join(root, 'design.docx');
    fs.writeFileSync(file, buildDocx({
      styles: stylesXml([{ id: 'Heading1', name: 'heading 1' }]),
      relationships: [relationship({ id: 'rId1', target: 'media/image1.png' })],
      media: { 'image1.png': PNG },
      body:
        paragraph('概要', { styleId: 'Heading1' })
        + tableWithHeaderRow(['項目', '内容'], [['名前', 'MMI']])
        + drawing({ relationshipId: 'rId1', name: '構成図' }),
    }));
    const result = inspectSource(file, 0, path.join(root, 'doc.md'));
    assert.equal(result.source, './design.docx');
    assert.deepEqual(result.sheets, []);
    assert.deepEqual(result.images, []);
    assert.equal(result.candidates.length, 3);
    assert.ok(result.candidates.every((candidate) => candidateProblem(candidate) === undefined));
    assert.deepEqual(result.docx?.headings.map((heading) => [heading.level, heading.text]), [[1, '概要']]);
    assert.deepEqual(result.docx?.tables.map((item) => [item.rows, item.columns, item.explicitHeaderRow]), [[2, 2, 1]]);
    assert.deepEqual(result.docx?.images.map((image) => [image.name, image.format, image.extractable]), [['構成図', 'png', true]]);
    assert.deepEqual(result.docx?.sectionTree.preamble, []);
    assert.deepEqual(
      result.docx?.sectionTree.roots.map((node) => [node.level, node.text, node.contentPaths]),
      [[1, '概要', ['/body/tbl[1]', '/body/p[2]']]],
    );
    assert.deepEqual(result.docxDiagnostics, []);
    assert.ok(!JSON.stringify(result).includes('<w:'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractDocxTable writes one reviewed GFM asset and records ledger provenance', () => {
  const root = workspace();
  try {
    const file = path.join(root, 'design.docx');
    const bytes = buildDocx({
      body: tableWithHeaderRow(['項目', '内容'], [['名前', 'MMI'], ['範囲', 'A1:B2']]),
    });
    fs.writeFileSync(file, bytes);
    const inspected = inspectSource(file, 0, path.join(root, 'doc.md'));
    const table = inspected.docx?.tables[0];
    assert.ok(table);
    const result = extractDocxTable({
      sourcePath: file,
      ordinal: 1,
      expectedFingerprint: table.fingerprint,
      workspaceRoot: root,
      outDir: path.join(root, 'assets'),
      ledgerPath: path.join(root, 'mmi-ledger.json'),
      fromDocument: path.join(root, 'doc.md'),
    });
    assert.deepEqual(result.problems, []);
    assert.ok(result.extracted);
    assert.equal(result.extracted.status, 'written');
    assert.match(result.extracted.markdown, /^\| 項目 \| 内容 \|\n\| --- \| --- \|\n\| 名前 \| MMI \|/u);
    assert.match(result.extracted.markdown, /mmi:extracted-table/u);
    assert.equal(fs.readFileSync(result.extracted.file, 'utf8'), `${result.extracted.markdown}\n`);
    const ledger = readLedger(path.join(root, 'mmi-ledger.json'));
    assert.equal(ledger.entries.length, 1);
    assert.deepEqual(
      [ledger.entries[0].kind, ledger.entries[0].place, ledger.entries[0].conversion.layout],
      ['table-range', 'path:/body/tbl[1]', 'docx-grid-v1'],
    );
    assert.equal(ledger.entries[0].fingerprint.digest, table.fingerprint);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extractDocxImage writes a content-addressed picture and Markdown reference', () => {
  const root = workspace();
  try {
    const file = path.join(root, 'design.docx');
    fs.writeFileSync(file, buildDocx({
      relationships: [relationship({ id: 'rId1', target: 'media/image1.png' })],
      media: { 'image1.png': PNG },
      body: drawing({ relationshipId: 'rId1', name: '構成図', description: 'システム構成' }),
    }));
    const inspected = inspectSource(file, 0, path.join(root, 'doc.md'));
    const image = inspected.docx?.images[0];
    assert.ok(image);
    const imageCandidate = inspected.candidates.find((candidate) => candidate.kind === 'image');
    assert.ok(imageCandidate);
    const result = extractDocxImage({
      sourcePath: file,
      ordinal: 1,
      expectedFingerprint: imageCandidate.fingerprint.digest,
      workspaceRoot: root,
      outDir: path.join(root, 'assets'),
      ledgerPath: path.join(root, 'mmi-ledger.json'),
      fromDocument: path.join(root, 'doc.md'),
    });
    assert.deepEqual(result.problems, []);
    assert.ok(result.extracted);
    assert.equal(result.extracted.altText, 'システム構成');
    assert.match(result.extracted.markdown, /^!\[システム構成\]\(assets\/[0-9a-f]{12}\.png\)/u);
    assert.deepEqual(fs.readFileSync(result.extracted.file), PNG);
    assert.equal(readLedger(path.join(root, 'mmi-ledger.json')).entries[0].kind, 'image');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('review-time fingerprint mismatch is refused and leaves no output', () => {
  const root = workspace();
  try {
    const file = path.join(root, 'design.docx');
    fs.writeFileSync(file, buildDocx({ body: tableWithHeaderRow(['A'], [['1']]) }));
    const result = extractDocxTable({
      sourcePath: file,
      ordinal: 1,
      expectedFingerprint: `sha256:${'0'.repeat(64)}`,
      workspaceRoot: root,
      outDir: path.join(root, 'assets'),
      ledgerPath: path.join(root, 'mmi-ledger.json'),
    });
    assert.equal(result.problems[0].code, 'MMI_DOCX_TABLE_CHANGED');
    assert.equal(fs.existsSync(path.join(root, 'assets')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('outputs outside the workspace are rejected before writing', () => {
  const root = workspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-docx-outside-'));
  try {
    const file = path.join(root, 'design.docx');
    fs.writeFileSync(file, buildDocx({ body: tableWithHeaderRow(['A'], [['1']]) }));
    const inspected = inspectSource(file, 0);
    const result = extractDocxTable({
      sourcePath: file,
      ordinal: 1,
      expectedFingerprint: inspected.candidates[0].fingerprint.digest,
      workspaceRoot: root,
      outDir: outside,
      ledgerPath: path.join(root, 'mmi-ledger.json'),
    });
    assert.equal(result.problems[0].code, 'MMI_DOCX_OUTPUT_FAILED');
    assert.match(result.problems[0].message, /OUTSIDE_ROOT/u);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('Word extracted tables and pictures participate in detach freshness checks', () => {
  const root = workspace();
  try {
    const source = path.join(root, 'design.docx');
    const document = path.join(root, 'doc.md');
    const ledger = path.join(root, 'mmi-ledger.json');
    const make = (value: string) => buildDocx({
      relationships: [relationship({ id: 'rId1', target: 'media/image1.png' })],
      media: { 'image1.png': PNG },
      body: tableWithHeaderRow(['項目'], [[value]]) + drawing({ relationshipId: 'rId1', name: '図' }),
    });
    fs.writeFileSync(source, make('当初'));
    const inspected = inspectSource(source, 0, document);
    const table = inspected.docx?.tables[0];
    const imageCandidate = inspected.candidates.find((candidate) => candidate.kind === 'image');
    assert.ok(table && imageCandidate);
    const tableResult = extractDocxTable({
      sourcePath: source,
      ordinal: 1,
      expectedFingerprint: table.fingerprint,
      workspaceRoot: root,
      outDir: path.join(root, 'assets'),
      ledgerPath: ledger,
      fromDocument: document,
    });
    const imageResult = extractDocxImage({
      sourcePath: source,
      ordinal: 1,
      expectedFingerprint: imageCandidate.fingerprint.digest,
      workspaceRoot: root,
      outDir: path.join(root, 'assets'),
      ledgerPath: ledger,
      fromDocument: document,
    });
    assert.deepEqual([...tableResult.problems, ...imageResult.problems], []);
    assert.ok(tableResult.extracted && imageResult.extracted);
    fs.writeFileSync(
      document,
      `${tableResult.extracted.markdown}\n\n${imageResult.extracted.markdown}\n`,
    );
    const fresh = checkExtractedProvenanceFreshness({
      markdownFilePath: document,
      workspaceRoot: root,
      ledgerPath: ledger,
    });
    assert.deepEqual([fresh.checked, fresh.errors], [2, 0]);

    fs.writeFileSync(source, make('変更後'));
    const stale = checkExtractedProvenanceFreshness({
      markdownFilePath: document,
      workspaceRoot: root,
      ledgerPath: ledger,
    });
    assert.ok(stale.errors > 0);
    assert.equal(stale.checked, 2);
    assert.equal(stale.problems.length, 1, 'the unchanged picture remains fresh');
    assert.equal(stale.problems[0].code, 'MMI_DETACH_EXTRACTED_STALE');
    assert.equal(stale.problems[0].place, 'path:/body/tbl[1]');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
