import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';
import {
  extractWorksheetFormatFeatures,
  type FormatFillTone,
  type WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

function twoColumnSnapshot(
  labels: readonly [string, string] = ['項目', '値'],
  fillTone?: Exclude<FormatFillTone, 'none' | 'other'>,
): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: '設定表' },
      { row: 1, column: 0, text: labels[0], ...(fillTone ? { fillTone } : {}) },
      { row: 1, column: 1, text: labels[1], ...(fillTone ? { fillTone } : {}) },
      { row: 2, column: 0, text: 'timeout' },
      { row: 2, column: 1, text: '30' },
    ],
    merges: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }],
  };
}

test('adapter emits coarse and fine-grained hierarchical features together', () => {
  const observation = extractWorksheetFormatFeatures(twoColumnSnapshot(['項目', '値'], 'dark'));

  assert.ok(observation.features.includes('region:table'));
  assert.ok(observation.features.includes('header:row'));
  assert.ok(observation.features.includes('header:fill-present'));
  assert.ok(observation.features.includes('header:dark-fill'));
  assert.ok(observation.features.includes('column:項目'));
  assert.ok(observation.features.includes('column:値'));
  assert.ok(observation.features.includes('layout:2-columns'));
});

test('feature contract is versioned as worksheet-format-v3', () => {
  assert.equal(WORKSHEET_FORMAT_FEATURE_VERSION, 'worksheet-format-v3');
});

test('two-column fill tone drift remains a candidate at the default threshold', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    twoColumnSnapshot(['項目', '値'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    twoColumnSnapshot(['項目', '値'], 'gray'),
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(result.match.status, 'matched');
  assert.equal(result.match.winner?.prototypeId, 'settings');
  assert.ok((result.match.winner?.confidence ?? 0) >= 0.7);
  assert.ok((result.match.winner?.deviationScore ?? 0) > 0);
});

test('two-column missing fill and one renamed column remain candidates without lowering thresholds', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    twoColumnSnapshot(['項目', '値'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const noFill = matchWorksheetFormatSnapshot(
    twoColumnSnapshot(['項目', '値']),
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  assert.equal(noFill.match.status, 'matched');
  assert.ok((noFill.match.winner?.confidence ?? 0) >= 0.7);

  const renamed = matchWorksheetFormatSnapshot(
    twoColumnSnapshot(['項目', '内容'], 'dark'),
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  assert.equal(renamed.match.status, 'matched');
  assert.ok((renamed.match.winner?.confidence ?? 0) >= 0.7);
});

test('same-shaped table with both column labels changed remains novel', () => {
  const prototype = createWorksheetFormatPrototype(
    'settings',
    twoColumnSnapshot(['項目', '値'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    twoColumnSnapshot(['コード', '名称'], 'dark'),
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(result.match.status, 'novel');
  assert.equal(result.match.winner, undefined);
});

test('equidistant two-column prototypes remain ambiguous', () => {
  const left = createWorksheetFormatPrototype(
    'value-table',
    twoColumnSnapshot(['項目', '値'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const right = createWorksheetFormatPrototype(
    'description-table',
    twoColumnSnapshot(['項目', '説明'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    twoColumnSnapshot(['項目', '内容'], 'dark'),
    [left, right],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(result.match.status, 'ambiguous');
  assert.equal(result.match.winner, undefined);
  assert.equal(result.match.candidates[0]?.confidence, result.match.candidates[1]?.confidence);
});

test('structure-only profile excludes both coarse and fine fill features', () => {
  const profile = { id: 'structure-only-v1', evidence: ['structure'] as const };
  const prototype = createWorksheetFormatPrototype(
    'settings',
    twoColumnSnapshot(['項目', '値'], 'dark'),
    profile,
  );

  assert.ok(!prototype.features.includes('header:fill-present'));
  assert.ok(!prototype.features.includes('header:dark-fill'));
  assert.ok(prototype.features.includes('header:row'));
  assert.ok(prototype.features.includes('region:table'));
});
