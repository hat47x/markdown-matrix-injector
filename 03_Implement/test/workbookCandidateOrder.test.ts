import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { prioritizeWorkbookFiles } from '../src/dx/workbookCandidateOrder.js';

const candidate = (fsPath: string) => ({ fsPath, marker: fsPath });

test('prioritizeWorkbookFiles prefers workbooks nearest to the Markdown document', () => {
  const root = path.resolve('/workspace');
  const markdown = path.join(root, 'docs', 'release', 'spec.md');
  const ordered = prioritizeWorkbookFiles(markdown, [
    candidate(path.join(root, 'archive', 'old.xlsx')),
    candidate(path.join(root, 'docs', 'shared', 'master.xlsx')),
    candidate(path.join(root, 'docs', 'release', 'source.xlsx')),
    candidate(path.join(root, 'docs', 'release', 'data', 'detail.xlsx')),
  ]);

  assert.deepEqual(
    ordered.map((item) => path.relative(root, item.fsPath)),
    [
      path.join('docs', 'release', 'source.xlsx'),
      path.join('docs', 'release', 'data', 'detail.xlsx'),
      path.join('docs', 'shared', 'master.xlsx'),
      path.join('archive', 'old.xlsx'),
    ],
  );
});

test('prioritizeWorkbookFiles is deterministic when candidates have equal locality', () => {
  const root = path.resolve('/workspace');
  const markdown = path.join(root, 'docs', 'spec.md');
  const ordered = prioritizeWorkbookFiles(markdown, [
    candidate(path.join(root, 'docs', 'z.xlsx')),
    candidate(path.join(root, 'docs', 'A.xlsx')),
    candidate(path.join(root, 'docs', 'm.xlsx')),
  ]);

  assert.deepEqual(ordered.map((item) => path.basename(item.fsPath)), ['A.xlsx', 'm.xlsx', 'z.xlsx']);
});

test('locality ordering makes a nearby workbook survive a bounded prefix regardless of enumeration order', () => {
  const root = path.resolve('/workspace');
  const markdown = path.join(root, 'docs', 'current', 'spec.md');
  const far = Array.from({ length: 500 }, (_, index) =>
    candidate(path.join(root, 'archive', String(index).padStart(3, '0') + '.xlsx')),
  );
  const nearby = candidate(path.join(root, 'docs', 'current', 'copied-from.xlsx'));

  const bounded = prioritizeWorkbookFiles(markdown, [...far, nearby]).slice(0, 500);

  assert.ok(bounded.some((item) => item.fsPath === nearby.fsPath));
  assert.ok(!bounded.some((item) => item.fsPath === far[far.length - 1].fsPath));
});
