/**
 * Defects the stress document found in the delivery export: a footnote silently lost its text, and level 5 and 6
 * headings came out smaller than the body text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findFootnoteDefinitions, RenderError, renderDocumentHtml } from '../src/cli/render.js';
import { renderWordMarkdown } from '../src/cli/wordMarkdown.js';

function workspace(markdown: string): { root: string; doc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-guard-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, markdown);
  return { root, doc };
}

test('a footnote definition is found, wherever its note is', () => {
  assert.deepEqual(findFootnoteDefinitions('本文[^1]\n\n[^1]: 注記\n\n[^長い名前]: 別の注記\n'), [3, 5]);
});

test('the text of a sentence, an inline pattern or a code block is not mistaken for a footnote', () => {
  assert.deepEqual(findFootnoteDefinitions('入力は[^0-9]以外を拒否する。\n\n    [^1]: 字下げのコード\n\n```text\n[^1]: コードの例\n```\n\n~~~\n[^2]: 別の囲み\n~~~\n'), []);
  assert.deepEqual(findFootnoteDefinitions('[^1] is only a reference\n'), []);
});

test('the HTML/PDF export refuses a document whose footnote text would be lost, and says where', () => {
  const { root, doc } = workspace('## 概要\n\n注記あり[^1]。\n\n[^1]: 消えるはずの注記\n');
  assert.throws(
    () => renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root }),
    (error: unknown) => error instanceof RenderError && /Footnotes are not supported/.test(error.message) && /line 5/.test(error.message) && /mmi docx/.test(error.message),
  );
});

test('a pattern in prose does not stop the export, and Word keeps footnotes for Pandoc to convert', () => {
  const prose = workspace('入力は[^0-9]以外を拒否する。\n');
  assert.doesNotThrow(() => renderDocumentHtml({ markdownFilePath: prose.doc, workspaceRoot: prose.root }));
  const note = workspace('注記あり[^1]。\n\n[^1]: 注記\n');
  assert.match(renderWordMarkdown({ markdownFilePath: note.doc, workspaceRoot: note.root }).markdown, /\[\^1\]: 注記/);
});

test('level 4 to 6 headings are not smaller than the body text', () => {
  const { root, doc } = workspace('#### 四\n\n##### 五\n\n###### 六\n');
  const html = renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
  assert.match(html, /h4 \{ font-size: 11pt; \} h5 \{ font-size: 10\.5pt; \} h6 \{ font-size: 10pt; \}/);
});
