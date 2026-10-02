import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detachCheck } from '../src/cli/detach.js';
import { renderDocumentMarkdown, renderDocumentMarkdownDetailed } from '../src/cli/render.js';

function workspace(): { root: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-'));
  fs.mkdirSync(path.join(root, 'data'));
  const header = Array.from({ length: 12 }, (_, i) => `列${i + 1}`).join(',');
  const rows = Array.from({ length: 5 }, (_, r) => Array.from({ length: 12 }, (_, c) => `r${r}c${c}${c === 0 ? '"q"' : ''}`).join(','));
  fs.writeFileSync(path.join(root, 'data', 'wide.csv'), [header, ...rows].join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'data', 'small.csv'), 'ID,名前\nA-1,甲\nA-2,乙\n');
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, [
    '# 仕様', '',
    '![[./data/small.csv#Sheet1|A1:B3?header=first]]', '',
    '![[./data/wide.csv#Sheet1|A1:L6?header=first&id=wide&caption=広い表]]', '',
  ].join('\n'));
  return { root, doc };
}

function materialize(root: string, doc: string): string {
  const out = path.join(root, 'out');
  fs.mkdirSync(out);
  const { markdown } = renderDocumentMarkdownDetailed({
    markdownFilePath: doc, workspaceRoot: root, materialize: { dir: path.join(out, 'attachments'), linkBase: out },
  });
  fs.writeFileSync(path.join(out, 'spec.md'), markdown);
  return out;
}

test('default render leaves the card as a bare line, which detach-check reports', () => {
  const { root, doc } = workspace();
  const out = path.join(root, 'plain');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'spec.md'), renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot: root }));
  assert.deepEqual(detachCheck(out, [path.join(out, 'spec.md')]).map((f) => f.code), ['DETACH_UNMATERIALIZED_ATTACHMENT']);
});

test('materialize writes a CSV with the logical table and provenance, and links it', () => {
  const { root, doc } = workspace();
  const out = materialize(root, doc);
  const text = fs.readFileSync(path.join(out, 'spec.md'), 'utf8');
  const link = /\[(wide-[0-9a-f]{12}\.csv)\]\((attachments\/[^)]+)\)（出典: \.\/data\/wide\.csv Sheet1!A1:L6）/.exec(text);
  assert.ok(link, text);
  const csv = fs.readFileSync(path.join(out, link[2]), 'utf8');
  assert.match(csv, /^列1,列2,/);
  assert.match(csv, /"r0c0""q"""/);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'attachments', 'materialized.json'), 'utf8'));
  assert.equal(manifest.schema, 'mmi.materialized/v1');
  assert.equal(manifest.entries[0].source, './data/wide.csv');
  assert.equal(manifest.entries[0].document, 'spec.md');
  assert.match(manifest.entries[0].sourceSha256, /^sha256:[0-9a-f]{64}$/);
});

test('the output folder alone is detachable: copy it without the sources and check', () => {
  const { root, doc } = workspace();
  const out = materialize(root, doc);
  const detached = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detached-'));
  fs.cpSync(out, detached, { recursive: true });
  assert.deepEqual(detachCheck(detached, [path.join(detached, 'spec.md')]), []);
});

test('materialize is repeatable and does not overwrite a different file', () => {
  const { root, doc } = workspace();
  const out = materialize(root, doc);
  const before = fs.readdirSync(path.join(out, 'attachments')).sort();
  renderDocumentMarkdownDetailed({ markdownFilePath: doc, workspaceRoot: root, materialize: { dir: path.join(out, 'attachments'), linkBase: out } });
  assert.deepEqual(fs.readdirSync(path.join(out, 'attachments')).sort(), before);
});

test('detach-check finds unexpanded references, broken links, links outside the folder and tampered tables', () => {
  const { root, doc } = workspace();
  const out = materialize(root, doc);
  const file = path.join(out, 'extra.md');
  fs.writeFileSync(file, [
    '![[./data/small.csv]]',
    '`![[./in/code.csv]]` is only code',
    '![ok](attachments/materialized.json)',
    '[gone](missing.png)',
    '[source](../data/small.csv)',
    '[web](https://example.com/a.png) [anchor](#top)',
    '```',
    '![[./in/fence.csv]]',
    '```',
  ].join('\n'));
  const codes = detachCheck(out, [file]).map((f) => `${f.line}:${f.code}`);
  assert.deepEqual(codes, ['1:DETACH_UNEXPANDED_REFERENCE', '4:DETACH_BROKEN_LINK', '5:DETACH_LINK_OUTSIDE_ROOT']);

  const csv = fs.readdirSync(path.join(out, 'attachments')).find((name) => name.endsWith('.csv'))!;
  fs.appendFileSync(path.join(out, 'attachments', csv), 'tampered\r\n');
  assert.ok(detachCheck(out, [path.join(out, 'spec.md')]).some((f) => f.code === 'DETACH_OUTPUT_CHANGED'));
  fs.rmSync(path.join(out, 'attachments', csv));
  assert.ok(detachCheck(out, [path.join(out, 'spec.md')]).some((f) => f.code === 'DETACH_OUTPUT_MISSING' || f.code === 'DETACH_BROKEN_LINK'));
});

test('a ledger entry whose imported asset is gone is reported', () => {
  const { root } = workspace();
  fs.writeFileSync(path.join(root, 'mmi-ledger.json'), JSON.stringify({
    schema: 'mmi.ledger/v1',
    entries: [{ kind: 'image', source: 'data/book.xlsx', place: 'A1:B2', fingerprint: { representation: 'r', digest: 'd' }, sourceDigest: 's', output: 'assets/gone.png', conversion: {}, reviewState: 'confirmed', basis: 'b', reviewedAt: 't' }],
  }));
  assert.deepEqual(detachCheck(root, []).map((f) => f.code), ['DETACH_OUTPUT_MISSING']);
});

function scan(lines: string[], setup?: (dir: string) => void): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-scan-'));
  setup?.(dir);
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, lines.join('\n'));
  return detachCheck(dir, [file]).map((f) => `${f.line}:${f.code}`);
}

test('reference-style links, HTML attributes, local absolute schemes and spaced destinations are checked', () => {
  assert.deepEqual(scan(['[a][r]', '', '[r]: missing.xlsx']), ['3:DETACH_BROKEN_LINK']);
  assert.deepEqual(scan(['<img src="missing.png"> <a href=\'gone.md\'>x</a>']), ['1:DETACH_BROKEN_LINK', '1:DETACH_BROKEN_LINK']);
  assert.deepEqual(scan(['[a](file:///c/x.xlsx) [b](C:/Users/x/a.xlsx) [c](//server/share/a.xlsx) <file:///a.xlsx>']), Array(4).fill('1:DETACH_LINK_OUTSIDE_ROOT'));
  assert.deepEqual(scan(['[a](<no such.csv>) [b](missing.csv "t") [c](missing.csv \'t\')']), Array(3).fill('1:DETACH_BROKEN_LINK'));
  assert.deepEqual(scan(['[w](https://example.com/a.png) [m](mailto:a@b.c) [t](#top) <https://example.com>']), []);
});

test('parentheses in a path and a file name starting with two dots are not false alarms', () => {
  const setup = (dir: string) => { fs.writeFileSync(path.join(dir, 'p(1).csv'), 'a\n'); fs.writeFileSync(path.join(dir, '..dots.csv'), 'a\n'); };
  assert.deepEqual(scan(['[a](p(1).csv) [b](p%281%29.csv) [c](..dots.csv)'], setup), []);
});

test('a symlink that leads out of the folder is outside the folder', { skip: process.platform === 'win32' }, () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-out-'));
  fs.writeFileSync(path.join(outside, 'secret.xlsx'), 'x');
  assert.deepEqual(scan(['[a](lnk/secret.xlsx)'], (dir) => fs.symlinkSync(outside, path.join(dir, 'lnk'))), ['1:DETACH_LINK_OUTSIDE_ROOT']);
});

test('fences are matched by character and length; links inside code are ignored', () => {
  assert.deepEqual(scan(['````', '```', '[a](missing.csv)', '````', '[b](missing.csv)']), ['5:DETACH_BROKEN_LINK']);
  assert.deepEqual(scan(['~~~', '```', '[a](missing.csv)', '~~~']), []);
  assert.deepEqual(scan(['``[a](missing.csv)`` and `x`']), []);
});

test('an attachment line is recognised with a full-width colon and in nested quotes', () => {
  assert.deepEqual(scan(['> 別紙：a.xlsx (S!A1)', '> > 別紙: a.xlsx', '> 別紙: a.xlsx ([x](d.md))']), Array.from({ length: 3 }, (_, i) => `${i + 1}:DETACH_UNMATERIALIZED_ATTACHMENT`));
});

test('records that point outside the folder or cannot be read are reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-rec-'));
  fs.mkdirSync(path.join(dir, 'att'));
  fs.writeFileSync(path.join(dir, 'att', 'materialized.json'), JSON.stringify({ schema: 'mmi.materialized/v1', entries: [{ output: '../../escape.csv', outputSha256: 'sha256:0' }] }));
  assert.deepEqual(detachCheck(dir, []).map((f) => f.code), ['DETACH_LINK_OUTSIDE_ROOT']);
  fs.writeFileSync(path.join(dir, 'att', 'materialized.json'), '{bad');
  assert.deepEqual(detachCheck(dir, []).map((f) => `${f.file}:${f.code}`), ['att/materialized.json:DETACH_RECORD_UNREADABLE']);
});

test('materialize handles a very large table and leaves no orphan file when the run fails', () => {
  const { root } = workspace();
  const rows = Array.from({ length: 200_000 }, (_, i) => `${i},x`).join('\n');
  fs.writeFileSync(path.join(root, 'data', 'big.csv'), `a,b\n${rows}\n`);
  const doc = path.join(root, 'big.md');
  fs.writeFileSync(doc, '![[./data/big.csv#Sheet1|A1:B200001?header=first]]\n');
  const dir = path.join(root, 'bigout', 'att');
  const { materialized } = renderDocumentMarkdownDetailed({ markdownFilePath: doc, workspaceRoot: root, materialize: { dir, linkBase: path.dirname(dir) } });
  assert.equal(materialized[0].rows, 200_000);

  const failing = path.join(root, 'fail.md');
  fs.writeFileSync(failing, '![[./data/wide.csv#Sheet1|A1:L6?header=first]]\n\n![[./data/nope.csv]]\n');
  const failDir = path.join(root, 'failout');
  assert.throws(() => renderDocumentMarkdownDetailed({ markdownFilePath: failing, workspaceRoot: root, materialize: { dir: failDir, linkBase: root } }));
  assert.deepEqual(fs.existsSync(failDir) ? fs.readdirSync(failDir) : [], []);
});
