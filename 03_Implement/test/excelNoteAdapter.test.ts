import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  noteCandidates,
  readExcelNotes,
} from '../src/adapters/excelNoteAdapter.js';
import { inspectSource, main } from '../src/cli/mmi.js';
import { readSourceFileIdentity } from '../src/core/sourceIdentity.js';
import { zipOf } from './helpers/buildXlsxWithImages.js';

const esc = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

function workbookWithNotes(input: {
  commentsXml?: string;
  commentsTarget?: string;
  threaded?: boolean;
} = {}): Buffer {
  const commentsTarget = input.commentsTarget ?? '../comments1.xml';
  const commentsXml = input.commentsXml ?? `<?xml version="1.0" encoding="UTF-8"?>
<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <authors>
    <author>Alice &amp; QA</author>
    <author>Bob</author>
  </authors>
  <commentList>
    <comment ref="B2" authorId="0">
      <text><r><t>要確認:</t></r><r><t xml:space="preserve"> API &amp; DB</t></r></text>
    </comment>
    <comment ref="C3" authorId="0">
      <text><t>要確認: API &amp; DB</t></text>
    </comment>
    <comment ref="D4" authorId="1">
      <text><t>SECRET-NOTE-BODY</t></text>
    </comment>
  </commentList>
</comments>`;
  const sheetRelationships = [
    `<Relationship Id="rIdComment" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="${esc(commentsTarget)}"/>`,
    ...(input.threaded
      ? ['<Relationship Id="rIdThread" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/>']
      : []),
  ].join('');

  const entries: Record<string, Buffer | string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>
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
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>項目</t></is></c></row>
    <row r="2"><c r="B2" t="inlineStr"><is><t>API</t></is></c></row>
    <row r="3"><c r="C3" t="inlineStr"><is><t>DB</t></is></c></row>
    <row r="4"><c r="D4" t="inlineStr"><is><t>内部</t></is></c></row>
  </sheetData>
</worksheet>`,
    'xl/worksheets/_rels/sheet1.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
</Relationships>`,
  };
  if (!commentsTarget.includes('missing')) {
    entries['xl/comments1.xml'] = commentsXml;
  }
  if (input.threaded) {
    entries['xl/threadedComments/threadedComment1.xml'] =
      '<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"/>';
  }
  return zipOf(entries);
}

const digest = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function captureMain(
  argv: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const oldWrite = process.stdout.write.bind(process.stdout);
  const oldError = console.error;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      stdout: stdout.join(''),
      stderr: stderr.join('\n'),
    };
  } finally {
    process.stdout.write = oldWrite;
    console.error = oldError;
  }
}

test('classic Excel Notes are explicit M0 Candidates with location-independent content fingerprints', () => {
  const bytes = workbookWithNotes();
  const read = readExcelNotes(bytes);

  assert.deepEqual(read.diagnostics, []);
  assert.equal(read.notes.length, 3);
  assert.deepEqual(
    read.notes.map((note) => ({
      sheet: note.sheet,
      cell: note.cell,
      author: note.author,
      text: note.text,
    })),
    [
      {
        sheet: '設計',
        cell: 'B2',
        author: 'Alice & QA',
        text: '要確認: API & DB',
      },
      {
        sheet: '設計',
        cell: 'C3',
        author: 'Alice & QA',
        text: '要確認: API & DB',
      },
      {
        sheet: '設計',
        cell: 'D4',
        author: 'Bob',
        text: 'SECRET-NOTE-BODY',
      },
    ],
  );
  assert.equal(
    read.notes[0].contentDigest,
    read.notes[1].contentDigest,
    'same author and text share content identity',
  );

  const sourceDigest = digest(bytes);
  const candidates = noteCandidates({
    source: './design.xlsx',
    sourceDigest,
    notes: read.notes,
  });
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].kind, 'note');
  assert.equal(candidates[0].status, 'observed');
  assert.equal(candidates[0].execution, 'deterministic');
  assert.equal(candidates[0].method, 'M0');
  assert.equal(candidates[0].locator.range, 'B2');
  assert.equal(candidates[1].locator.range, 'C3');
  assert.equal(
    candidates[0].fingerprint.digest,
    candidates[1].fingerprint.digest,
    'content fingerprint is independent of occurrence location',
  );
  assert.equal(
    candidates[0].claims.find((claim) => claim.aspect === 'text')?.value,
    '要確認: API & DB',
  );
});

test('missing and threaded comment parts stay visible as diagnostics', () => {
  const missing = readExcelNotes(
    workbookWithNotes({ commentsTarget: '../missing-comments.xml' }),
  );
  assert.equal(missing.notes.length, 0);
  assert.ok(
    missing.diagnostics.some(
      (item) => item.code === 'MMI_NOTE_COMMENTS_MISSING',
    ),
  );

  const threaded = readExcelNotes(workbookWithNotes({ threaded: true }));
  assert.equal(threaded.notes.length, 3);
  assert.ok(
    threaded.diagnostics.some(
      (item) => item.code === 'MMI_NOTE_THREADED_UNSUPPORTED',
    ),
  );

  const malformed = readExcelNotes(
    workbookWithNotes({ commentsXml: '<comments><commentList>' }),
  );
  assert.equal(malformed.notes.length, 0);
  assert.ok(
    malformed.diagnostics.some(
      (item) => item.code === 'MMI_NOTE_COMMENTS_UNREADABLE',
    ),
  );
});

test('inspect shares Note Candidates but text mode does not disclose note bodies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-note-'));
  const source = path.join(root, 'design.xlsx');
  const bytes = workbookWithNotes();
  fs.writeFileSync(source, bytes);
  const before = readSourceFileIdentity(source).digest;

  const inspected = inspectSource(source, 0);
  assert.equal(inspected.notes.length, 3);
  assert.equal(
    inspected.candidates.filter((candidate) => candidate.kind === 'note').length,
    3,
  );
  assert.deepEqual(
    inspected.notes.map((note) => note.cell),
    ['B2', 'C3', 'D4'],
  );
  assert.equal(
    inspected.notes.some(
      (note) => 'text' in (note as unknown as Record<string, unknown>),
    ),
    false,
  );

  const textResult = await captureMain([
    'inspect',
    source,
    '--root',
    root,
  ]);
  assert.equal(textResult.code, 0, textResult.stderr);
  assert.match(textResult.stdout, /note #3\s+D4\s+16 chars/u);
  assert.doesNotMatch(textResult.stdout, /SECRET-NOTE-BODY/u);

  const jsonResult = await captureMain([
    'inspect',
    source,
    '--root',
    root,
    '--json',
  ]);
  assert.equal(jsonResult.code, 0, jsonResult.stderr);
  const payload = JSON.parse(jsonResult.stdout);
  const secret = payload.candidates.find(
    (candidate: { kind: string; locator: { range?: string } }) =>
      candidate.kind === 'note'
      && candidate.locator.range === 'D4',
  );
  assert.ok(secret);
  assert.equal(
    secret.claims.find(
      (claim: { aspect: string }) => claim.aspect === 'text',
    ).value,
    'SECRET-NOTE-BODY',
  );
  assert.equal(readSourceFileIdentity(source).digest, before);
});
