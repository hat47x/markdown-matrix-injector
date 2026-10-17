import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContentMatchMarkdown, contentMatchStillExact, describeContentMatchDetail, describeIncompleteContentMatchSearch, findWorkbookContentMatches, findWorkbookContentMatchesDetailed, jaContentMatchContextPhrases, jaContentMatchDetailPhrases, jaContentMatchIncompletePhrases, summarizeContentMatchContext, type WorkbookSheetsSource } from '../src/dx/contentMatchSearch.js';
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

test('contentMatchStillExact rechecks the selected physical range without a new workspace search', () => {
  const sheet = sheetSourceFromMatrix([
    ['ID', 'State'],
    ['A-001', 'Open'],
    ['A-002', 'Closed'],
  ]);
  const range = { startRow: 1, startCol: 0, endRow: 1, endCol: 1 };

  assert.equal(contentMatchStillExact('A-001\tOpen\r\n', sheet, range), true);
  assert.equal(contentMatchStillExact('A-001\tClosed\r\n', sheet, range), false);
  assert.equal(
    contentMatchStillExact('A-001\tOpen\r\nA-002\tClosed\r\n', sheet, range),
    false,
  );
});

test('findWorkbookContentMatches returns nothing when no workbook contains the values', () => {
  const workbooks = [workbook('./a.xlsx', { Sheet1: [['x', 'y']] })];
  assert.deepEqual(findWorkbookContentMatches('a\tb\r\n', workbooks), []);
});

test('findWorkbookContentMatchesDetailed reports a sheet that was skipped by the index limit', () => {
  const hugeSheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 999, endCol: 999 },
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

  const result = findWorkbookContentMatchesDetailed('a\tb\r\nc\td\r\n', workbooks);

  assert.deepEqual(result.matches.map(located), [
    { filepath: './small.xlsx', sheet: 'Sheet1', range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } },
  ]);
  assert.deepEqual(result.skippedSheets, [
    {
      filepath: './huge.xlsx',
      sheet: 'TooBig',
      reason: 'sheet-too-large',
      cellCount: 1_000_000,
      limit: 200_000,
    },
  ]);
});

test('findWorkbookContentMatchesDetailed reports sheets whose exact candidates were truncated', () => {
  const rows = [Array.from({ length: 201 }, () => 'x')];
  const result = findWorkbookContentMatchesDetailed('x\r\n', [
    workbook('./duplicates.xlsx', { Sheet1: rows }),
  ]);

  assert.equal(result.matches.length, 200);
  assert.deepEqual(result.truncatedSheets, [
    {
      filepath: './duplicates.xlsx',
      sheet: 'Sheet1',
      limit: 200,
    },
  ]);
  assert.deepEqual(result.skippedSheets, []);
});

test('findWorkbookContentMatchesDetailed does not hide unexpected sheet read failures as no-match', () => {
  const brokenSheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    merges: [],
    cellAt: () => {
      throw new Error('fixture read failure');
    },
  };

  assert.throws(
    () => findWorkbookContentMatchesDetailed('a\tb\r\nc\td\r\n', [{ filepath: './broken.xlsx', sheets: { Sheet1: brokenSheet } }]),
    /fixture read failure/,
  );
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
    summarizeContentMatchContext(matches[0], 96, jaContentMatchContextPhrases),
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

test('Paste As keeps its QuickPick detail wording and its why-not notice in Japanese', () => {
  const match: WorkbookContentMatch = {
    filepath: './release.xlsx',
    sheet: 'Sheet1',
    range: { startRow: 2, startCol: 0, endRow: 2, endCol: 1 },
    context: {
      headers: ['No', '確認項目'],
      previewRows: [
        ['1', '性能試験'],
        ['2', '脆弱性診断'],
      ],
      rowAbove: ['1', '性能試験'],
      rowBelow: ['ラスト1行', 'ラスト2行'],
    },
  };
  assert.equal(
    describeContentMatchDetail(match, jaContentMatchDetailPhrases),
    '見出し: No | 確認項目　範囲内: 1 | 性能試験 ／ 2 | 脆弱性診断　直前の行: 1 | 性能試験　直後の行: ラスト1行 | ラスト2行',
  );
  assert.equal(
    describeContentMatchDetail({ ...match, context: undefined }, jaContentMatchDetailPhrases),
    '',
  );
  assert.equal(
    describeIncompleteContentMatchSearch(1, 1, 1, true, 50, true, jaContentMatchIncompletePhrases),
    '検索は完全ではありません（読めないブック 1件、索引上限を超えたシート 1件、候補上限に達したシート 1件、探索対象ブックが上限50件を超過、検索が中断されました）。',
  );
  assert.equal(describeIncompleteContentMatchSearch(0, 0, 0, false, 50, false), '');
});


test('content-match preserves leading blank CSV rows in the returned physical range', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-content-match-csv-origin-'));
  const filePath = path.join(tempDir, 'source.csv');
  fs.writeFileSync(filePath, '\n\nName,Role\nAlice,Admin\n');

  const matches = findWorkbookContentMatches(
    'Name\tRole\r\nAlice\tAdmin\r\n',
    [{ filepath: './source.csv', sheets: loadWorkbook({ absolutePath: filePath }).sheets }],
  );

  assert.deepEqual(matches.map(located), [
    {
      filepath: './source.csv',
      sheet: 'Sheet1',
      range: { startRow: 2, startCol: 0, endRow: 3, endCol: 1 },
    },
  ]);
  assert.equal(buildContentMatchMarkdown(matches[0]), '![[./source.csv#Sheet1|A3:B4]]');
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
