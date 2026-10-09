import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  clearSharedWorkbookCache,
  readWorkbookCached,
} from '../src/dx/sharedWorkbookCache.js';
import { sliceRegion } from '../src/core/tableGeometry.js';

test('explicit shared-cache invalidation reloads current workbook bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-shared-cache-'));
  const file = path.join(dir, 'source.csv');
  fs.writeFileSync(file, 'ID,State\n1,Open\n');
  const firstStat = fs.statSync(file);

  clearSharedWorkbookCache();
  assert.deepEqual(
    sliceRegion(readWorkbookCached(file).sheets.Sheet1),
    [['ID', 'State'], ['1', 'Open']],
  );

  // Same byte length and restored timestamp reproduce the metadata shape that
  // can defeat an mtime-only cache after an external Excel/save operation.
  fs.writeFileSync(file, 'ID,State\n1,Done\n');
  fs.utimesSync(file, firstStat.atime, firstStat.mtime);
  clearSharedWorkbookCache();

  assert.deepEqual(
    sliceRegion(readWorkbookCached(file).sheets.Sheet1),
    [['ID', 'State'], ['1', 'Done']],
  );
});
