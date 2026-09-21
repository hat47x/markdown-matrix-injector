import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cellRangeToA1,
  columnToIndex,
  indexToColumn,
  measureRegion,
  parseCellRef,
  parseRangeToCellRange,
  rangeDimensions,
  sliceRegion,
} from '../src/core/tableGeometry.js';
import { sheetSourceFromMatrix, type SheetSource } from '../src/core/sheetSource.js';

// ── columnToIndex / parseCellRef: A1 <-> 0-based coordinates ────────────────

test('columnToIndex converts single and multi-letter columns', () => {
  assert.equal(columnToIndex('A'), 0);
  assert.equal(columnToIndex('Z'), 25);
  assert.equal(columnToIndex('AA'), 26);
  assert.equal(columnToIndex('AB'), 27);
});

test('parseCellRef is case-insensitive and 0-bases the row', () => {
  assert.deepEqual(parseCellRef('b3'), { row: 2, col: 1 });
  assert.deepEqual(parseCellRef('B3'), { row: 2, col: 1 });
});

test('parseCellRef rejects a malformed reference visibly rather than mis-slicing silently', () => {
  assert.throws(() => parseCellRef('3B'), /Invalid range reference/);
  assert.throws(() => parseCellRef(''), /Invalid range reference/);
});

// ── parseRangeToCellRange / rangeDimensions: pure arithmetic ────────────────

test('parseRangeToCellRange collapses a single-cell reference to a 1x1 region', () => {
  assert.deepEqual(parseRangeToCellRange('B2'), { startRow: 1, startCol: 1, endRow: 1, endCol: 1 });
});

test('parseRangeToCellRange keeps a non-A1 origin (does not shift toward 0,0)', () => {
  // C5:F12 -- the flagship reproduction from input-assistance-source-model.md:
  // the used range starts at physical (row 4, col 2), not (0, 0).
  assert.deepEqual(parseRangeToCellRange('C5:F12'), { startRow: 4, startCol: 2, endRow: 11, endCol: 5 });
});

test('rangeDimensions computes rows/cols/cells from a CellRange without any cell access', () => {
  assert.deepEqual(rangeDimensions({ startRow: 4, startCol: 2, endRow: 11, endCol: 5 }), {
    rowCount: 8,
    columnCount: 4,
    cellCount: 32,
  });
});

// ── indexToColumn / cellRangeToA1: the inverse direction (physical -> A1),
// needed once something other than notation parsing produces a CellRange
// (a content-match result) that must be rendered back as an A1 string ──────

test('indexToColumn is the exact inverse of columnToIndex', () => {
  assert.equal(indexToColumn(0), 'A');
  assert.equal(indexToColumn(25), 'Z');
  assert.equal(indexToColumn(26), 'AA');
  assert.equal(indexToColumn(27), 'AB');
  for (const column of ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']) {
    assert.equal(indexToColumn(columnToIndex(column)), column);
  }
});

test('cellRangeToA1 collapses a 1x1 region to a single cell reference', () => {
  assert.equal(cellRangeToA1({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 }), 'B2');
});

test('cellRangeToA1 round-trips parseRangeToCellRange, including a non-A1 origin', () => {
  for (const range of ['B2', 'A1:C4', 'C5:F12']) {
    assert.equal(cellRangeToA1(parseRangeToCellRange(range)), range);
  }
});

test('rangeDimensions reports zero for a reversed range instead of a negative count', () => {
  // Matches the pre-existing Array.prototype.slice(3, 0) -> [] behaviour:
  // a reversed range is silently empty, not an error, not a negative count.
  assert.deepEqual(rangeDimensions({ startRow: 3, startCol: 0, endRow: 0, endCol: 0 }), {
    rowCount: 0,
    columnCount: 1,
    cellCount: 0,
  });
});

// ── measureRegion: dimensions only, must never touch a cell (review R3) ────

function sheetThatThrowsIfRead(usedRange?: SheetSource['usedRange']): SheetSource {
  return {
    usedRange,
    merges: [],
    cellAt() {
      throw new Error('measureRegion must not call cellAt -- it only measures, it does not materialise (R3)');
    },
  };
}

test('measureRegion computes dimensions from an explicit range without calling cellAt', () => {
  const sheet = sheetThatThrowsIfRead();
  assert.deepEqual(measureRegion(sheet, 'C5:F12'), { rowCount: 8, columnCount: 4, cellCount: 32 });
});

test('measureRegion falls back to the used range when no range is given, without calling cellAt', () => {
  const sheet = sheetThatThrowsIfRead({ startRow: 4, startCol: 2, endRow: 11, endCol: 5 });
  assert.deepEqual(measureRegion(sheet), { rowCount: 8, columnCount: 4, cellCount: 32 });
});

test('measureRegion returns zero dimensions for an empty sheet (no used range, no range given)', () => {
  const sheet = sheetThatThrowsIfRead(undefined);
  assert.deepEqual(measureRegion(sheet), { rowCount: 0, columnCount: 0, cellCount: 0 });
});

test('measureRegion is inexpensive even for a huge, distant-origin range -- it is pure arithmetic', () => {
  const sheet = sheetThatThrowsIfRead();
  // A range whose end column is deep into the alphabet and whose end row is
  // in the millions -- if this touched cells it would be the exact failure
  // mode the A1-expansion approach was rejected for (see
  // input-assistance-source-model.md §2, option C: 3,527,040 cells / ~2s).
  const dimensions = measureRegion(sheet, 'ZZ1:AAAZ5000000');
  assert.equal(dimensions.rowCount, 5000000); // rows 1..5,000,000 inclusive
  assert.ok(dimensions.columnCount > 0);
});

test('measureRegion reports the declared range width even when the sheet has fewer populated columns', () => {
  // A CSV with 3 real columns but a query that declares a 12-column range.
  // The previous implementation sliced the *actual* rows (only 3 columns
  // wide) and measured the slice's length, silently under-reporting the
  // column count. The range itself defines the rectangle (spec §6 step 1:
  // slicing produces a matrix sized to the range, missing cells become '');
  // Smart Fallback must see the declared width, not the populated width.
  const sheet = sheetSourceFromMatrix([
    ['A', 'B', 'C'],
    ['1', '2', '3'],
  ]);
  assert.deepEqual(measureRegion(sheet, 'A1:L2'), { rowCount: 2, columnCount: 12, cellCount: 24 });
});

// ── sliceRegion: the one place a rectangle is actually materialised ────────

test('sliceRegion materialises a physical rectangle at a non-A1 origin', () => {
  const rows = [
    ['x', 'x', 'ID', 'Name'],
    ['x', 'x', '1', 'Alice'],
  ];
  // Row/col 0-1 are junk that must NOT leak into a C-column slice.
  const sheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 1, endCol: 3 },
    merges: [],
    cellAt: (row, col) => {
      const text = rows[row]?.[col];
      return text === undefined ? undefined : { text, type: 's', value: text };
    },
  };

  assert.deepEqual(sliceRegion(sheet, 'C1:D2'), [
    ['ID', 'Name'],
    ['1', 'Alice'],
  ]);
});

test('sliceRegion returns a true rectangle: a missing cell becomes an empty string, not a shorter row', () => {
  const sheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 1, endCol: 2 },
    merges: [],
    cellAt: (row, col) => (row === 0 && col === 1 ? { text: 'only-cell', type: 's', value: 'only-cell' } : undefined),
  };

  const sliced = sliceRegion(sheet, 'A1:C2');
  assert.deepEqual(sliced, [
    ['', 'only-cell', ''],
    ['', '', ''],
  ]);
  assert.ok(sliced.every((row) => row.length === 3), 'every row must be the same length regardless of blank cells');
});

test('sliceRegion preserves a genuinely blank row inside the range instead of dropping it', () => {
  // The flagship bug: row 2 (0-based) is entirely empty but sits between two
  // populated rows. It must survive as its own row of empty strings so row
  // numbers below it are not shifted up.
  const rows: Record<number, Record<number, string>> = {
    0: { 0: 'ID', 1: 'Name' },
    1: { 0: '1', 1: 'Alice' },
    // row 2 intentionally has no entries
    3: { 0: '2', 1: 'Bob' },
  };
  const sheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 3, endCol: 1 },
    merges: [],
    cellAt: (row, col) => {
      const text = rows[row]?.[col];
      return text === undefined ? undefined : { text, type: 's', value: text };
    },
  };

  assert.deepEqual(sliceRegion(sheet), [
    ['ID', 'Name'],
    ['1', 'Alice'],
    ['', ''],
    ['2', 'Bob'],
  ]);
});

test('sliceRegion on an empty sheet (no used range, no range given) returns no rows', () => {
  const sheet: SheetSource = { usedRange: undefined, merges: [], cellAt: () => undefined };
  assert.deepEqual(sliceRegion(sheet), []);
});

// ── sheetSourceFromMatrix: the CSV / test-fixture wrapper ───────────────────

test('sheetSourceFromMatrix always originates at A1 and fills short rows as absent (not empty-string) cells', () => {
  const sheet = sheetSourceFromMatrix([
    ['A', 'B', 'C'],
    ['1'],
  ]);
  assert.deepEqual(sheet.usedRange, { startRow: 0, startCol: 0, endRow: 1, endCol: 2 });
  assert.equal(sheet.cellAt(1, 1), undefined);
  assert.deepEqual(sliceRegion(sheet), [
    ['A', 'B', 'C'],
    ['1', '', ''],
  ]);
});

test('sheetSourceFromMatrix reports no used range and no merges for an empty matrix', () => {
  const sheet = sheetSourceFromMatrix([]);
  assert.equal(sheet.usedRange, undefined);
  assert.deepEqual(sheet.merges, []);
});
