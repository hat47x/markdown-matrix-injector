/**
 * Automatic table numbers and cross references in delivery HTML (#639):
 * `captionNumbers: true` numbers captioned tables, `[](#id)` takes the current
 * number, and every link to an embed gets a page number in generators that
 * support CSS Paged Media. Without the key the output must not change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { numberCaptions } from '../src/cli/captionNumbers.js';
import { readFrontMatter } from '../src/cli/documentExport.js';
import { renderDocumentHtml } from '../src/cli/render.js';

function render(markdown: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-captions-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'roles.csv'), 'ID,操作\nOP-01,申請\nOP-02,承認\n');
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, markdown);
  return renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
}

const ref = (caption: string, id?: string) =>
  `![[./data/roles.csv#Sheet1|A1:B3?header=first&caption=${caption}${id ? `&id=${id}` : ''}]]`;

const body = (html: string) => html.slice(html.indexOf('<main'));

test('numbering is off by default and the front matter key must be true or false', () => {
  assert.equal(readFrontMatter('# t\n').properties.captionNumbers, false);
  assert.equal(readFrontMatter('---\ncaptionNumbers: true\n---\n').properties.captionNumbers, true);
  assert.throws(() => readFrontMatter('---\ncaptionNumbers: yes\n---\n'), /true or false/);
});

test('without the key the output is exactly what it was, including links and hand-written numbers', () => {
  const markdown = `# 設計書\n\n${ref('表1　要件', 'req')}\n\n[表1](#req) と [](#req) を見る。\n`;
  const plain = render(markdown);
  assert.equal(plain.includes('mmi-embed__number'), false);
  assert.equal(plain.includes('mmi-xref'), false);
  assert.equal(plain.includes('target-counter(attr(href url), page) "）"'), false);
  assert.match(body(plain), /<figcaption class="mmi-embed__caption">表1　要件<\/figcaption>/);
  assert.match(body(plain), /<a href="#req">表1<\/a>/);
});

test('captioned tables are numbered in document order, so adding one renumbers the rest', () => {
  const two = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('要件')}\n\n${ref('権限')}\n`));
  assert.match(two, /<span class="mmi-embed__number">表1<\/span>　要件/);
  assert.match(two, /<span class="mmi-embed__number">表2<\/span>　権限/);
  const three = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('追加')}\n\n${ref('要件')}\n\n${ref('権限')}\n`));
  assert.match(three, /表1<\/span>　追加/);
  assert.match(three, /表3<\/span>　権限/);
});

test('a table without a caption takes no number and does not use one up', () => {
  const html = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n![[./data/roles.csv#Sheet1|A1:B3?header=first]]\n\n${ref('権限')}\n`));
  assert.match(html, /表1<\/span>　権限/);
  assert.equal((html.match(/mmi-embed__number/g) ?? []).length, 1);
});

test('a caption that already starts with its own number is the author\'s and is left alone', () => {
  const html = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('表7　手書き')}\n\n${ref('図3　手書き')}\n\n${ref('通し')}\n`));
  assert.match(html, /<figcaption class="mmi-embed__caption">表7　手書き<\/figcaption>/);
  assert.match(html, /<figcaption class="mmi-embed__caption">図3　手書き<\/figcaption>/);
  assert.match(html, /表1<\/span>　通し/, 'the first automatic number is still 表1');
});

test('[](#id) takes the current number, a link with text keeps it, and both get the page number', () => {
  const html = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('要件', 'req')}\n\n${ref('権限', 'perm')}\n\n[](#perm) と [権限の表](#req) と [外部](#nowhere)。\n`));
  assert.match(html, /<a class="mmi-xref" href="#perm">表2<\/a>/);
  assert.match(html, /<a class="mmi-xref" href="#req">権限の表<\/a>/);
  assert.match(html, /<a href="#nowhere">外部<\/a>/, 'a link to something that is not an embed is untouched');
});

test('a link that has no text and no number to show is left as the author wrote it', () => {
  const html = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('表1　手書き', 'hand')}\n\n[](#hand)\n`));
  assert.match(html, /<a href="#hand"><\/a>/);
});

test('the page number comes from target-counter and is only added when numbering is on', () => {
  const on = render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('要件', 'req')}\n\n[](#req)\n`);
  assert.match(on, /\.mmi-xref::after \{ content: "（p\." target-counter\(attr\(href url\), page\) "）"; \}/);
  const off = render(`# t\n\n${ref('要件', 'req')}\n\n[](#req)\n`);
  assert.doesNotMatch(off, /\.mmi-xref::after/);
});

test('ids with Japanese or special characters still match their links', () => {
  const html = body(render(`---\ncaptionNumbers: true\n---\n# t\n\n${ref('権限', '権限表')}\n\n[](#権限表)\n`));
  assert.match(html, /<a class="mmi-xref" href="#[^"]*">表1<\/a>/);
});

test('numberCaptions reports the label of each numbered figure by id', () => {
  const result = numberCaptions(
    '<figure class="mmi-embed" id="a"><figcaption class="mmi-embed__caption">甲</figcaption><table class="mmi-table"></table></figure>'
    + '<figure class="mmi-embed" id="b"><figcaption class="mmi-embed__caption">別紙1　乙</figcaption><div class="mmi-card"></div></figure>',
  );
  assert.deepEqual([...result.labels], [['a', '表1']]);
  assert.match(result.html, /<span class="mmi-embed__number">表1<\/span>　甲/);
  assert.doesNotMatch(result.html, /別紙1　乙.*mmi-embed__number/);
});
