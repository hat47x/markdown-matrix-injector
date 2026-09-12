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
): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: columns[0], text: '設定表' },
      { row: 1, column: columns[0], text: labels[0] },
      { row: 1, column: columns[1], text: labels[1] },
      { row: 1, column: columns[2], text: labels[2] },
      { row: 2, column: columns[0], text: '01' },
      { row: 2, column: columns[1], text: 'timeout' },
      { row: 2, column: columns[2], text: '30' },
    ],
    merges: [{
      startRow: 0,
      startColumn: columns[0],
      endRow: 0,
      endColumn: titleEndColumn,
    }],
  };
}

test('feature contract is versioned as worksheet-format-v3', () => {
  assert.equal(WORKSHEET_FORMAT_FEATURE_VERSION, 'worksheet-format-v3');
});

test('column-position features are relative to the table start', () => {
  const base = extractWorksheetFormatFeatures(threeColumnSnapshot());
  const shifted = extractWorksheetFormatFeatures(threeColumnSnapshot(['ID', '項目', '値'], [7, 8, 9], 9));

  assert.deepEqual(base.features, shifted.features);
  assert.ok(base.features.includes('column-position:0:ID'));
  assert.ok(base.features.includes('column-position:1:項目'));
  assert.ok(base.features.includes('column-position:2:値'));
});

test('same labels in a different order retain structural deviation evidence', () => {
  const baseline = threeColumnSnapshot(['ID', '項目', '値']);
  const reordered = threeColumnSnapshot(['ID', '値', '項目']);
  const prototype = createWorksheetFormatPrototype(
    'settings',
    baseline,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    reordered,
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.ok(result.comparedFeatures.includes('column-position:1:値'));
  assert.ok((result.match.candidates[0]?.deviationScore ?? 0) > 0);
});

test('contiguous and gapped headers are distinguished without style evidence', () => {
  const contiguous = extractWorksheetFormatFeatures(threeColumnSnapshot());
  const gapped = extractWorksheetFormatFeatures(threeColumnSnapshot(['ID', '項目', '値'], [2, 4, 5], 5));

  assert.ok(contiguous.features.includes('layout:header-contiguous'));
  assert.ok(gapped.features.includes('layout:header-gapped'));
});

test('title merge overlap span is retained as a structural feature', () => {
  const fullSpan = extractWorksheetFormatFeatures(threeColumnSnapshot(['ID', '項目', '値'], [2, 3, 4], 4));
  const partialSpan = extractWorksheetFormatFeatures(threeColumnSnapshot(['ID', '項目', '値'], [2, 3, 4], 3));

  assert.ok(fullSpan.features.includes('layout:title-span:3'));
  assert.ok(partialSpan.features.includes('layout:title-span:2'));
});
