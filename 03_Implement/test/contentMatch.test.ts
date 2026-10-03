import test from 'node:test';
import assert from 'node:assert/strict';

import { ContentMatchIndexLimitError, findContentMatches, findContentMatchesDetailed } from '../src/core/contentMatch.js';
import { sheetSourceFromMatrix, type CellRange, type SheetSource } from '../src/core/sheetSource.js';

/** A `SheetSource` whose used range starts away from physical (0,0), like `workbookCache.test.ts`'s fixtures. */
function sheetFromOffsetMatrix(rows: readonly (readonly string[])[], originRow: number, originCol: number): SheetSource {
  const rowCount = rows.length;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const usedRange: CellRange = {
    startRow: originRow,
    startCol: originCol,
    endRow: originRow + rowCount - 1,
    endCol: originCol + columnCount - 1,
  };
  return {
    usedRange,
    merges: [],
    cellAt(row, col) {
      const text = rows[row - originRow]?.[col - originCol];
      if (text === undefined || text === '') {
        return undefined;
      }
      return { text, type: 's', value: text };
    },
  };
}

test('findContentMatches finds a single exact match', () => {
  const sheet = sheetSourceFromMatrix([
    ['x', 'a', 'b', 'y'],
    ['x', 'c', 'd', 'y'],
  ]);
  const matches = findContentMatches(sheet, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepEqual(matches, [{ range: { startRow: 0, startCol: 1, endRow: 1, endCol: 2 } }]);
});

test('findContentMatches respects a non-A1 physical origin (does not assume the sheet starts at 0,0)', () => {
  // Mirrors the C5:F12 reproduction used elsewhere (input-assistance-source-model.md):
  // the match lives at physical (row 4, col 2), and the reported range must say so.
  const sheet = sheetFromOffsetMatrix(
    [
      ['a', 'b'],
      ['c', 'd'],
    ],
    4,
    2,
  );
  const matches = findContentMatches(sheet, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepEqual(matches, [{ range: { startRow: 4, startCol: 2, endRow: 5, endCol: 3 } }]);
});

test('findContentMatches returns nothing when the values are not present', () => {
  const sheet = sheetSourceFromMatrix([
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepEqual(findContentMatches(sheet, [['q']]), []);
});

test('findContentMatches returns every occurrence when content repeats (must not pick one for the caller)', () => {
  // Mirrors the design doc's 重複 (duplicate) scenario in §4: identical content
  // appearing twice is not something content-matching alone can disambiguate.
  const sheet = sheetSourceFromMatrix([
    ['a', 'b', 'x', 'a', 'b'],
    ['c', 'd', 'x', 'c', 'd'],
  ]);
  const matches = findContentMatches(sheet, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepEqual(
    matches.map((m) => m.range).sort((a, b) => a.startCol - b.startCol),
    [
      { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
      { startRow: 0, startCol: 3, endRow: 1, endCol: 4 },
    ],
  );
});

test('findContentMatches only reports full matches, never a partial one (§4 step 5: a mismatch is rejected, not scored)', () => {
  const sheet = sheetSourceFromMatrix([
    ['a', 'p', 'z'],
    ['q', 'r', 'w'],
    ['x', 'a', 'y'],
    ['b', 'c', 'k'],
  ]);
  // 'a' occurs twice (at (0,0) and (2,1)), which by itself would suggest two
  // candidate origins; only the one at (0,0) is a genuine full match.
  const matches = findContentMatches(sheet, [
    ['a', 'p'],
    ['q', 'r'],
  ]);
  assert.deepEqual(matches, [{ range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } }]);
});

test('findContentMatches returns nothing for an all-empty needle (§5 step 6: content alone cannot anchor a blank selection)', () => {
  const sheet = sheetSourceFromMatrix([
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepEqual(
    findContentMatches(sheet, [
      ['', ''],
      ['', ''],
    ]),
    [],
  );
});

test('findContentMatches returns nothing for an empty needle matrix', () => {
  const sheet = sheetSourceFromMatrix([['a']]);
  assert.deepEqual(findContentMatches(sheet, []), []);
});

test('findContentMatches returns nothing when the needle is larger than the sheet\'s used range', () => {
  const sheet = sheetSourceFromMatrix([
    ['a', 'b'],
    ['c', 'd'],
  ]);
  const needle = [
    ['a', 'b', 'x'],
    ['c', 'd', 'x'],
    ['x', 'x', 'x'],
  ];
  assert.deepEqual(findContentMatches(sheet, needle), []);
});

test('findContentMatches drops a candidate whose implied origin falls outside the used range instead of throwing', () => {
  // The only non-empty needle cell ('q') sits two rows below the needle's top;
  // 'q' is found at the sheet's very first row, so the implied origin is
  // row -2 -- off the top edge. Must be filtered, not read out of bounds.
  const sheet = sheetSourceFromMatrix([['q'], ['x'], ['y']]);
  const needle = [[''], [''], ['q']];
  assert.deepEqual(findContentMatches(sheet, needle), []);
});

test('findContentMatches throws a typed limit error when the sheet is too large to search completely', () => {
  const sheet = sheetSourceFromMatrix([
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
    ['g', 'h', 'i'],
  ]);
  assert.throws(
    () => findContentMatches(sheet, [['a']], { maxIndexedCells: 4 }),
    (error: unknown) => {
      assert.ok(error instanceof ContentMatchIndexLimitError);
      assert.equal(error.code, 'MMI_CONTENT_MATCH_SHEET_TOO_LARGE');
      assert.equal(error.cellCount, 9);
      assert.equal(error.limit, 4);
      return true;
    },
  );
});

test('findContentMatches does not let early anchor-only hits hide a later exact match', () => {
  const decoys = Array.from({ length: 205 }, () => ['anchor', 'wrong']);
  const sheet = sheetSourceFromMatrix([...decoys, ['anchor', 'target']]);

  const matches = findContentMatches(sheet, [['anchor', 'target']], { maxCandidates: 1 });

  assert.deepEqual(matches, [
    { range: { startRow: 205, startCol: 0, endRow: 205, endCol: 1 } },
  ]);
});

test('findContentMatchesDetailed reports when exact matches exceed maxCandidates', () => {
  const sheet = sheetSourceFromMatrix([['x', 'x', 'x', 'x']]);
  const result = findContentMatchesDetailed(sheet, [['x']], { maxCandidates: 3 });

  assert.deepEqual(result.matches, [
    { range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 } },
    { range: { startRow: 0, startCol: 1, endRow: 0, endCol: 1 } },
    { range: { startRow: 0, startCol: 2, endRow: 0, endCol: 2 } },
  ]);
  assert.equal(result.truncated, true);
  assert.equal(result.limit, 3);
});

test('findContentMatchesDetailed does not call an exactly-full result set truncated', () => {
  const sheet = sheetSourceFromMatrix([['x', 'x', 'x']]);
  const result = findContentMatchesDetailed(sheet, [['x']], { maxCandidates: 3 });

  assert.equal(result.matches.length, 3);
  assert.equal(result.truncated, false);
});
