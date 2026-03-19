import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOCOMPLETE_QUERY_PARAM_CANDIDATES,
  classifyAutocompleteStage,
  getAutocompleteCandidates,
} from '../src/dx/autocompleteProvider.js';

test('classifyAutocompleteStage keeps filepath stage for opening embeds and partial file paths', () => {
  assert.equal(classifyAutocompleteStage('![['), 'filepath');
  assert.equal(classifyAutocompleteStage('![[docs/spec'), 'filepath');
  assert.equal(classifyAutocompleteStage('prefix ![[docs/spec'), 'filepath');
});

test('classifyAutocompleteStage detects sheet-or-range stage across unfinished # and | input', () => {
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#'), 'sheet-or-range');
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#Sheet1'), 'sheet-or-range');
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#Sheet1|'), 'sheet-or-range');
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx|A1:C3'), 'sheet-or-range');
});

test('classifyAutocompleteStage detects query parameter stage across unfinished ? and & input', () => {
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#Sheet1|A1:C3?'), 'query-params');
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#Sheet1|A1:C3?mode=table'), 'query-params');
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#Sheet1|A1:C3?mode=table&'), 'query-params');
  assert.equal(classifyAutocompleteStage('![[docs/spec.xlsx#Sheet1|A1:C3?mode=table&header'), 'query-params');
});

test('getAutocompleteCandidates returns file candidates for filepath stage', () => {
  const candidates = getAutocompleteCandidates('![[docs/', {
    files: ['./roles.csv', './states.xlsx'],
    sheets: ['Sheet1'],
  });

  assert.deepEqual(candidates, [
    { label: './roles.csv', insertText: './roles.csv', kind: 'file' },
    { label: './states.xlsx', insertText: './states.xlsx', kind: 'file' },
  ]);
});

test('getAutocompleteCandidates returns sheet candidates for sheet-or-range stage', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sh', {
    files: ['./roles.csv'],
    sheets: ['Sheet1', 'Summary', 'A1:C3'],
  });

  assert.deepEqual(candidates, [
    { label: 'Sheet1', insertText: 'Sheet1', kind: 'sheet' },
    { label: 'Summary', insertText: 'Summary', kind: 'sheet' },
    { label: 'A1:C3', insertText: 'A1:C3', kind: 'sheet' },
  ]);
});

test('getAutocompleteCandidates returns the phase 5 query parameter set for query stage', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|A1:C3?mode=table&', {
    files: ['./roles.csv'],
    sheets: ['Sheet1'],
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    AUTOCOMPLETE_QUERY_PARAM_CANDIDATES,
  );
  assert.ok(candidates.every((candidate) => candidate.kind === 'query-param'));
  assert.ok(candidates.every((candidate) => candidate.label === candidate.insertText));
});

test('getAutocompleteCandidates allows overriding query parameter candidates when needed', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|A1:C3?', {
    files: ['./roles.csv'],
    sheets: ['Sheet1'],
    queryParams: ['mode', 'caption'],
  });

  assert.deepEqual(candidates, [
    { label: 'mode', insertText: 'mode', kind: 'query-param' },
    { label: 'caption', insertText: 'caption', kind: 'query-param' },
  ]);
});
