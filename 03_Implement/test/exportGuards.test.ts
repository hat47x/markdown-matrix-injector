/**
 * A defect the stress document found in the delivery export: level 5 and 6 headings came out smaller than the body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderDocumentHtml } from '../src/cli/render.js';

test('images print without interpolation, which PDF/A requires, and still scale smoothly on screen', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-guard-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, '本文\n');
  const html = renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
  assert.match(html, /@media print \{ img \{ image-rendering: crisp-edges; \} \}/);
});

test('level 4 to 6 headings are not smaller than the body text', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-guard-'));
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, '#### 四\n\n##### 五\n\n###### 六\n');
  const html = renderDocumentHtml({ markdownFilePath: doc, workspaceRoot: root });
  assert.match(html, /h4 \{ font-size: 11pt; \} h5 \{ font-size: 10\.5pt; \} h6 \{ font-size: 10pt; \}/);
});
