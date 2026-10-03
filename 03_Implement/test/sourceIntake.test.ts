import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  intakeSourceFile,
  pathWithinBoundaryForWrite,
} from '../src/importAssist/sourceIntake.js';

test('source intake copies exact bytes and reuses an identical destination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-intake-'));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-external-'));
  const source = path.join(external, 'legacy.xlsx');
  const destination = path.join(root, 'data', 'legacy.xlsx');
  const bytes = Buffer.from('legacy-workbook-bytes');
  fs.writeFileSync(source, bytes);

  const first = intakeSourceFile(source, destination);
  assert.deepEqual(first, { sourcePath: destination, created: true });
  assert.equal(fs.readFileSync(destination).equals(bytes), true);

  const second = intakeSourceFile(source, destination);
  assert.deepEqual(second, { sourcePath: destination, created: false });
  assert.equal(fs.readFileSync(destination).equals(bytes), true);
});

test('source intake refuses a different existing destination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-intake-'));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-external-'));
  const source = path.join(external, 'legacy.xlsx');
  const destination = path.join(root, 'legacy.xlsx');
  fs.writeFileSync(source, 'source');
  fs.writeFileSync(destination, 'different');

  assert.throws(
    () => intakeSourceFile(source, destination),
    /already exists with different content/u,
  );
  assert.equal(fs.readFileSync(destination, 'utf8'), 'different');
});

test('source intake preserves the source extension', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-intake-'));
  const source = path.join(root, 'legacy.xlsm');
  fs.writeFileSync(source, 'source');

  assert.throws(
    () => intakeSourceFile(source, path.join(root, 'legacy.xlsx')),
    /must keep the source extension/u,
  );
});

test('write containment canonicalizes an existing symlink ancestor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-intake-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-outside-'));
  const link = path.join(root, 'linked');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');

  assert.equal(pathWithinBoundaryForWrite(path.join(root, 'data', 'legacy.xlsx'), root), true);
  assert.equal(pathWithinBoundaryForWrite(path.join(link, 'legacy.xlsx'), root), false);
});
