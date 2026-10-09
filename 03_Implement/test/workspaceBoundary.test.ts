import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  isWorkspaceFileCandidate,
  resolveAuthoringSourcePath,
} from '../src/dx/workspaceBoundary.js';

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


test('guided authoring resolves an existing document-relative source first', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-authoring-source-'));
  const workspace = path.join(base, 'workspace');
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs, { recursive: true });

  const document = path.join(docs, 'spec.md');
  const documentRelative = path.join(docs, 'data.xlsx');
  const workspaceRelative = path.join(workspace, 'data.xlsx');
  fs.writeFileSync(document, '# spec\n');
  fs.writeFileSync(documentRelative, 'document-relative');
  fs.writeFileSync(workspaceRelative, 'workspace-relative');

  assert.equal(
    resolveAuthoringSourcePath('data.xlsx', document, workspace),
    documentRelative,
  );
});

test('guided authoring falls back to an existing workspace-root-relative source', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-authoring-source-'));
  const workspace = path.join(base, 'workspace');
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs, { recursive: true });

  const document = path.join(docs, 'spec.md');
  const workspaceRelative = path.join(workspace, 'data.xlsx');
  fs.writeFileSync(document, '# spec\n');
  fs.writeFileSync(workspaceRelative, 'workspace-relative');

  assert.equal(
    resolveAuthoringSourcePath('data.xlsx', document, workspace),
    workspaceRelative,
  );
});

test('guided authoring does not resolve an existing source outside the workspace', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-authoring-source-'));
  const workspace = path.join(base, 'workspace');
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs, { recursive: true });

  const document = path.join(docs, 'spec.md');
  const outside = path.join(base, 'outside.xlsx');
  fs.writeFileSync(document, '# spec\n');
  fs.writeFileSync(outside, 'outside');

  assert.equal(
    resolveAuthoringSourcePath('../../outside.xlsx', document, workspace),
    undefined,
  );
});

test('guided authoring rejects a source symlink that resolves outside the workspace', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-authoring-source-'));
  const workspace = path.join(base, 'workspace');
  const docs = path.join(workspace, 'docs');
  const data = path.join(workspace, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const document = path.join(docs, 'spec.md');
  const outside = path.join(base, 'outside.xlsx');
  const link = path.join(data, 'linked.xlsx');
  fs.writeFileSync(document, '# spec\n');
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

  assert.equal(
    resolveAuthoringSourcePath('../data/linked.xlsx', document, workspace),
    undefined,
  );
});
