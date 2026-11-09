import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { loadWorkbookFromBytes } from '../src/core/workbookLoader.js';

/**
 * Issue #811: a cell SheetJS cannot format (`cell.w` absent) must not fall back
 * to `String(Date)`, which embeds the runtime time zone. Formats that SheetJS
 * does not interpret (Japanese era, weekday names, DBNum) are pinned at their
 * CURRENT output below. These strings are NOT what Excel displays (Excel
 * shows e.g. 令和5年3月15日); the test records the observed behaviour so a change
 * is visible. Excel-authored workbooks were not checked.
 */

function bookBytes(): Buffer {
  const sheet: XLSX.WorkSheet = {
    '!ref': 'A1:F1',
    A1: { t: 'n', v: 45000.5, z: '[$-ja-JP]ge.m.d' },
    B1: { t: 'n', v: 45000, z: 'yyyy/m/d(aaa)' },
    C1: { t: 'n', v: 45000, z: '[$-411]ggge"年"m"月"d"日"' },
    D1: { t: 'n', v: 1234, z: '[DBNum1]General' },
    E1: { t: 'n', v: 45000, z: 'yyyy/m/d' },
    F1: { t: 'n', v: 45000, z: '[$-ja-JP]ge.m.d' },
  };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', cellDates: true }) as Buffer);
}

function texts(): string[] {
  const data = loadWorkbookFromBytes('t.xlsx', bookBytes());
  const sheet = data.sheets.S;
  return [0, 1, 2, 3, 4, 5].map((col) => sheet.cellAt(0, col)?.text ?? '<absent>');
}

test('cell text does not depend on the runtime time zone, even when SheetJS cannot format the date', () => {
  const previous = process.env.TZ;
  try {
    const seen = new Map<string, string[]>();
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      seen.set(tz, texts());
    }
    const [first, ...rest] = [...seen.values()];
    for (const other of rest) assert.deepEqual(other, first);
    for (const value of first) assert.doesNotMatch(value, /GMT|UTC\b|Coordinated/u);
    // A date with a time of day and no formattable number format keeps the time (UTC components).
    assert.equal(first[0], '2023-03-15 12:00:00');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('current output for formats SheetJS does not interpret is pinned (differs from Excel)', () => {
  const [, weekday, era, dbnum, plain] = texts();
  assert.equal(weekday, '2023/3/15(aaa)');
  assert.equal(era, 'ggg2023年3月15日');
  assert.equal(dbnum, '1234');
  assert.equal(plain, '2023/3/15');
});
