import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWorksheetFormatFeatures,
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

type BodyRow = readonly (string | undefined)[];

/**
 * Builds a small table with an arbitrary number of body rows. The values are
 * deliberately meaningless; this suite verifies column occupancy only.
 */
function table(
  labels: readonly string[],
  rows: readonly BodyRow[],
  startColumn = 0,
): WorksheetFormatSnapshot {
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

  return {
    cells,
    merges: [{
      startRow: 0,
      startColumn,
      endRow: 0,
      endColumn: startColumn + labels.length - 1,
    }],
  };
}

function feature(snapshot: WorksheetFormatSnapshot, prefix: string): string | undefined {
  return extractWorksheetFormatFeatures(snapshot).features.find((value) => value.startsWith(prefix));
}

test('feature contract is versioned as worksheet-format-v5', () => {
  assert.equal(WORKSHEET_FORMAT_FEATURE_VERSION, 'worksheet-format-v5');
});

test('majority occupancy summarizes repeated body rows without inspecting value meaning', () => {
  const snapshot = table(['項目', '値'], [
    ['a', '1'],
    ['b', undefined],
    ['c', '3'],
  ]);

  assert.equal(
    feature(snapshot, 'layout:body-majority-occupancy:'),
    'layout:body-majority-occupancy:11',
  );
});

test('single-row and repeated full rows produce the same structural feature set', () => {
  const single = extractWorksheetFormatFeatures(table(['項目', '値'], [['a', '1']])).features;
  const repeated = extractWorksheetFormatFeatures(table(['項目', '値'], [
    ['a', '1'],
    ['b', '2'],
    ['c', '3'],
  ])).features;

  assert.deepEqual(single, repeated);
});

test('horizontal movement keeps occupancy evidence relative to the table', () => {
  const left = extractWorksheetFormatFeatures(table(
    ['項目', '値'],
    [['a', '1'], ['b', '2'], ['c', '3']],
    0,
  )).features;
  const shifted = extractWorksheetFormatFeatures(table(
    ['項目', '値'],
    [['a', '1'], ['b', '2'], ['c', '3']],
    7,
  )).features;

  assert.deepEqual(left, shifted);
});

test('a recurring empty column changes the majority occupancy mask', () => {
  const snapshot = table(['項目', '値'], [
    ['a', '1'],
    ['b', undefined],
    ['c', undefined],
  ]);

  assert.equal(
    feature(snapshot, 'layout:body-majority-occupancy:'),
    'layout:body-majority-occupancy:10',
  );
});

test('the fifth body row does not change the bounded four-row sample', () => {
  const fourRows = table(['項目', '値'], [
    ['a', '1'],
    ['b', '2'],
    ['c', '3'],
    ['d', '4'],
  ]);
  const fiveRows = table(['項目', '値'], [
    ['a', '1'],
    ['b', '2'],
    ['c', '3'],
    ['d', '4'],
    ['e', undefined],
  ]);

  assert.deepEqual(
    extractWorksheetFormatFeatures(fourRows).features,
    extractWorksheetFormatFeatures(fiveRows).features,
  );
});

test('structure-only one-label rename remains matched with stable occupancy', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table(['項目', '値'], [['a', '1'], ['b', '2'], ['c', '3']]),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table(['項目', '内容'], [['x', '9'], ['y', '8'], ['z', '7']]),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.equal(result.match.winner?.prototypeId, 'settings');
  assert.ok((result.match.winner?.confidence ?? 0) >= 0.7);
});

test('one intermittent blank does not erase the recurring full occupancy pattern', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table(['項目', '値'], [['a', '1'], ['b', '2'], ['c', '3']]),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table(['項目', '内容'], [['x', '9'], ['y', undefined], ['z', '7']]),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.ok(result.observation.features.includes('layout:body-majority-occupancy:11'));
  assert.equal(result.match.status, 'matched');
});

test('recurring occupancy deviation with a renamed column remains fail-closed', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table(['項目', '値'], [['a', '1'], ['b', '2'], ['c', '3']]),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table(['項目', '内容'], [['x', '9'], ['y', undefined], ['z', undefined]]),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.ok(result.observation.features.includes('layout:body-majority-occupancy:10'));
  assert.equal(result.match.status, 'novel');
});

test('both labels changed remain novel after occupancy evidence is added', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table(['項目', '値'], [['a', '1'], ['b', '2'], ['c', '3']]),
    STRUCTURE_ONLY_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    table(['コード', '名称'], [['x', '9'], ['y', '8'], ['z', '7']]),
    [prototype],
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
});

test('structure-only profile retains majority occupancy as structure evidence', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    table(['項目', '値'], [['a', '1'], ['b', '2'], ['c', '3']]),
    STRUCTURE_ONLY_PROFILE,
  );

  assert.ok(prototype.features.includes('layout:body-majority-occupancy:11'));
});

test('missing body evidence does not invent a majority occupancy feature', () => {
  const snapshot = table(['項目', '値'], []);
  assert.equal(feature(snapshot, 'layout:body-majority-occupancy:'), undefined);
});

test('near-tied viable candidates remain ambiguous after v5 evidence', () => {
  const candidates = [
    createWorksheetFormatPrototype(
      'value',
      table(['項目', '値'], [['a', '1'], ['b', '2'], ['c', '3']]),
      STRUCTURE_ONLY_PROFILE,
    ),
    createWorksheetFormatPrototype(
      'description',
      table(['項目', '説明'], [['a', '1'], ['b', '2'], ['c', '3']]),
      STRUCTURE_ONLY_PROFILE,
    ),
  ];
  const result = matchWorksheetFormatSnapshot(
    table(['項目', '内容'], [['x', '9'], ['y', '8'], ['z', '7']]),
    candidates,
    STRUCTURE_ONLY_PROFILE,
  );

  assert.equal(result.match.status, 'ambiguous');
  const first = result.match.candidates[0]?.confidence ?? 0;
  const second = result.match.candidates[1]?.confidence ?? 0;
  assert.ok(Math.abs(first - second) < 0.05);
});

test('invalid maxBodyOccupancyRows fails closed', () => {
  assert.throws(
    () => extractWorksheetFormatFeatures(
      table(['項目', '値'], [['a', '1']]),
      { maxBodyOccupancyRows: 0 },
    ),
    /positive integer/,
  );
});
