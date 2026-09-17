import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatMerge,
  type WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  WORKSHEET_FORMAT_FEATURE_VERSION,
  type WorksheetFormatSourceProfile,
} from '../src/experimental/worksheetFormatPrototype.js';

const STRUCTURE_ONLY_PROFILE: WorksheetFormatSourceProfile = {
  id: 'structure-only-v1',
  evidence: ['structure'],
};

type TableOptions = {
  startColumn?: number;
  labels?: readonly string[];
  rows?: readonly (readonly (string | undefined)[])[];
  headerMerges?: readonly (readonly [number, number])[];
  bodyMerges?: readonly { row: number; start: number; end: number }[];
};

/**
 * Builds a table whose merge coordinates are expressed relative to the table.
 * This keeps the fixtures readable and makes horizontal-shift invariance easy
 * to verify without encoding workbook-specific column numbers into the tests.
 */
function table(options: TableOptions = {}): WorksheetFormatSnapshot {
  const startColumn = options.startColumn ?? 0;
  const labels = options.labels ?? ['A', 'B', 'C', 'D'];
  const rows = options.rows ?? [
    ['a', 'b', 'c', 'd'],
    ['e', 'f', 'g', 'h'],
    ['i', 'j', 'k', 'l'],
  ];
  const cells: Array<{ row: number; column: number; text: string }> = [
    { row: 0, column: startColumn, text: '設定表' },
  ];

  labels.forEach((label, index) => {
    cells.push({ row: 1, column: startColumn + index, text: label });
  });
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value === undefined || value === '') return;
      cells.push({
        row: 2 + rowIndex,
        column: startColumn + columnIndex,
        text: value,
      });
    });
  });

  const merges: WorksheetFormatMerge[] = [{
    startRow: 0,
    startColumn,
    endRow: 0,
    endColumn: startColumn + labels.length - 1,
  }];
  for (const [start, end] of options.headerMerges ?? []) {
    merges.push({
      startRow: 1,
      startColumn: startColumn + start,
      endRow: 1,
      endColumn: startColumn + end,
    });
  }
  for (const merge of options.bodyMerges ?? []) {
    merges.push({
      startRow: merge.row,
      startColumn: startColumn + merge.start,
      endRow: merge.row,
      endColumn: startColumn + merge.end,
    });
  }

  return { cells, merges };
}

function feature(snapshot: WorksheetFormatSnapshot, prefix: string): string | undefined {
  return extractWorksheetFormatFeatures(snapshot).features.find((value) => value.startsWith(prefix));
}

test('feature contract is versioned as worksheet-format-v6', () => {
  assert.equal(WORKSHEET_FORMAT_FEATURE_VERSION, 'worksheet-format-v6');
});

test('header horizontal merge shape is encoded as a relative boundary-link mask', () => {
  const observation = extractWorksheetFormatFeatures(table({ headerMerges: [[1, 2]] }));

  assert.ok(observation.features.includes('merge:header-horizontal-present'));
  assert.ok(observation.features.includes('layout:header-horizontal-merge-links:010'));
});

test('header merge shape is invariant to horizontal worksheet movement', () => {
  const left = extractWorksheetFormatFeatures(table({ headerMerges: [[1, 2]], startColumn: 0 }));
  const shifted = extractWorksheetFormatFeatures(table({ headerMerges: [[1, 2]], startColumn: 7 }));

  assert.deepEqual(left.features, shifted.features);
});

test('body merge shape is retained only when it recurs in a strict majority of sampled rows', () => {
  const snapshot = table({ bodyMerges: [
    { row: 2, start: 0, end: 1 },
    { row: 4, start: 0, end: 1 },
  ] });

  assert.equal(
    feature(snapshot, 'layout:body-majority-horizontal-merge-links:'),
    'layout:body-majority-horizontal-merge-links:100',
  );
  assert.ok(extractWorksheetFormatFeatures(snapshot).features.includes('merge:body-horizontal-recurring'));
});

test('one-off body merge is ignored instead of becoming format identity', () => {
  const snapshot = table({ bodyMerges: [{ row: 2, start: 0, end: 1 }] });
  const observation = extractWorksheetFormatFeatures(snapshot);

  assert.equal(feature(snapshot, 'layout:body-majority-horizontal-merge-links:'), undefined);
  assert.ok(!observation.features.includes('merge:body-horizontal-recurring'));
});

test('single-row and repeated identical body merge shape produce the same feature set', () => {
  const single = extractWorksheetFormatFeatures(table({
    rows: [['a', 'b', 'c', 'd']],
    bodyMerges: [{ row: 2, start: 1, end: 2 }],
  }));
  const repeated = extractWorksheetFormatFeatures(table({
    bodyMerges: [
      { row: 2, start: 1, end: 2 },
      { row: 3, start: 1, end: 2 },
      { row: 4, start: 1, end: 2 },
    ],
  }));

  assert.deepEqual(single.features, repeated.features);
});

test('rectangular vertical merge is excluded from v6 horizontal shape evidence', () => {
  const snapshot = table();
  snapshot.merges = [
    ...(snapshot.merges ?? []),
    { startRow: 2, startColumn: 0, endRow: 3, endColumn: 1 },
  ];

  assert.equal(feature(snapshot, 'layout:body-majority-horizontal-merge-links:'), undefined);
});

test('same labels remain matched when recurring merge disappears, while deviation remains observable', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table({
      labels: ['項目', '値'],
      rows: [['a', '1'], ['b', '2'], ['c', '3']],
      bodyMerges: [
        { row: 2, start: 0, end: 1 },
        { row: 3, start: 0, end: 1 },
        { row: 4, start: 0, end: 1 },
      ],
    }),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table({ labels: ['項目', '値'], rows: [['a', '1'], ['b', '2'], ['c', '3']] }),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.ok((result.match.winner?.deviationScore ?? 0) > 0);
});

test('merge-shape loss plus one renamed column fails closed', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table({
      labels: ['項目', '値'],
      rows: [['a', '1'], ['b', '2'], ['c', '3']],
      bodyMerges: [
        { row: 2, start: 0, end: 1 },
        { row: 3, start: 0, end: 1 },
        { row: 4, start: 0, end: 1 },
      ],
    }),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table({ labels: ['項目', '内容'], rows: [['a', '1'], ['b', '2'], ['c', '3']] }),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
});

test('different recurring merge topology records deviation without forcing a different format by itself', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table({ bodyMerges: [
      { row: 2, start: 0, end: 1 },
      { row: 3, start: 0, end: 1 },
      { row: 4, start: 0, end: 1 },
    ] }),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table({ bodyMerges: [
      { row: 2, start: 1, end: 2 },
      { row: 3, start: 1, end: 2 },
      { row: 4, start: 1, end: 2 },
    ] }),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.ok((result.match.winner?.deviationScore ?? 0) > 0);
});
