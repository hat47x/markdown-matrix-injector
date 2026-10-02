import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContentMatchMarkdown, findWorkbookContentMatches, summarizeContentMatchContext, type WorkbookSheetsSource } from '../src/dx/contentMatchSearch.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { sheetSourceFromMatrix, type SheetSource } from '../src/core/sheetSource.js';
import type { WorkbookContentMatch } from '../src/dx/contentMatchSearch.js';

/** Location only; `context` is covered by its own test. */
const located = ({ filepath, sheet, range }: WorkbookContentMatch) => ({ filepath, sheet, range });

function workbook(filepath: string, sheets: Record<string, readonly (readonly string[])[]>): WorkbookSheetsSource {
  return {
    filepath,
    sheets: Object.fromEntries(Object.entries(sheets).map(([name, rows]) => [name, sheetSourceFromMatrix(rows)])),
  };
}

test('findWorkbookContentMatches preserves empty boundary columns from clipboard TSV', () => {
  const matches = findWorkbookContentMatches(
    '\tAlpha\t\r\n\tBeta\t\r\n',
    [
      workbook('./edge-empty.xlsx', {
        Sheet1: [
          ['noise', 'noise', 'noise'],
          ['', 'Alpha', ''],
          ['', 'Beta', ''],
        ],
      }),
    ],
  );

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].range, {
    startRow: 1,
    startCol: 0,
    endRow: 2,
    endCol: 2,
  });
});

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

  assert.deepEqual(matches.map(located), [
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
    matches.sort((left, right) => left.filepath.localeCompare(right.filepath)).map(located),
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

test('findWorkbookContentMatches treats leading and trailing spaces as source data', () => {
  const workbooks = [
    workbook('./whitespace.xlsx', {
      Sheet1: [
        ['ID', 'Value'],
        ['1', ' padded '],
        ['1', 'padded'],
      ],
    }),
  ];

  const matches = findWorkbookContentMatches('1\t padded \r\n', workbooks);

  assert.deepEqual(matches.map(located), [
    {
      filepath: './whitespace.xlsx',
      sheet: 'Sheet1',
      range: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 },
    },
  ]);
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

  assert.deepEqual(matches.map(located), [
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

test('findWorkbookContentMatches describes where each identical copy sits', () => {
  const workbooks = [
    workbook('./release.xlsx', {
      Sheet1: [
        ['リリース判定', '', ''],
        ['No', '確認項目', '判定'],
        ['1', '性能試験', 'OK'],
        ['2', '脆弱性診断', 'NG'],
        ['', '', ''],
        ['承認', '', ''],
        ['No', '確認項目', '判定'],
        ['7', '移行', '保留'],
        ['2', '脆弱性診断', 'NG'],
      ],
    }),
  ];
  const matches = findWorkbookContentMatches('2\t脆弱性診断\tNG\r\n', workbooks);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((match) => [match.context?.title, match.context?.rowAbove?.join('|')]), [
    ['リリース判定', '1|性能試験|OK'],
    ['承認', '7|移行|保留'],
  ]);
  assert.deepEqual(matches[0].context?.headers, ['No', '確認項目', '判定']);
  assert.deepEqual(matches[0].context?.previewRows, [['2', '脆弱性診断', 'NG']]);
});

test('match context previews at most the first two source rows of the matched range', () => {
  const matches = findWorkbookContentMatches(
    '1\tAlpha\r\n2\tBeta\r\n3\tGamma\r\n',
    [
      workbook('./rows.xlsx', {
        Sheet1: [
          ['ID', 'Name'],
          ['1', 'Alpha'],
          ['2', 'Beta'],
          ['3', 'Gamma'],
        ],
      }),
    ],
  );

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].context?.previewRows, [
    ['1', 'Alpha'],
    ['2', 'Beta'],
  ]);
});

test('summarizeContentMatchContext gives Paste As a bounded one-line duplicate discriminator', () => {
  const matches = findWorkbookContentMatches(
    '2\t脆弱性診断\tNG\r\n',
    [
      workbook('./release.xlsx', {
        Sheet1: [
          ['リリース判定', '', ''],
          ['No', '確認項目', '判定'],
          ['1', '性能試験', 'OK'],
          ['2', '脆弱性診断', 'NG'],
        ],
      }),
    ],
  );
  assert.equal(
    summarizeContentMatchContext(matches[0]),
    '表:リリース判定 / 見出し:No|確認項目|判定 / 値:2|脆弱性診断|NG / 前:1|性能試験|OK',
  );

  const long = summarizeContentMatchContext(
    {
      filepath: './x.xlsx',
      sheet: 'Sheet1',
      range: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 },
      context: {
        title: '複数\n行 の   タイトル',
        headers: ['非常に長い見出しABCDEFGHIJKLMN', '次の見出し'],
        rowAbove: ['前の行', '値'],
      },
    },
    24,
  );
  assert.ok([...long].length <= 24);
  assert.doesNotMatch(long, /[\r\n]/u);
  assert.match(long, /…$/u);
});


test('content-match reloads changed source bytes before accepting a pasted fragment', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-content-match-change-'));
  const filePath = path.join(tempDir, 'source.csv');
  const asWorkbook = (): WorkbookSheetsSource => ({
    filepath: './source.csv',
    // Deliberately use an uncached load, matching extension.ts
    // loadWorkspaceWorkbooksForContentMatch(): every explicit content-match
    // search re-reads the current workbook bytes before exact comparison.
    sheets: loadWorkbook({ absolutePath: filePath }).sheets,
  });

  fs.writeFileSync(filePath, 'ID\tState\nA-001\tOpen\n'.replaceAll('\t', ','));
  assert.equal(
    findWorkbookContentMatches('ID\tState\r\nA-001\tOpen\r\n', [asWorkbook()]).length,
    1,
  );

  fs.writeFileSync(filePath, 'ID\tState\nA-001\tClosed\n'.replaceAll('\t', ','));

  // The old clipboard fragment must not survive as a candidate merely because
  // it matched an earlier read/index state.
  assert.deepEqual(
    findWorkbookContentMatches('ID\tState\r\nA-001\tOpen\r\n', [asWorkbook()]),
    [],
  );
  assert.equal(
    findWorkbookContentMatches('ID\tState\r\nA-001\tClosed\r\n', [asWorkbook()]).length,
    1,
  );
});
