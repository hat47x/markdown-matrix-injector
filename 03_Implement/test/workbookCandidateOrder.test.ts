import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { prioritizeWorkbookFiles, selectContainedWorkbookFiles, selectContainedWorkbookFilesDetailed } from '../src/dx/workbookCandidateOrder.js';

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


test('selectContainedWorkbookFiles rejects a sibling workspace whose path only shares a string prefix', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workbook-boundary-'));
  const root = path.join(temp, 'work');
  const sibling = path.join(temp, 'work-old');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });

  const inside = path.join(root, 'source.xlsx');
  const outside = path.join(sibling, 'source.xlsx');
  fs.writeFileSync(inside, '');
  fs.writeFileSync(outside, '');

  const selected = selectContainedWorkbookFiles(
    path.join(root, 'docs', 'spec.md'),
    root,
    [candidate(outside), candidate(inside)],
    10,
  );

  assert.deepEqual(selected.map((item) => item.fsPath), [inside]);
});

test('selectContainedWorkbookFiles rejects a symlink that resolves outside the workspace boundary', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workbook-symlink-'));
  const root = path.join(temp, 'work');
  const outsideDir = path.join(temp, 'outside');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  const inside = path.join(root, 'inside.xlsx');
  const outside = path.join(outsideDir, 'outside.xlsx');
  const link = path.join(root, 'linked.xlsx');
  fs.writeFileSync(inside, '');
  fs.writeFileSync(outside, '');

  try {
    fs.symlinkSync(outside, link, 'file');
  } catch {
    t.skip('symlink creation is unavailable in this test environment');
    return;
  }

  const selected = selectContainedWorkbookFiles(
    path.join(root, 'spec.md'),
    root,
    [candidate(link), candidate(inside)],
    10,
  );

  assert.deepEqual(selected.map((item) => item.fsPath), [inside]);
});

test('selectContainedWorkbookFilesDetailed applies the file limit after containment and reports truncation', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workbook-limit-'));
  const root = path.join(temp, 'work');
  const sibling = path.join(temp, 'work-old');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });

  const insideA = path.join(root, 'a.xlsx');
  const insideB = path.join(root, 'b.xlsx');
  const outside = path.join(sibling, 'closer-looking.xlsx');
  fs.writeFileSync(insideA, '');
  fs.writeFileSync(insideB, '');
  fs.writeFileSync(outside, '');

  const result = selectContainedWorkbookFilesDetailed(
    path.join(root, 'spec.md'),
    root,
    [candidate(outside), candidate(insideB), candidate(insideA)],
    1,
  );

  assert.deepEqual(result.files.map((item) => item.fsPath), [insideA]);
  assert.equal(result.truncated, true);
  assert.equal(result.limit, 1);
});

test('selectContainedWorkbookFilesDetailed does not call an exactly-full file set truncated', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workbook-exact-limit-'));
  const root = path.join(temp, 'work');
  const sibling = path.join(temp, 'work-old');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });

  const inside = path.join(root, 'inside.xlsx');
  const outside = path.join(sibling, 'outside.xlsx');
  fs.writeFileSync(inside, '');
  fs.writeFileSync(outside, '');

  const result = selectContainedWorkbookFilesDetailed(
    path.join(root, 'spec.md'),
    root,
    [candidate(outside), candidate(inside)],
    1,
  );

  assert.deepEqual(result.files.map((item) => item.fsPath), [inside]);
  assert.equal(result.truncated, false);
  assert.equal(result.limit, 1);
});
