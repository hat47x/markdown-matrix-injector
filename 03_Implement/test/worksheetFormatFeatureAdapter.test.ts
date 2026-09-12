import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatCell,
  type WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import { matchFormatObservation } from '../src/experimental/flyInspiredFormatMatcher.js';

function releaseSnapshot(fillTone: 'dark' | 'gray' = 'dark'): WorksheetFormatSnapshot {
  const cells: WorksheetFormatCell[] = [
    { row: 0, column: 0, text: 'リリース判定表' },
    { row: 1, column: 0, text: 'ID', fillTone, borderKind: 'grid' },
    { row: 1, column: 1, text: '項目', fillTone, borderKind: 'grid' },
    { row: 1, column: 2, text: '判定', fillTone, borderKind: 'grid' },
    { row: 1, column: 3, text: '確認者', fillTone, borderKind: 'grid' },
    { row: 1, column: 4, text: '備考', fillTone, borderKind: 'grid' },
    { row: 1, column: 5, text: '期限', fillTone, borderKind: 'grid' },
    { row: 2, column: 0, text: 'R-001', borderKind: 'grid' },
    { row: 2, column: 1, text: '疎通確認', borderKind: 'grid' },
    { row: 2, column: 2, text: 'OK', borderKind: 'grid' },
    { row: 2, column: 3, text: '佐藤', borderKind: 'grid' },
    { row: 2, column: 4, text: '', borderKind: 'grid' },
    { row: 2, column: 5, text: '2026-09-30', borderKind: 'grid' },
  ];
  return { cells, merges: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 5 }] };
}

test('extracts title, style, all header labels, border and layout features', () => {
  const observation = extractWorksheetFormatFeatures(releaseSnapshot());
  assert.equal(observation.headerRow, 1);
  assert.deepEqual(observation.headerColumns, [0, 1, 2, 3, 4, 5]);
  for (const expected of [
    'region:title-row', 'header:dark-fill', 'column:ID', 'column:項目',
    'column:判定', 'column:確認者', 'column:備考', 'column:期限',
    'border:grid', 'layout:6-columns',
  ]) assert.ok(observation.features.includes(expected), expected);

  const result = matchFormatObservation(observation.features, [{
    id: 'release-checklist', features: observation.features,
  }]);
  assert.equal(result.status, 'matched');
  assert.equal(result.winner?.confidence, 1);
});

test('style evidence selects the real header over a two-cell metadata preamble', () => {
  const base = releaseSnapshot();
  const observation = extractWorksheetFormatFeatures({
    ...base,
    cells: [
      { row: 0, column: 0, text: '文書名' },
      { row: 0, column: 1, text: 'リリース判定表' },
      ...base.cells.map((cell) => ({ ...cell, row: cell.row + 2 })),
    ],
    merges: [{ startRow: 2, startColumn: 0, endRow: 2, endColumn: 5 }],
  });
  assert.equal(observation.headerRow, 3);
  assert.ok(observation.features.includes('header:dark-fill'));
  assert.ok(observation.features.includes('layout:6-columns'));
});

test('preserves fill drift and matcher keeps it as a non-exact candidate', () => {
  const reference = extractWorksheetFormatFeatures(releaseSnapshot('dark'));
  const drift = extractWorksheetFormatFeatures(releaseSnapshot('gray'));
  assert.ok(drift.features.includes('header:gray-fill'));
  assert.ok(!drift.features.includes('header:dark-fill'));

  const result = matchFormatObservation(drift.features, [{ id: 'release-checklist', features: reference.features }]);
  assert.equal(result.status, 'matched');
  assert.equal(result.winner?.prototypeId, 'release-checklist');
  assert.ok((result.winner?.deviationScore ?? 0) > 0);
});

test('feature extraction is invariant to input cell order', () => {
  const snapshot = releaseSnapshot();
  const reversed = { ...snapshot, cells: [...snapshot.cells].reverse() };
  assert.deepEqual(extractWorksheetFormatFeatures(reversed), extractWorksheetFormatFeatures(snapshot));
});

test('non-tabular snapshot stops without inventing a header', () => {
  const observation = extractWorksheetFormatFeatures({
    cells: [{ row: 0, column: 0, text: '自由記述' }, { row: 1, column: 0, text: '長い説明文' }],
  });
  assert.deepEqual(observation, { features: [], headerColumns: [] });
});

test('invalid or duplicate coordinates are rejected', () => {
  assert.throws(() => extractWorksheetFormatFeatures({ cells: [{ row: -1, column: 0, text: 'x' }] }), /non-negative integer/);
  assert.throws(() => extractWorksheetFormatFeatures({
    cells: [{ row: 0, column: 0, text: 'a' }, { row: 0, column: 0, text: 'b' }],
  }), /Duplicate worksheet cell coordinate/);
});
