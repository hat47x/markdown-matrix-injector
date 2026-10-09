import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sourceContentStamp } from '../src/dx/sourceChangeGuard.js';

test('source content stamp changes for same-size content even when mtime is restored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-guard-'));
  const file = path.join(dir, 'source.csv');
  fs.writeFileSync(file, 'A,B\n1,x\n');
  const beforeStat = fs.statSync(file);
  const before = sourceContentStamp(file);

  fs.writeFileSync(file, 'A,B\n1,y\n');
  fs.utimesSync(file, beforeStat.atime, beforeStat.mtime);
  const afterStat = fs.statSync(file);
  const after = sourceContentStamp(file);

  assert.equal(afterStat.size, beforeStat.size);
  assert.ok(
    Math.abs(afterStat.mtimeMs - beforeStat.mtimeMs) < 1,
    `fixture must restore mtime closely enough: ${beforeStat.mtimeMs} -> ${afterStat.mtimeMs}`,
  );
  assert.notEqual(after, before);
});

test('source content stamp has explicit states for unavailable and missing sources', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-source-guard-'));
  assert.equal(sourceContentStamp(undefined), 'unavailable');
  assert.equal(sourceContentStamp(path.join(dir, 'missing.csv')), 'missing');
});
