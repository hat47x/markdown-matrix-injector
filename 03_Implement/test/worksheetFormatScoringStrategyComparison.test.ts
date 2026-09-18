import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareWorksheetFormatOfflineScoringStrategies,
  evaluateWorksheetFormatBalanceGate,
} from '../src/experimental/worksheetFormatScoringStrategyComparison.js';

function tableFeatures(
  labels: readonly string[],
  fill = 'dark',
  bodyMergeMask?: string,
): string[] {
  const columnCount = labels.length;
  const features = [
    'region:table',
    'header:row',
    'region:title-row',
    `layout:title-span:${columnCount}`,
    'layout:title-header-gap:0',
    'header:fill-present',
    `header:${fill}-fill`,
    `layout:${columnCount}-columns`,
    'layout:header-contiguous',
    'body:present',
    'layout:first-body-gap:0',
    'layout:first-body-coverage:full',
    `layout:body-majority-occupancy:${'1'.repeat(columnCount)}`,
  ];

  labels.forEach((label, index) => {
    features.push(`column:${label}`);
    features.push(`column-position:${index}:${label}`);
  });

  if (bodyMergeMask) {
    features.push('merge:body-horizontal-recurring');
    features.push(
      `layout:body-majority-horizontal-merge-links:${bodyMergeMask}`,
    );
  }
  return features;
}

test('exact match remains identical across offline strategies', () => {
  const features = tableFeatures(['項目', '値']);
  const comparison = compareWorksheetFormatOfflineScoringStrategies(
    features,
    [{ id: 'settings', features }],
  );

  assert.equal(comparison.flat.winner?.confidence, 1);
  assert.equal(comparison.familyNormalized.winner?.confidence, 1);
  assert.equal(comparison.columnFamilyCapped.winner?.confidence, 1);
});

test('one-label rename exposes different width behavior without changing production scoring', () => {
  const two = compareWorksheetFormatOfflineScoringStrategies(
    tableFeatures(['項目', '内容']),
    [{ id: 'two', features: tableFeatures(['項目', '値']) }],
  );
  const six = compareWorksheetFormatOfflineScoringStrategies(
    tableFeatures(['ID', '項目', '状態', '確認者', '備考', '期限']),
    [{
      id: 'six',
      features: tableFeatures(['ID', '項目', '判定', '確認者', '備考', '期限']),
    }],
  );

  assert.equal(two.flat.winner?.confidence, 0.785965);
  assert.equal(two.familyNormalized.winner?.confidence, 0.746667);
  assert.equal(two.columnFamilyCapped.winner?.confidence, 0.785965);

  assert.equal(six.flat.winner?.confidence, 0.82963);
  assert.equal(six.familyNormalized.winner?.confidence, 0.853333);
  assert.equal(six.columnFamilyCapped.winner?.confidence, 0.870175);
});

test('family normalization and column capping turn the established six-column near-gate novel case into matches', () => {
  const prototype =
    tableFeatures(['ID', '項目', '判定', '確認者', '備考', '期限']);
  const observation =
    tableFeatures(['ID', '項目', '状態', '担当者', '備考', '期限']);
  const comparison = compareWorksheetFormatOfflineScoringStrategies(
    observation,
    [{ id: 'release', features: prototype }],
  );

  assert.equal(comparison.flat.status, 'novel');
  assert.equal(comparison.flat.candidates[0]?.confidence, 0.699204);

  assert.equal(comparison.familyNormalized.status, 'matched');
  assert.equal(comparison.familyNormalized.winner?.confidence, 0.752308);

  assert.equal(comparison.columnFamilyCapped.status, 'matched');
  assert.equal(comparison.columnFamilyCapped.winner?.confidence, 0.781781);
});

test('clearly different two-column labels remain novel under family normalization and the configured cap', () => {
  const comparison = compareWorksheetFormatOfflineScoringStrategies(
    tableFeatures(['コード', '名称']),
    [{ id: 'settings', features: tableFeatures(['項目', '値']) }],
  );

  assert.equal(comparison.flat.status, 'novel');
  assert.equal(comparison.familyNormalized.status, 'novel');
  assert.equal(comparison.columnFamilyCapped.status, 'novel');
});

test('near-tied candidates remain ambiguous across all compared score formulas', () => {
  const observation = tableFeatures(['項目', '内容']);
  const prototypes = [
    { id: 'value', features: tableFeatures(['項目', '値']) },
    { id: 'description', features: tableFeatures(['項目', '説明']) },
  ];
  const comparison =
    compareWorksheetFormatOfflineScoringStrategies(observation, prototypes);

  assert.equal(comparison.flat.status, 'ambiguous');
  assert.equal(comparison.familyNormalized.status, 'ambiguous');
  assert.equal(comparison.columnFamilyCapped.status, 'ambiguous');
});

test('balance gate preserves flat classification and surfaces near-threshold and wide-family risks', () => {
  const near = evaluateWorksheetFormatBalanceGate(
    tableFeatures(['ID', '項目', '状態', '担当者', '備考', '期限']),
    [{
      id: 'release',
      features: tableFeatures(['ID', '項目', '判定', '確認者', '備考', '期限']),
    }],
  );
  assert.equal(near.match.status, 'novel');
  assert.ok(
    near.warnings.some((warning) => warning.code === 'confidence-near-gate'),
  );

  const wideLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const wide = evaluateWorksheetFormatBalanceGate(
    tableFeatures(wideLabels),
    [{ id: 'wide', features: tableFeatures(wideLabels) }],
  );
  assert.equal(wide.match.status, 'matched');
  assert.ok(
    wide.warnings.some((warning) => warning.code === 'column-family-share-high'),
  );
});
