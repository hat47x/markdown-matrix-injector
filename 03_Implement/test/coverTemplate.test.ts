/**
 * A customer's own cover page for the HTML/PDF export (#635).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoverTemplateError, renderCoverTemplate } from '../src/cli/coverTemplate.js';
import { readFrontMatter } from '../src/cli/documentExport.js';
import { main } from '../src/cli/mmi.js';
import { RenderError, renderDocumentHtml } from '../src/cli/render.js';

const properties = (yaml: string) => readFrontMatter(`---\n${yaml}\n---\n`).properties;

test('placeholders are filled from the front matter, escaped, and approvals become the stamp boxes', () => {
  const html = renderCoverTemplate(
    '<h1>{{ title }}</h1><p>{{documentNumber}}｜{{version}}</p><p>{{customer}}</p><div>{{approvals}}</div><i>{{subtitle}}</i>',
    properties('documentNumber: SD-1\nversion: 第1.2版\ncustomer: A & B 御中\napprovals: [承認, 作成]'),
    '設計書 <草案>',
  );
  assert.equal(
    html,
    '<section class="mmi-cover-custom"><h1>設計書 &lt;草案&gt;</h1><p>SD-1｜第1.2版</p><p>A &amp; B 御中</p>'
    + '<div><table class="mmi-cover__approvals"><tr><th>承認</th><th>作成</th></tr><tr><td></td><td></td></tr></table></div><i></i></section>',
  );
});

test('a typo in a placeholder, or a stray brace, is an error instead of printed text', () => {
  assert.throws(() => renderCoverTemplate('<p>{{titel}}</p>', properties('title: x'), 'x'), (error: unknown) => error instanceof CoverTemplateError && /unknown placeholder \{\{titel\}\}/.test(error.message));
  assert.throws(() => renderCoverTemplate('<p>{{title}</p>', properties('title: x'), 'x'), /not a placeholder/);
  assert.throws(() => renderCoverTemplate('<p>{ {title}} }}</p>', properties('title: x'), 'x'), /not a placeholder/);
});

test('a cover template that could run code or reach the network is refused', () => {
  const refused = (template: string, message: RegExp) => assert.throws(() => renderCoverTemplate(template, properties('title: x'), 'x'), (error: unknown) => error instanceof CoverTemplateError && message.test(error.message));
  refused('<script>alert(1)</script>', /<script> is not allowed/);
  refused('<iframe src="a.html"></iframe>', /<iframe>/);
  refused('<img src="a.png" onerror="alert(1)">', /event attribute onerror/);
  refused('<a href="javascript:alert(1)">x</a>', /points outside/);
  refused('<img src="https://example.com/logo.png">', /points outside/);
  refused('<img src="//example.com/logo.png">', /points outside/);
  refused('<div style="background:url(https://example.com/a.png)"></div>', /external url/);
  refused('<style>@import "https://example.com/a.css";</style>', /external url/);
  refused('<style>.a{background:url(//example.com/a.png)}</style>', /external url/);
  refused('<link rel="stylesheet" href="a.css">', /<link>/);
  refused('<form action="x"></form>', /<form>/);
});

test('an embedded logo, a link inside the page and a relative image are allowed', () => {
  const html = renderCoverTemplate(
    '<img src="data:image/png;base64,AAAA"><a href="#top">x</a><img src="logo.png"><div style="border:1px solid #000"></div><style>.a{background:url(data:image/png;base64,AAAA)}</style>',
    properties('title: x'), 'x',
  );
  assert.match(html, /^<section class="mmi-cover-custom">/);
});

function workspace(files: Record<string, string>): { root: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cover-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return { root, doc: path.join(root, 'spec.md') };
}

const TEMPLATE = '<div class="frame"><p>{{documentNumber}}</p><h1>{{title}}</h1><p>{{organization}}</p>{{approvals}}</div>';
const DOC = (cover: string): string => `---\ntitle: 設計書\ndocumentNumber: SD-9\norganization: A社\napprovals: [承認]\n${cover}---\n## 概要\n\n本文\n`;

test('coverTemplate in the front matter replaces the built-in cover, and cover: true is not needed', () => {
  const { root, doc } = workspace({ 'spec.md': DOC('coverTemplate: ./templates/cover.html\n'), 'templates/cover.html': TEMPLATE });
  const html = renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
  const body = html.slice(html.indexOf('<body>'));
  assert.match(body, /^<body><section class="mmi-cover-custom"><div class="frame"><p>SD-9<\/p><h1>設計書<\/h1><p>A社<\/p><table class="mmi-cover__approvals">/);
  assert.doesNotMatch(body, /<section class="mmi-cover">/);
  assert.match(html, /\.mmi-cover-custom \{ page: mmi-cover; break-after: page; \}/);
});

test('--cover takes precedence over the front matter, so one company template serves every document', () => {
  const { root, doc } = workspace({
    'spec.md': DOC('coverTemplate: ./own.html\n'), 'own.html': '<p>own</p>', 'company.html': '<p>company {{title}}</p>',
  });
  const html = renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root, coverTemplate: './company.html' });
  assert.match(html, /<section class="mmi-cover-custom"><p>company 設計書<\/p><\/section>/);
  assert.doesNotMatch(html, /<p>own<\/p>/);
});

test('a missing, outside, oversized or unsafe template stops the export', () => {
  const { root, doc } = workspace({ 'spec.md': DOC(''), 'big.html': '<p>x</p>'.repeat(40000), 'unsafe.html': '<script>1</script>' });
  const render = (coverTemplate: string) => () => renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root, coverTemplate });
  assert.throws(render('./missing.html'), RenderError);
  assert.throws(render('../outside.html'), RenderError);
  assert.throws(render('./big.html'), /at most 256 KB/);
  assert.throws(render('./unsafe.html'), (error: unknown) => error instanceof RenderError && /<script> is not allowed/.test(error.message));
});

test('front matter coverTemplate must be a path', () => {
  assert.throws(() => readFrontMatter('---\ncoverTemplate: [a]\n---\n'), /path of an HTML file/);
  assert.throws(() => readFrontMatter('---\ncoverTemplate: " "\n---\n'), /path of an HTML file/);
});

test('without a template the built-in cover and its CSS are unchanged', () => {
  const { root, doc } = workspace({ 'spec.md': DOC('cover: true\n') });
  const html = renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
  assert.match(html, /<section class="mmi-cover">/);
  assert.doesNotMatch(html, /mmi-cover-custom/);
});

test('mmi render --cover works for html and is rejected for markdown output', async () => {
  const { root, doc } = workspace({ 'spec.md': DOC(''), 'c.html': '<p>表紙 {{title}}</p>' });
  const out = path.join(root, 'out.html');
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(await main(['render', doc, '--to', 'html', '--cover', './c.html', '--root', root, '-o', out]), 0);
    assert.equal(await main(['render', doc, '--cover', './c.html', '--root', root]), 2);
  } finally {
    console.error = err;
  }
  assert.match(fs.readFileSync(out, 'utf8'), /<section class="mmi-cover-custom"><p>表紙 設計書<\/p><\/section>/);
});
