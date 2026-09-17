import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorksheetFormatFeature,
  evaluateWorksheetFormatFeatureFamilyAblation,
  summarizeWorksheetFormatFeatureFamilies,
} from '../src/experimental/worksheetFormatFeatureFamilyAnalysis.js';
import { matchFormatObservation } from '../src/experimental/flyInspiredFormatMatcher.js';

/**
 * Feature-level fixtures for evaluating the current v6 scorer in isolation.
 *
 * These are intentionally not produced by a second feature extractor. The
 * adapter has its own regression suite; here we freeze representative v6
 * vectors so scorer/cardinality effects can be measured without conflating
 * them with header detection or SheetJS behavior.
 */
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
    features.push(`layout:body-majority-horizontal-merge-links:${bodyMergeMask}`);
  }
  return features;
}

function familyShare(features: readonly string[], family: string): number {
  return summarizeWorksheetFormatFeatureFamilies(features)
    .find((entry) => entry.family === family)?.share ?? 0;
}

function candidateConfidence(prototype: readonly string[], observation: readonly string[]): number {
  return matchFormatObservation(
    observation,
    [{ id: 'target', features: prototype }],
  ).candidates[0]?.confidence ?? 0;
}

test('v6 feature prefixes are assigned to auditable analysis families', () => {
  assert.equal(classifyWorksheetFormatFeature('column:項目'), 'semantic-label');
  assert.equal(classifyWorksheetFormatFeature('column-position:1:項目'), 'relative-position');
  assert.equal(classifyWorksheetFormatFeature('layout:first-body-gap:0'), 'table-skeleton');
  assert.equal(classifyWorksheetFormatFeature('layout:body-majority-occupancy:11'), 'body-occupancy');
  assert.equal(classifyWorksheetFormatFeature('merge:body-horizontal-recurring'), 'merge-shape');
  assert.equal(
    classifyWorksheetFormatFeature('layout:body-majority-horizontal-merge-links:100'),
    'merge-shape',
  );
  assert.equal(classifyWorksheetFormatFeature('header:dark-fill'), 'fill');
  assert.equal(classifyWorksheetFormatFeature('border:grid'), 'border');
  assert.equal(classifyWorksheetFormatFeature('future:unknown'), 'other');
});

test('wider tables allocate progressively more feature share to labels and positions', () => {
  const two = tableFeatures(['項目', '値']);
  const three = tableFeatures(['コード', '名称', '説明'], 'light');
  const six = tableFeatures(['ID', '項目', '判定', '確認者', '備考', '期限']);

  assert.equal(two.length, 17);
  assert.equal(three.length, 19);
  assert.equal(six.length, 25);

  assert.equal(familyShare(two, 'semantic-label'), 0.117647);
  assert.equal(familyShare(three, 'semantic-label'), 0.157895);
  assert.equal(familyShare(six, 'semantic-label'), 0.24);
  assert.equal(familyShare(two, 'relative-position'), 0.117647);
  assert.equal(familyShare(six, 'relative-position'), 0.24);

  assert.equal(familyShare(two, 'table-skeleton'), 0.588235);
  assert.equal(familyShare(six, 'table-skeleton'), 0.4);
});

test('the same one-label rename becomes less costly as column count grows', () => {
  const twoBase = tableFeatures(['項目', '値']);
  const twoObservation = tableFeatures(['項目', '内容']);
  const threeBase = tableFeatures(['コード', '名称', '説明'], 'light');
  const threeObservation = tableFeatures(['コード', '表示名', '説明'], 'light');
  const sixBase = tableFeatures(['ID', '項目', '判定', '確認者', '備考', '期限']);
  const sixObservation = tableFeatures(['ID', '項目', '状態', '確認者', '備考', '期限']);

  assert.equal(candidateConfidence(twoBase, twoObservation), 0.785965);
  assert.equal(candidateConfidence(threeBase, threeObservation), 0.8);
  assert.equal(candidateConfidence(sixBase, sixObservation), 0.82963);
});

test('two renamed labels in a six-column table sit immediately below the default gate', () => {
  const baseline = tableFeatures(['ID', '項目', '判定', '確認者', '備考', '期限']);
  const observation = tableFeatures(['ID', '項目', '状態', '担当者', '備考', '期限']);
  const result = matchFormatObservation(observation, [{ id: 'release', features: baseline }]);

  assert.equal(result.status, 'novel');
  assert.equal(result.candidates[0]?.confidence, 0.699204);
});

test('symmetric ablation reveals which families support or penalize a candidate', () => {
  const baseline = tableFeatures(['項目', '値']);
  const observation = tableFeatures(['項目', '内容']);
  const evaluation = evaluateWorksheetFormatFeatureFamilyAblation(
    observation,
    { id: 'settings', features: baseline },
  );

  assert.equal(evaluation.baseline.confidence, 0.785965);

  const semantic = evaluation.families.find((entry) => entry.family === 'semantic-label');
  const positions = evaluation.families.find((entry) => entry.family === 'relative-position');
  const skeleton = evaluation.families.find((entry) => entry.family === 'table-skeleton');

  assert.equal(semantic?.confidenceDelta, -0.091241);
  assert.equal(positions?.confidenceDelta, -0.091241);
  assert.equal(skeleton?.confidenceDelta, 0.230409);
});

test('merge-shape influence is measurable without introducing a new scoring path', () => {
  const baseline = tableFeatures(['区分', '項目', '値', '備考'], 'gray', '100');
  const observation = tableFeatures(['区分', '項目', '内容', '備考'], 'gray');
  const evaluation = evaluateWorksheetFormatFeatureFamilyAblation(
    observation,
    { id: 'grouped-settings', features: baseline },
  );

  assert.equal(evaluation.baseline.confidence, 0.737263);
  const merge = evaluation.families.find((entry) => entry.family === 'merge-shape');
  assert.equal(merge?.confidenceDelta, -0.074331);
});
