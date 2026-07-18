import test from 'node:test';
import assert from 'node:assert/strict';
import { getScenarioTemplateCandidates, SCENARIO_OBSERVATION_TEMPLATE } from '../src/dx/scenarioTemplate.js';

test('SCENARIO_OBSERVATION_TEMPLATE provides the canonical four-section headings', () => {
  assert.equal(SCENARIO_OBSERVATION_TEMPLATE, '## 前提\n\n## 手順\n\n## 期待結果\n\n## 制約\n');
});

test('getScenarioTemplateCandidates suggests template headings only in markdown heading context', () => {
  const candidates = getScenarioTemplateCandidates('', '## ');

  assert.deepEqual(candidates.map((candidate) => candidate.label), [
    '観測テンプレート: 前提',
    '観測テンプレート: 手順',
    '観測テンプレート: 期待結果',
    '観測テンプレート: 制約',
  ]);

  assert.deepEqual(getScenarioTemplateCandidates('', 'plain text'), []);
});

test('getScenarioTemplateCandidates suppresses duplicate section suggestions and keeps fragment filter', () => {
  const documentText = ['## 前提', '', 'details', '', '## 制約'].join('\n');

  const allCandidates = getScenarioTemplateCandidates(documentText, '## ');
  assert.deepEqual(allCandidates.map((candidate) => candidate.insertText), ['## 手順', '## 期待結果']);

  const filteredCandidates = getScenarioTemplateCandidates(documentText, '## 期');
  assert.deepEqual(filteredCandidates.map((candidate) => candidate.insertText), ['## 期待結果']);
});
