import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

function threeColumnSnapshot(
  labels: readonly [string, string, string] = ['ID', '項目', '値'],
  columns: readonly [number, number, number] = [2, 3, 4],
  titleEndColumn = 4,
  headerRow = 1,
  bodyRow = 2,
  bodyColumns: readonly number[] = columns,
): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: columns[0], text: '設定表' },
      { row: headerRow, column: columns[0], text: labels[0] },
      { row: headerRow, column: columns[1], text: labels[1] },
      { row: headerRow, column: columns[2], text: labels[2] },
      ...bodyColumns.map((column, index) => ({
        row: bodyRow,
        column,
        text: ['01', 'timeout', '30'][index] ?? 'x',
      })),
    ],
    merges: [{
      startRow: 0,
      startColumn: columns[0],
      endRow: 0,
      endColumn: titleEndColumn,
    }],
  };
}

test('feature contract is versioned as worksheet-format-v6', () => {
  assert.equal(WORKSHEET_FORMAT_FEATURE_VERSION, 'worksheet-format-v6');
});

test('column-position features are relative to the table start', () => {
  const base = extractWorksheetFormatFeatures(threeColumnSnapshot());
  const shifted = extractWorksheetFormatFeatures(
    threeColumnSnapshot(['ID', '項目', '値'], [7, 8, 9], 9, 1, 2, [7, 8, 9]),
  );

  assert.deepEqual(base.features, shifted.features);
  assert.ok(base.features.includes('column-position:0:ID'));
  assert.ok(base.features.includes('column-position:1:項目'));
  assert.ok(base.features.includes('column-position:2:値'));
});

test('same labels in a different order retain structural deviation evidence', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    threeColumnSnapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    threeColumnSnapshot(['ID', '値', '項目']),
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.ok(result.comparedFeatures.includes('column-position:1:値'));
  assert.ok((result.match.candidates[0]?.deviationScore ?? 0) > 0);
});

test('contiguous and gapped headers are distinguished without style evidence', () => {
  const contiguous = extractWorksheetFormatFeatures(threeColumnSnapshot());
  const gapped = extractWorksheetFormatFeatures(
    threeColumnSnapshot(['ID', '項目', '値'], [2, 4, 5], 5, 1, 2, [2, 4, 5]),
  );

  assert.ok(contiguous.features.includes('layout:header-contiguous'));
  assert.ok(gapped.features.includes('layout:header-gapped'));
});

test('title merge overlap span and title-header gap are retained as structural features', () => {
  const adjacent = extractWorksheetFormatFeatures(threeColumnSnapshot());
  const delayedHeader = extractWorksheetFormatFeatures(
    threeColumnSnapshot(['ID', '項目', '値'], [2, 3, 4], 4, 2, 3, [2, 3, 4]),
  );

  assert.ok(adjacent.features.includes('layout:title-span:3'));
  assert.ok(adjacent.features.includes('layout:title-header-gap:0'));
  assert.ok(delayedHeader.features.includes('layout:title-header-gap:1'));
});

test('first body row presence, gap, coverage, and majority occupancy are structural evidence', () => {
  const full = extractWorksheetFormatFeatures(threeColumnSnapshot());
  const delayed = extractWorksheetFormatFeatures(
    threeColumnSnapshot(['ID', '項目', '値'], [2, 3, 4], 4, 1, 4, [2, 3, 4]),
  );
  const partial = extractWorksheetFormatFeatures(
    threeColumnSnapshot(['ID', '項目', '値'], [2, 3, 4], 4, 1, 2, [2, 3]),
  );

  assert.ok(full.features.includes('body:present'));
  assert.ok(full.features.includes('layout:first-body-gap:0'));
  assert.ok(full.features.includes('layout:first-body-coverage:full'));
  assert.ok(full.features.includes('layout:body-majority-occupancy:111'));
  assert.ok(delayed.features.includes('layout:first-body-gap:2'));
  assert.ok(partial.features.includes('layout:first-body-coverage:partial'));
  assert.ok(partial.features.includes('layout:body-majority-occupancy:110'));
});
