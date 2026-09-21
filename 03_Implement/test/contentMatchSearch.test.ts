import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContentMatchMarkdown, findWorkbookContentMatches, type WorkbookSheetsSource } from '../src/dx/contentMatchSearch.js';
import { sheetSourceFromMatrix, type SheetSource } from '../src/core/sheetSource.js';

function workbook(filepath: string, sheets: Record<string, readonly (readonly string[])[]>): WorkbookSheetsSource {
  return {
    filepath,
    sheets: Object.fromEntries(Object.entries(sheets).map(([name, rows]) => [name, sheetSourceFromMatrix(rows)])),
  };
}

test('findWorkbookContentMatches finds a match in the only workbook given', () => {
  const workbooks = [
    workbook('./design.xlsx', {
      Sheet1: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    }),
  ];

  const matches = findWorkbookContentMatches('a\tb\r\nc\td\r\n', workbooks);

  assert.deepEqual(matches, [
    { filepath: './design.xlsx', sheet: 'Sheet1', range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } },
  ]);
});

test('findWorkbookContentMatches aggregates matches across multiple workbooks and sheets', () => {
  const workbooks = [
    workbook('./a.xlsx', {
      Sheet1: [['x']],
      Sheet2: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    }),
    workbook('./b.csv', {
      Sheet1: [
        ['q', 'a', 'b'],
        ['r', 'c', 'd'],
      ],
    }),
  ];

  const matches = findWorkbookContentMatches('a\tb\r\nc\td\r\n', workbooks);

  assert.deepEqual(
    matches.sort((left, right) => left.filepath.localeCompare(right.filepath)),
    [
      { filepath: './a.xlsx', sheet: 'Sheet2', range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } },
      { filepath: './b.csv', sheet: 'Sheet1', range: { startRow: 0, startCol: 1, endRow: 1, endCol: 2 } },
    ],
  );
});

test('findWorkbookContentMatches returns nothing for blank clipboard text', () => {
  const workbooks = [workbook('./a.xlsx', { Sheet1: [['a']] })];
  assert.deepEqual(findWorkbookContentMatches('   \r\n  ', workbooks), []);
});

test('findWorkbookContentMatches returns nothing when no workbook contains the values', () => {
  const workbooks = [workbook('./a.xlsx', { Sheet1: [['x', 'y']] })];
  assert.deepEqual(findWorkbookContentMatches('a\tb\r\n', workbooks), []);
});

test('findWorkbookContentMatches skips a sheet too large to index instead of aborting the whole search', () => {
  const hugeSheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 999, endCol: 999 }, // 1,000,000 cells
    merges: [],
    cellAt: () => {
      throw new Error('cellAt must not be called -- the size check must reject this sheet first');
    },
  };
  const workbooks: WorkbookSheetsSource[] = [
    { filepath: './huge.xlsx', sheets: { TooBig: hugeSheet } },
    workbook('./small.xlsx', {
      Sheet1: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    }),
  ];

  const matches = findWorkbookContentMatches('a\tb\r\nc\td\r\n', workbooks);

  assert.deepEqual(matches, [
    { filepath: './small.xlsx', sheet: 'Sheet1', range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } },
  ]);
});

test('buildContentMatchMarkdown renders file#sheet|range, including a non-A1 origin', () => {
  const markdown = buildContentMatchMarkdown({
    filepath: './design.xlsx',
    sheet: '状態遷移',
    range: { startRow: 4, startCol: 2, endRow: 11, endCol: 5 },
  });

  assert.equal(markdown, '![[./design.xlsx#状態遷移|C5:F12]]');
});
