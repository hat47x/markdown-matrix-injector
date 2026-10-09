import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { markdownReferencesWorkbook } from '../src/dx/previewRefresh.js';

test('preview refresh matches a document-relative workbook reference', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      '![[../data/design.xlsx#Sheet1|A1:B4]]',
      markdown,
      workbook,
      root,
    ),
    true,
  );
});

test('preview refresh also honors workspace-root-relative MMI references', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh-root');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      '![[data/design.xlsx#Sheet1|A1:B4]]',
      markdown,
      workbook,
      root,
    ),
    true,
  );
});

test('preview refresh ignores unrelated workbook saves and external references', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh-other');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      [
        '![[../data/other.xlsx#Sheet1|A1:B4]]',
        '![[https://example.test/design.xlsx#Sheet1|A1:B4]]',
      ].join('\n'),
      markdown,
      workbook,
      root,
    ),
    false,
  );
});

test('preview refresh decodes local URL-escaped workbook paths', () => {
  const root = path.resolve('/tmp/mmi-preview-refresh-space');
  const markdown = path.join(root, 'docs', 'spec.md');
  const workbook = path.join(root, 'data', 'screen design.xlsx');

  assert.equal(
    markdownReferencesWorkbook(
      '![[../data/screen%20design.xlsx#Sheet1|A1:B4]]',
      markdown,
      workbook,
      root,
    ),
    true,
  );
});
