import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDetachedDocument } from '../src/application/detachCheck.js';
import { linkTargets } from '../src/core/markdownLinks.js';

/** Problems as `line:code-suffix` for a document whose folder is the workspace. */
function scan(lines: string[], setup?: (dir: string) => void): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-links-'));
  setup?.(dir);
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, lines.join('\n'));
  return checkDetachedDocument({ markdownFilePath: file, workspaceRoot: dir }).problems
    .map((problem) => `${problem.line}:${problem.code.replace('MMI_DETACH_', '')}`);
}

test('linkTargets reads inline, reference, autolink and HTML destinations, but not code', () => {
  assert.deepEqual(linkTargets('[a](x.md) ![b](<y z.png>) [c](p(1).csv "t") [d](q.md \'t\')'), ['x.md', 'y z.png', 'p(1).csv', 'q.md']);
  assert.deepEqual(linkTargets('[r]: <a b.md>'), ['a b.md']);
  assert.deepEqual(
    linkTargets('<a href="h.md">x</a> <img src=\'i.png\' srcset="s1.png 1x, s2.png 2x"> <file:///f.xlsx>').sort(),
    ['file:///f.xlsx', 'h.md', 'i.png', 's1.png', 's2.png'],
  );
  assert.deepEqual(linkTargets('`[a](code.md)` and [b](real.md)'), ['real.md']);
});

test('reference-style links and HTML attributes are checked', () => {
  assert.deepEqual(scan(['[a][r]', '', '[r]: missing.xlsx']), ['3:BROKEN_LINK']);
  assert.deepEqual(scan(['<img src="missing.png"> <a href=\'gone.md\'>x</a>']), ['1:BROKEN_LINK', '1:BROKEN_LINK']);
  assert.deepEqual(scan(['[a](<no such.csv>) [b](missing.csv "t") [c](missing.csv \'t\')']), Array(3).fill('1:BROKEN_LINK'));
});

test('file:, drive-letter, UNC and root-absolute destinations are dependencies outside the folder', () => {
  assert.deepEqual(
    scan(['[a](file:///c/x.xlsx) [b](C:/Users/x/a.xlsx) [c](//server/share/a.xlsx) <file:///a.xlsx> [d](/etc/x.md)']),
    Array(5).fill('1:LINK_OUTSIDE_ROOT'),
  );
  assert.deepEqual(scan(['[w](https://example.com/a.png) [m](mailto:a@b.c) [t](#top) <https://example.com>']), []);
});

test('parentheses in a path and a file name starting with two dots are not false alarms', () => {
  const setup = (dir: string) => { fs.writeFileSync(path.join(dir, 'p(1).csv'), 'a\n'); fs.writeFileSync(path.join(dir, '..dots.csv'), 'a\n'); };
  assert.deepEqual(scan(['[a](p(1).csv) [b](p%281%29.csv) [c](..dots.csv)'], setup), []);
});

test('a symlink that leads out of the folder counts as outside', { skip: process.platform === 'win32' }, () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-detach-out-'));
  fs.writeFileSync(path.join(outside, 'secret.xlsx'), 'x');
  assert.deepEqual(scan(['[a](lnk/secret.xlsx)'], (dir) => fs.symlinkSync(outside, path.join(dir, 'lnk'))), ['1:LINK_OUTSIDE_ROOT']);
});

test('fences are matched by character and length; code spans are ignored', () => {
  assert.deepEqual(scan(['````', '```', '[a](missing.csv)', '````', '[b](missing.csv)']), ['5:BROKEN_LINK']);
  assert.deepEqual(scan(['~~~', '```', '[a](missing.csv)', '~~~']), []);
  assert.deepEqual(scan(['``[a](missing.csv)`` and `![[x.csv]]`']), []);
});

test('a legacy attachment card is recognised with a full-width colon and in nested quotes', () => {
  assert.deepEqual(scan(['> 別紙：a.xlsx (S!A1)', '> > 別紙: a.xlsx']), ['1:LEGACY_CARD', '2:LEGACY_CARD']);
});
