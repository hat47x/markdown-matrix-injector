import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { resolveSourcePath, PathContainmentError } from '../src/core/pathResolver.js';

// ── Normal resolution (no containment violation) ──────────────────────────

test('resolveSourcePath: resolves relative to markdown file when file exists there', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-resolve-'));
  const mdPath = path.join(tmp, 'spec.md');
  const csvPath = path.join(tmp, 'data.csv');
  fs.writeFileSync(csvPath, 'A,B\n1,2');

  const resolved = resolveSourcePath({
    markdownFilePath: mdPath,
    sourcePath: 'data.csv',
    workspaceRoot: tmp,
  });

  assert.equal(resolved, csvPath);
});

test('resolveSourcePath: falls back to workspace root when markdown-relative missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-resolve-'));
  const docsDir = path.join(tmp, 'docs');
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'roles.csv'), 'Name,Role\nAlice,Admin');

  const resolved = resolveSourcePath({
    markdownFilePath: path.join(docsDir, 'spec.md'),
    sourcePath: path.join('data', 'roles.csv'),
    workspaceRoot: tmp,
  });

  assert.equal(resolved, path.join(dataDir, 'roles.csv'));
});

test('resolveSourcePath: ../ from docs to data within workspace boundary is allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-resolve-'));
  const docsDir = path.join(tmp, 'docs');
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'roles.csv'), 'Name,Role\nAlice,Admin');

  const resolved = resolveSourcePath({
    markdownFilePath: path.join(docsDir, 'spec.md'),
    sourcePath: '../data/roles.csv',
    workspaceRoot: tmp,
  });

  assert.equal(resolved, path.join(dataDir, 'roles.csv'));
});

// ── Containment violations ────────────────────────────────────────────────

test('resolveSourcePath: rejects ../ traversal beyond workspace root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-contain-'));
  const workspaceDir = path.join(tmp, 'workspace');
  const docsDir = path.join(workspaceDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  // Place a file OUTSIDE the workspace boundary
  const outsideFile = path.join(tmp, 'outside.csv');
  fs.writeFileSync(outsideFile, 'secret');

  // Reference it via .. traversal from inside workspace
  assert.throws(
    () =>
      resolveSourcePath({
        markdownFilePath: path.join(docsDir, 'spec.md'),
        sourcePath: '../../outside.csv', // escapes workspace
        workspaceRoot: workspaceDir,
      }),
    (err: unknown) => {
      assert.ok(err instanceof PathContainmentError);
      assert.match((err as Error).message, /outside workspace boundary/);
      return true;
    },
  );
});

test('resolveSourcePath: rejects deep ../ traversal to system paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-contain-'));
  const docsDir = path.join(tmp, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  // ../../../../etc/hosts would resolve outside on any system with /etc/hosts
  // Use tmp as workspace — traversal beyond tmp is rejected
  assert.throws(
    () =>
      resolveSourcePath({
        markdownFilePath: path.join(docsDir, 'spec.md'),
        sourcePath: '../../../../../../../etc/hosts',
        workspaceRoot: tmp,
      }),
    (err: unknown) => {
      assert.ok(err instanceof PathContainmentError);
      return true;
    },
  );
});

test('resolveSourcePath: without workspaceRoot, ../ beyond markdown dir is rejected', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-contain-'));
  const docsDir = path.join(tmp, 'docs');
  const parentFile = path.join(tmp, 'parent.csv');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(parentFile, 'secret');

  // No workspaceRoot → boundary = markdown file's directory (docs/)
  assert.throws(
    () =>
      resolveSourcePath({
        markdownFilePath: path.join(docsDir, 'spec.md'),
        sourcePath: '../parent.csv', // goes above docs/
      }),
    (err: unknown) => {
      assert.ok(err instanceof PathContainmentError);
      return true;
    },
  );
});

test('resolveSourcePath: without workspaceRoot, same-dir file is allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-contain-'));
  const siblingCsv = path.join(tmp, 'data.csv');
  fs.writeFileSync(siblingCsv, 'A,B');

  const resolved = resolveSourcePath({
    markdownFilePath: path.join(tmp, 'spec.md'),
    sourcePath: 'data.csv',
    // no workspaceRoot
  });

  assert.equal(resolved, siblingCsv);
});

test('resolveSourcePath: without workspaceRoot, subdirectory file is allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-contain-'));
  const subDir = path.join(tmp, 'sub');
  const subFile = path.join(subDir, 'data.csv');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(subFile, 'A,B');

  const resolved = resolveSourcePath({
    markdownFilePath: path.join(tmp, 'spec.md'),
    sourcePath: 'sub/data.csv',
    // no workspaceRoot
  });

  assert.equal(resolved, subFile);
});

// ── Symlink bypass ────────────────────────────────────────────────────────

test('resolveSourcePath: symlink pointing outside boundary is rejected', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-link-'));
  const workspaceDir = path.join(tmp, 'workspace');
  const docsDir = path.join(workspaceDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  // File outside workspace
  const outsideFile = path.join(tmp, 'outside.csv');
  fs.writeFileSync(outsideFile, 'secret');

  // Symlink inside workspace pointing outside
  const linkPath = path.join(workspaceDir, 'link-to-outside.csv');
  fs.symlinkSync(outsideFile, linkPath);

  assert.throws(
    () =>
      resolveSourcePath({
        markdownFilePath: path.join(docsDir, 'spec.md'),
        sourcePath: '../link-to-outside.csv',
        workspaceRoot: workspaceDir,
      }),
    (err: unknown) => {
      assert.ok(err instanceof PathContainmentError);
      return true;
    },
  );
});

test('resolveSourcePath: symlink within boundary is allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-link-'));
  const workspaceDir = path.join(tmp, 'workspace');
  const dataDir = path.join(workspaceDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // File inside workspace
  const targetFile = path.join(dataDir, 'roles.csv');
  fs.writeFileSync(targetFile, 'Name,Role\nAlice,Admin');

  // Symlink also inside workspace
  const linkPath = path.join(workspaceDir, 'roles-link.csv');
  fs.symlinkSync(targetFile, linkPath);

  const resolved = resolveSourcePath({
    markdownFilePath: path.join(workspaceDir, 'spec.md'),
    sourcePath: 'roles-link.csv',
    workspaceRoot: workspaceDir,
  });

  // Should resolve to the symlink path (not the real path) for file access
  assert.ok(fs.existsSync(resolved));
});
