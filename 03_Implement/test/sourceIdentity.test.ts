import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PathContainmentError,
} from '../src/core/pathResolver.js';
import {
  SOURCE_IDENTITY_ALGORITHM,
  SOURCE_IDENTITY_REPRESENTATION,
  createSourceIdentityFromBytes,
  readSourceFileIdentity,
  resolveContainedSourceIdentity,
} from '../src/core/sourceIdentity.js';

test('creates deterministic SHA-256 identity from raw bytes', () => {
  const bytes = Buffer.from('ID,State\n1,ready\n', 'utf8');
  const expected = createHash('sha256').update(bytes).digest('hex');

  const left = createSourceIdentityFromBytes(bytes);
  const right = createSourceIdentityFromBytes(bytes);

  assert.deepEqual(left, right);
  assert.equal(left.algorithm, SOURCE_IDENTITY_ALGORITHM);
  assert.equal(
    left.representation,
    SOURCE_IDENTITY_REPRESENTATION,
  );
  assert.equal(left.digest, `sha256:${expected}`);
  assert.equal(left.byteLength, bytes.byteLength);
});

test('file identity matches identity generated from the same bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-id-'));
  const source = path.join(root, 'data.csv');
  const bytes = Buffer.from('A,B\n1,2\n', 'utf8');
  fs.writeFileSync(source, bytes);

  assert.deepEqual(
    readSourceFileIdentity(source),
    createSourceIdentityFromBytes(bytes),
  );
});

test('resolves contained source before generating identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-id-'));
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const source = path.join(data, 'data.csv');
  fs.writeFileSync(source, 'A,B\n1,2\n');

  const result = resolveContainedSourceIdentity({
    markdownFilePath: path.join(docs, 'spec.md'),
    sourcePath: '../data/data.csv',
    workspaceRoot: root,
  });

  assert.equal(result.resolvedPath, source);
  assert.equal(
    result.identity,
    undefined,
  );
  assert.match(result.identity.digest, /^sha256:[0-9a-f]{64}$/u);
});

test('rejects traversal beyond the workspace boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-id-'));
  const workspace = path.join(root, 'workspace');
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(root, 'outside.csv'), 'secret');

  assert.throws(
    () => resolveContainedSourceIdentity({
      markdownFilePath: path.join(docs, 'spec.md'),
      sourcePath: '../../outside.csv',
      workspaceRoot: workspace,
    }),
    PathContainmentError,
  );
});

test('rejects a symlink whose real target is outside the workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-id-'));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const outside = path.join(root, 'outside.csv');
  fs.writeFileSync(outside, 'secret');
  const link = path.join(workspace, 'link.csv');
  fs.symlinkSync(outside, link);

  assert.throws(
    () => resolveContainedSourceIdentity({
      markdownFilePath: path.join(workspace, 'spec.md'),
      sourcePath: 'link.csv',
      workspaceRoot: workspace,
    }),
    PathContainmentError,
  );
});

test('source mutation changes the identity digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-id-'));
  const source = path.join(root, 'data.csv');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const before = readSourceFileIdentity(source);

  fs.appendFileSync(source, '3,4\n');
  const after = readSourceFileIdentity(source);

  assert.notEqual(before.digest, after.digest);
  assert.ok(after.byteLength > before.byteLength);
});
