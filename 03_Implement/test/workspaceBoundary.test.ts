import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isWorkspaceFileCandidate } from '../src/dx/workspaceBoundary.js';

test('workspace file candidates use path segments, not string prefixes', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workspace-boundary-'));
  const workspace = path.join(base, 'app');
  const sibling = path.join(base, 'app-old');
  fs.mkdirSync(workspace);
  fs.mkdirSync(sibling);

  const inside = path.join(workspace, 'design.xlsx');
  const outside = path.join(sibling, 'other.xlsx');
  fs.writeFileSync(inside, 'inside');
  fs.writeFileSync(outside, 'outside');

  assert.equal(outside.startsWith(workspace), true, 'fixture must reproduce the prefix trap');
  assert.equal(isWorkspaceFileCandidate(inside, workspace), true);
  assert.equal(isWorkspaceFileCandidate(outside, workspace), false);
});

test('workspace file candidates reject parent-directory escapes lexically', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workspace-boundary-'));
  const workspace = path.join(base, 'workspace');
  fs.mkdirSync(workspace);
  const outside = path.join(base, 'outside.xlsx');

  assert.equal(
    isWorkspaceFileCandidate(
      path.join(workspace, '..', 'outside.xlsx'),
      workspace,
    ),
    false,
  );
});

test('workspace file candidates reject symlinks that resolve outside the workspace', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-workspace-boundary-'));
  const workspace = path.join(base, 'workspace');
  const outsideDirectory = path.join(base, 'outside');
  fs.mkdirSync(workspace);
  fs.mkdirSync(outsideDirectory);

  const outside = path.join(outsideDirectory, 'secret.xlsx');
  const link = path.join(workspace, 'linked.xlsx');
  fs.writeFileSync(outside, 'outside');

  try {
    fs.symlinkSync(outside, link, 'file');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      t.skip('symlink creation is not permitted in this environment');
      return;
    }
    throw error;
  }

  assert.equal(isWorkspaceFileCandidate(link, workspace), false);
});
