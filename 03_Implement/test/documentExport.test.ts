/**
 * Delivery-grade HTML export (`mmi render --to html`): what a Japanese SIer
 * deliverable PDF needs from the HTML — document properties from front matter,
 * cover with approval stamps, table of contents with page numbers, running
 * header/footer, PDF metadata, and no local absolute paths.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFrontMatter } from '../src/cli/documentExport.js';
import { RenderError, renderDocumentHtml, renderDocumentMarkdown } from '../src/cli/render.js';

function documentFixture(markdown: string): { root: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-export-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'roles.csv'), 'ID,操作\nOP-01,申請\nOP-02,承認\n');
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, markdown);
  return { root, doc };
}

const render = (markdown: string) => {
  const { root, doc } = documentFixture(markdown);
  return { html: renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root }), root };
};

test('front matter values stay as written: versions are not numbers and dates are not reformatted', () => {
  const { properties, body } = readFrontMatter('---\nversion: 1.10\ndate: 2026-10-21\napprovals: [承認, 審査, 作成]\ncover: true\n---\n# 本文\n');
  assert.equal(properties.version, '1.10');
  assert.equal(properties.date, '2026-10-21');
  assert.deepEqual(properties.approvals, ['承認', '審査', '作成']);
  assert.equal(properties.cover, true);
  assert.equal(properties.toc, false);
  assert.equal(properties.paper, 'A4');
  assert.equal(body.split('\n').indexOf('# 本文'), 6, 'body keeps its line numbers');
});

test('a document without front matter is unchanged, and other tools\' keys are not errors', () => {
  assert.equal(readFrontMatter('# t\n\n---\n\ntext\n').body, '# t\n\n---\n\ntext\n');
  assert.equal(readFrontMatter('---\nlayout: post\ntags: [a]\n---\nx').properties.title, undefined);
});

test('invalid front matter values are reported instead of silently printed', () => {
  assert.throws(() => readFrontMatter('---\npaper: B5\n---\n'), /A4 or A3/);
  assert.throws(() => readFrontMatter('---\ncover: yes\n---\n'), /true or false/);
  assert.throws(() => readFrontMatter('---\ntitle: [a, b]\n---\n'), /single line/);
  const { root, doc } = documentFixture('---\ntoc: maybe\n---\n# t\n');
  assert.throws(() => renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root }), RenderError);
});

test('front matter never leaks into the body as a rule and a heading', () => {
  const { html } = render('---\ntitle: 基本設計書\n---\n# 基本設計書\n\n本文\n');
  assert.doesNotMatch(html, /<hr>/);
  assert.doesNotMatch(html, /title: 基本設計書/);
  assert.match(html, /<title>基本設計書<\/title>/);
});

test('the PDF title falls back to the first h1 instead of a fixed product string', () => {
  const { html } = render('# 申請システム 詳細設計書\n\n本文\n');
  assert.match(html, /<title>申請システム 詳細設計書<\/title>/);
  assert.match(html, /@top-left \{ content: "申請システム 詳細設計書";/);
});

test('cover, approvals, metadata and running header/footer come from front matter', () => {
  const { html } = render([
    '---',
    'title: 基本設計書',
    'subtitle: 更改プロジェクト',
    'documentNumber: SD-0001',
    'version: 第1.2版',
    'date: 2026-10-21',
    'customer: 架空商事株式会社 御中',
    'organization: 架空システムズ株式会社',
    'classification: 社外秘',
    'approvals: [承認, 審査, 作成]',
    'cover: true',
    'paper: A3',
    '---',
    '## 1. 概要',
  ].join('\n'));
  assert.match(html, /<section class="mmi-cover">/);
  assert.match(html, /<div class="mmi-cover__classification">社外秘<\/div>/);
  assert.match(html, /<table class="mmi-cover__approvals"><tr><th>承認<\/th><th>審査<\/th><th>作成<\/th><\/tr><tr><td><\/td><td><\/td><td><\/td><\/tr><\/table>/);
  assert.match(html, /<meta name="author" content="架空システムズ株式会社">/);
  assert.match(html, /<meta name="description" content="更改プロジェクト">/);
  assert.match(html, /<meta name="keywords" content="SD-0001, 社外秘">/);
  assert.match(html, /<meta name="dcterms.created" content="2026-10-21">/);
  assert.match(html, /@top-right \{ content: "社外秘";/);
  assert.match(html, /@bottom-left \{ content: "SD-0001　第1.2版";/);
  assert.match(html, /@bottom-center \{ content: counter\(page\) " \/ " counter\(pages\); \}/);
  assert.match(html, /@page \{ size: A3;/);
  assert.match(html, /@page landscape \{ size: A3 landscape; \}/);
});

test('toc lists h2/h3 with page-number targets and keeps author-written ids', () => {
  const { html } = render('---\ntoc: true\n---\n# 題\n\n## 1. 概要\n\n### 1.1 目的\n\n## 2. 機能\n\n#### 対象外\n');
  assert.match(html, /<nav class="mmi-toc">/);
  assert.match(html, /<li class="mmi-toc__item mmi-toc__item--h2"><a href="#mmi-section-1">1\. 概要<\/a><\/li>/);
  assert.match(html, /<li class="mmi-toc__item mmi-toc__item--h3"><a href="#mmi-section-2">1\.1 目的<\/a><\/li>/);
  assert.match(html, /<h2 id="mmi-section-1">1\. 概要<\/h2>/);
  assert.doesNotMatch(html, /対象外<\/a>/, 'h4 stays out of the table of contents');
  assert.match(html, /target-counter\(attr\(href url\), page\)/);
});

test('front matter text cannot close the style element or break out of CSS strings', () => {
  const { html } = render('---\ntitle: \'a"b</style><script>x</script>\'\n---\n本文\n');
  assert.doesNotMatch(html, /<\/style><script>/);
  assert.match(html, /content: "a\\"b\\3C \/style>\\3C script>x\\3C \/script>";/);
  assert.match(html, /<title>a&quot;b&lt;\/style&gt;&lt;script&gt;x&lt;\/script&gt;<\/title>/);
});

test('exported 別紙 cards carry only the author-written path, never the local absolute path', () => {
  const { html, root } = render('![[./data/roles.csv#Sheet1|A1:B3?mode=card&caption=別紙1]]\n');
  assert.match(html, /<div class="mmi-card" data-source="\.\/data\/roles\.csv">/);
  assert.ok(!html.includes(root), 'absolute workspace path must not appear in the exported HTML');
  assert.doesNotMatch(html, /class="mmi-card__open"|hat47x\.markdown-matrix-injector\/open/);
});

test('a heading directly before a page-breaking or rotated table moves to that page with it', () => {
  const { html } = render('## 2. 状態遷移\n\n![[./data/roles.csv#Sheet1|A1:B3?header=first&pageBreak=before&orientation=landscape]]\n\n## 3. 次\n\n本文\n\n![[./data/roles.csv#Sheet1|A1:B3?pageBreak=before]]\n');
  assert.match(html, /<h2 data-mmi-break="before" data-mmi-orientation="landscape">2\. 状態遷移<\/h2>/);
  assert.match(html, /<h2>3\. 次<\/h2>/, 'a heading separated by text keeps its place');
  assert.match(html, /\[data-mmi-break\] \+ \.mmi-embed\[data-page-break="before"\] \{ break-before: auto;/);
});

test('render --to md passes front matter through for Pandoc and other tools', () => {
  const { root, doc } = documentFixture('---\ntitle: 題\n---\n![[./data/roles.csv#Sheet1|A1:B3?header=first]]\n');
  const out = renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot: root });
  assert.ok(out.startsWith('---\ntitle: 題\n---\n'));
  assert.match(out, /\| OP-01 \| 申請 \|/);
});
