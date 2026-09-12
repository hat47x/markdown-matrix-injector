import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSparseFormatSignature,
  matchFormatObservation,
} from '../src/experimental/flyInspiredFormatMatcher.js';

const releaseChecklist = {
  id: 'release-checklist',
  features: [
    'region:title-row',
    'header:dark-fill',
    'column:判定',
    'column:確認者',
    'border:grid',
    'layout:6-columns',
  ],
} as const;

const interfaceDefinition = {
  id: 'interface-definition',
  features: [
    'region:title-row',
    'header:light-fill',
    'column:項目名',
    'column:型',
    'column:桁数',
    'border:thin',
    'layout:8-columns',
  ],
} as const;

test('sparse signature is invariant to feature order and duplicates', () => {
  const first = createSparseFormatSignature(['border:grid', 'header:dark-fill', 'border:grid', 'column:判定']);
  const second = createSparseFormatSignature(['column:判定', 'border:grid', 'header:dark-fill']);

  assert.deepEqual(first, second);
  assert.ok(first.activeIndices.length > 0);
});

test('exact prototype match has confidence 1 and deviation score 0', () => {
  const result = matchFormatObservation(releaseChecklist.features, [releaseChecklist, interfaceDefinition]);

  assert.equal(result.status, 'matched');
  assert.equal(result.winner?.prototypeId, 'release-checklist');
  assert.equal(result.winner?.confidence, 1);
  assert.equal(result.winner?.deviationScore, 0);
  assert.equal(result.noveltyScore, 0);
});

test('minor format deviation remains a candidate without pretending it is exact', () => {
  const observed = releaseChecklist.features.filter((feature) => feature !== 'header:dark-fill');
  const result = matchFormatObservation(observed, [releaseChecklist, interfaceDefinition]);

  assert.equal(result.status, 'matched');
  assert.equal(result.winner?.prototypeId, 'release-checklist');
  assert.ok((result.winner?.confidence ?? 0) >= 0.7);
  assert.ok((result.winner?.deviationScore ?? 0) > 0);
  assert.ok((result.winner?.deviationScore ?? 1) < 0.3);
});

test('unrelated format is reported as novel rather than forced into a known prototype', () => {
  const result = matchFormatObservation([
    'region:diagram',
    'shape:arrow',
    'shape:rounded-box',
    'background:blueprint',
    'layout:free-form',
  ], [releaseChecklist, interfaceDefinition]);

  assert.equal(result.status, 'novel');
  assert.equal(result.winner, undefined);
  assert.ok(result.noveltyScore > 0.5);
});

test('near-tied prototypes are ambiguous and winner-take-all does not auto-select one', () => {
  const result = matchFormatObservation(
    ['a', 'b', 'c'],
    [
      { id: 'left', features: ['a', 'b', 'c'] },
      { id: 'right', features: ['a', 'b', 'c'] },
    ],
  );

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.winner, undefined);
  assert.equal(result.candidates[0]?.confidence, 1);
  assert.equal(result.candidates[1]?.confidence, 1);
});

test('empty observation is novel and produces no candidate', () => {
  const result = matchFormatObservation([], [releaseChecklist]);

  assert.deepEqual(result, {
    status: 'novel',
    candidates: [],
    noveltyScore: 1,
  });
});
