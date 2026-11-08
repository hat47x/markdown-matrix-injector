/**
 * `--source-date`: the same document gives the same PDF and Word bytes, so a hash taken at delivery can be checked again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readZip } from '../src/core/zipReader.js';
import { writeZip } from '../src/core/zipWriter.js';
import { buildDocx, type PandocRunner } from '../src/cli/docx.js';
import { main } from '../src/cli/mmi.js';
import { buildPdf, type PdfRunner } from '../src/cli/pdf.js';
import { parseSourceDate, SourceDateError } from '../src/cli/sourceDate.js';

test('a source date is epoch seconds, a date (midnight UTC) or an ISO date-time with a zone', () => {
  assert.equal(parseSourceDate('1700000000'), 1700000000);
  assert.equal(parseSourceDate('2026-10-21'), Date.UTC(2026, 9, 21) / 1000);
  assert.equal(parseSourceDate('2026-10-21T09:00:00+09:00'), Date.UTC(2026, 9, 21, 0, 0, 0) / 1000);
  assert.equal(parseSourceDate('2026-10-21T00:00:00Z'), Date.UTC(2026, 9, 21) / 1000);
  assert.equal(parseSourceDate(' 0 '), 0);
});

test('anything else is refused, including a date-time without a zone, which would depend on the machine', () => {
  for (const bad of ['', 'yesterday', '2026-13-40', '2026-10-21T09:00:00', '20261021', '-5', '1e9']) {
    assert.throws(() => parseSourceDate(bad), SourceDateError, bad);
  }
});

function workspace(): { root: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-date-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, '---\ntitle: 設計書\n---\n## 概要\n\n本文\n');
  return { root, doc };
}

test('buildPdf hands the epoch to WeasyPrint as SOURCE_DATE_EPOCH, and only when one was given', () => {
  const { root, doc } = workspace();
  const seen: Array<Record<string, string> | undefined> = [];
  const runner: PdfRunner = (_command, args, _html, env) => {
    seen.push(env);
    fs.writeFileSync(args[1], '%PDF');
    return { status: 0, stderr: '' };
  };
  buildPdf({ markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'a.pdf'), variant: 'none', sourceDateEpoch: 1700000000 }, runner);
  buildPdf({ markdownFilePath: doc, workspaceRoot: root, output: path.join(root, 'b.pdf'), variant: 'none' }, runner);
  assert.deepEqual(seen, [{ SOURCE_DATE_EPOCH: '1700000000' }, undefined]);
});

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const part = (name: string, text: string) => ({ name, data: Buffer.from(text, 'utf8') });

const fakePandoc: PandocRunner = (_command, args) => {
  if (args[0] === '--print-default-data-file') {
    return {
      status: 0, stderr: '', stdout: writeZip([
        part('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
        part('word/document.xml', `<w:document ${W}><w:body><w:sectPr /></w:body></w:document>`),
        part('word/styles.xml', '<w:styles xmlns:w="x"/>'),
        part('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
      ]),
    };
  }
  fs.writeFileSync(args[args.indexOf('-o') + 1], writeZip([
    part('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    part('word/document.xml', `<w:document ${W}><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838" /></w:sectPr></w:body></w:document>`),
    part('docProps/core.xml', '<cp:coreProperties/>'),
  ]));
  return { status: 0, stdout: Buffer.alloc(0), stderr: '' };
};

test('two Word builds with the same document time are byte-identical, and a different time changes only the properties', () => {
  const { root, doc } = workspace();
  const build = (name: string, now: Date): Buffer => {
    const output = path.join(root, name);
    buildDocx({ markdownFilePath: doc, workspaceRoot: root, output, now }, fakePandoc);
    return fs.readFileSync(output);
  };
  const first = build('a.docx', new Date('2026-11-05T00:00:00Z'));
  const second = build('b.docx', new Date('2026-11-05T00:00:00Z'));
  const later = build('c.docx', new Date('2026-11-06T00:00:00Z'));
  assert.ok(first.equals(second));
  assert.ok(!first.equals(later));
  const names = (zip: Buffer) => [...readZip(zip).values()].map((entry) => entry.name);
  assert.deepEqual(names(first), names(later));
  const read = (zip: Buffer, name: string) => readZip(zip).get(name)?.read().toString('utf8');
  assert.equal(read(first, 'word/document.xml'), read(later, 'word/document.xml'));
  assert.match(read(later, 'docProps/core.xml') as string, /2026-11-06T00:00:00Z/);
});

test('mmi pdf and mmi docx refuse a source date they cannot read before doing any work', async () => {
  const { root, doc } = workspace();
  const err = console.error;
  const messages: string[] = [];
  console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
  try {
    assert.equal(await main(['pdf', doc, '-o', path.join(root, 'a.pdf'), '--source-date', 'yesterday', '--root', root]), 2);
    assert.equal(await main(['docx', doc, '-o', path.join(root, 'a.docx'), '--source-date', '2026-10-21T09:00:00', '--root', root]), 2);
  } finally {
    console.error = err;
  }
  assert.equal(messages.filter((message) => /--source-date must be/.test(message)).length, 2);
  assert.ok(!fs.existsSync(path.join(root, 'a.pdf')) && !fs.existsSync(path.join(root, 'a.docx')));
});
