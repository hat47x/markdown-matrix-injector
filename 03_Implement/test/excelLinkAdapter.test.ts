import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  linkCandidates,
  readExcelLinks,
} from '../src/adapters/excelLinkAdapter.js';
import { inspectSource } from '../src/cli/mmi.js';
import { zipOf } from './helpers/buildXlsxWithImages.js';

const RELATIONSHIP_HYPERLINK =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

function workbookWithLinks(input: {
  hyperlinks?: string;
  relationships?: string;
  sheetXml?: string;
} = {}): Buffer {
  const hyperlinks = input.hyperlinks ?? `<hyperlinks>
    <hyperlink ref="A2" r:id="rIdUrl" display="仕様書" tooltip="外部"/>
    <hyperlink ref="B2" r:id="rIdPath"/>
    <hyperlink ref="C2" location="'一覧'!A1" display="一覧へ"/>
    <hyperlink ref="D2" r:id="rIdUrl" display="同じ宛先"/>
    <hyperlink ref="E2" r:id="rIdUrl" location="section-2"/>
  </hyperlinks>`;
  const relationships = input.relationships ?? `
  <Relationship Id="rIdUrl" Type="${RELATIONSHIP_HYPERLINK}" Target="https://example.com/spec?a=1&amp;b=2" TargetMode="External"/>
  <Relationship Id="rIdPath" Type="${RELATIONSHIP_HYPERLINK}" Target="..\\other\\book.xlsx" TargetMode="External"/>`;
  return zipOf({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="設計" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    'xl/worksheets/sheet1.xml': input.sheetXml ?? `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>項目</t></is></c></row></sheetData>
  ${hyperlinks}
</worksheet>`,
    'xl/worksheets/_rels/sheet1.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}
</Relationships>`,
  });
}

const sha256 = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('hyperlinks are read as written, without being followed', () => {
  const { links, diagnostics } = readExcelLinks(workbookWithLinks());
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(
    links.map((link) => [link.ref, link.targetKind, link.target, link.location, link.display]),
    [
      ['A2', 'external-url', 'https://example.com/spec?a=1&b=2', undefined, '仕様書'],
      ['B2', 'external-path', '..\\other\\book.xlsx', undefined, undefined],
      ['C2', 'workbook-location', "'一覧'!A1", undefined, '一覧へ'],
      ['D2', 'external-url', 'https://example.com/spec?a=1&b=2', undefined, '同じ宛先'],
      ['E2', 'external-url', 'https://example.com/spec?a=1&b=2', 'section-2', undefined],
    ],
  );
});

test('position and content stay separate: same target in another cell is another occurrence', () => {
  const { links } = readExcelLinks(workbookWithLinks());
  const sha = `sha256:${'0'.repeat(64)}`;
  const candidates = linkCandidates({ source: 'book.xlsx', sourceDigest: sha, links });
  assert.equal(candidates.length, 5);
  const [a2, , , d2] = candidates;
  assert.equal(a2.kind, 'link');
  assert.equal(a2.status, 'observed');
  assert.equal(a2.method, 'M0');
  assert.equal(a2.execution, 'deterministic');
  assert.notDeepEqual(a2.locator.range, d2.locator.range);
  // Same target but a different display text: content differs, position differs.
  assert.notEqual(a2.fingerprint.digest, d2.fingerprint.digest);
  assert.notEqual(links[0].contentDigest, links[3].contentDigest);
});

test('unreadable or dangling hyperlinks are reported and do not stop the others', () => {
  const { links, diagnostics } = readExcelLinks(
    workbookWithLinks({
      hyperlinks: `<hyperlinks>
        <hyperlink ref="A2" r:id="rIdGone"/>
        <hyperlink display="no ref" location="X!A1"/>
        <hyperlink ref="C2"/>
        <hyperlink ref="D2" location="Sheet1!A1"/>
      </hyperlinks>`,
    }),
  );
  assert.deepEqual(links.map((link) => link.ref), ['D2']);
  assert.deepEqual(
    diagnostics.map((item) => item.code),
    ['MMI_LINK_TARGET_MISSING', 'MMI_LINK_REF_MISSING', 'MMI_LINK_TARGET_MISSING'],
  );
});

test('a workbook without hyperlinks yields nothing', () => {
  const { links, diagnostics } = readExcelLinks(
    workbookWithLinks({ hyperlinks: '', relationships: '' }),
  );
  assert.deepEqual({ links, diagnostics }, { links: [], diagnostics: [] });
});

test('a broken package is reported instead of thrown', () => {
  const { links, diagnostics } = readExcelLinks(Buffer.from('not a zip'));
  assert.equal(links.length, 0);
  assert.equal(diagnostics[0]?.code, 'MMI_LINK_PACKAGE_UNREADABLE');
});

test('inspect lists link Candidates and leaves the workbook unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-link-'));
  try {
    const file = path.join(dir, 'book.xlsx');
    const bytes = workbookWithLinks();
    fs.writeFileSync(file, bytes);
    const before = sha256(fs.readFileSync(file));
    const result = inspectSource(file, 0, dir);
    assert.equal(result.links?.length, 5);
    assert.equal(
      result.candidates.filter((candidate) => candidate.kind === 'link').length,
      5,
    );
    assert.equal(sha256(fs.readFileSync(file)), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
