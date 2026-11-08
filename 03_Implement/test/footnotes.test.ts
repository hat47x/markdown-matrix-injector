/**
 * Footnotes in the HTML/PDF export: `text[^1]` with `[^1]: note` becomes a page-bottom note.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RenderError, renderDocumentHtml } from '../src/cli/render.js';
import { renderWordMarkdown } from '../src/cli/wordMarkdown.js';

function render(markdown: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-fn-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, markdown);
  return renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
}

test('a reference becomes a footnote span with the note, and the definition leaves no text behind', () => {
  const html = render('## 概要\n\n注記つきの本文[^1]です。\n\n[^1]: これは**注記**の本文である。\n');
  assert.match(html, /<p>注記つきの本文<span class="mmi-footnote">これは<strong>注記<\/strong>の本文である。<\/span>です。<\/p>/);
  assert.doesNotMatch(html, /\[\^1\]/);
  assert.equal(html.match(/<p>/g)?.length, 1, 'the definition is not printed as a paragraph');
});

test('the page-bottom CSS is included only when a document has footnotes', () => {
  assert.match(render('本文[^a]\n\n[^a]: 注\n'), /float: footnote;/);
  assert.match(render('本文[^a]\n\n[^a]: 注\n'), /@footnote \{/);
  assert.doesNotMatch(render('本文のみ\n'), /footnote/);
});

test('a note may continue on indented lines, and may sit before or after its reference', () => {
  const html = render('[^a]: 一行目\n  二行目\n\n本文[^a]\n');
  assert.match(html, /<span class="mmi-footnote">一行目 二行目<\/span>/);
});

test('notes keep their own labels, so numbering follows the order of the references', () => {
  const html = render('一[^b]と二[^a]\n\n[^a]: 注A\n\n[^b]: 注B\n');
  assert.ok(html.indexOf('注B') < html.indexOf('注A'));
});

test('a pattern in prose, an inline code span and a code block are not footnotes', () => {
  const html = render('入力は[^0-9]以外を拒否する。`[^1]`\n\n```text\n[^1]: コードの例\n```\n');
  assert.match(html, /\[\^0-9\]/);
  assert.doesNotMatch(html, /mmi-footnote/);
  assert.match(html, /\[\^1\]: コードの例/);
});

test('a note without a reference, a note referenced twice or a note defined twice stops the export', () => {
  const refused = (markdown: string, message: RegExp) => assert.throws(() => render(markdown), (error: unknown) => error instanceof RenderError && message.test(error.message));
  refused('本文\n\n[^1]: 使われない注記\n', /footnote \[\^1\] \(line 3\) has no reference/);
  refused('一[^1]と二[^1]\n\n[^1]: 注\n', /referenced more than once/);
  refused('一[^1]\n\n[^1]: 注\n\n[^1]: 別の注\n', /defined twice/);
});

test('Word keeps footnotes as Markdown for Pandoc to convert', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-fn-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, '本文[^1]\n\n[^1]: 注記\n');
  assert.match(renderWordMarkdown({ markdownFilePath: doc, workspaceRoot: root }).markdown, /\[\^1\]: 注記/);
});
