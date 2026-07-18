import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOCOMPLETE_QUERY_PARAM_CANDIDATES,
  classifyAutocompleteStage,
  getAutocompleteDependencyProfile,
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

test('getAutocompleteDependencyProfile isolates workbook metadata to sheet and range completion only', () => {
  assert.deepEqual(getAutocompleteDependencyProfile('![[docs/spec'), {
    stage: 'filepath',
    requiresWorkspaceFileList: true,
    requiresWorkbookMetadata: false,
    usesQueryParamCatalog: false,
  });
  assert.deepEqual(getAutocompleteDependencyProfile('![[docs/spec.xlsx#'), {
    stage: 'sheet-or-range',
    requiresWorkspaceFileList: false,
    requiresWorkbookMetadata: true,
    usesQueryParamCatalog: false,
  });
  assert.deepEqual(getAutocompleteDependencyProfile('![[docs/spec.xlsx#Sheet1|A1:C3?he'), {
    stage: 'query-params',
    requiresWorkspaceFileList: false,
    requiresWorkbookMetadata: false,
    usesQueryParamCatalog: true,
  });
});

test('getAutocompleteCandidates returns filtered file candidates for filepath stage', () => {
  const candidates = getAutocompleteCandidates('![[st', {
    files: ['./roles.csv', './states.xlsx', './summary.xml'],
    sheets: ['Sheet1'],
  });

  assert.deepEqual(candidates, [
    { label: './states.xlsx', insertText: './states.xlsx', kind: 'file' },
  ]);
});

test('getAutocompleteCandidates returns sheet candidates after # input', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#sum', {
    files: ['./roles.csv'],
    sheets: ['Sheet1', 'Summary', 'Weekly Summary'],
    ranges: ['A1:C3'],
  });

  assert.deepEqual(candidates, [
    { label: 'Summary', insertText: 'Summary', kind: 'sheet' },
    { label: 'Weekly Summary', insertText: 'Weekly Summary', kind: 'sheet' },
  ]);
});

test('getAutocompleteCandidates returns range candidates after | input', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|b2', {
    files: ['./roles.csv'],
    sheets: ['Sheet1', 'Summary'],
    ranges: ['A1:C3', 'B2:D8', 'B20:D30'],
  });

  assert.deepEqual(candidates, [
    { label: 'B2:D8', insertText: 'B2:D8', kind: 'range' },
    { label: 'B20:D30', insertText: 'B20:D30', kind: 'range' },
  ]);
});

test('getAutocompleteCandidates falls back to sheet candidates as range suggestions when explicit ranges are unavailable', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|a1', {
    files: ['./roles.csv'],
    sheets: ['A1:C3', 'B2:D4'],
  });

  assert.deepEqual(candidates, [
    { label: 'A1:C3', insertText: 'A1:C3', kind: 'range' },
  ]);
});

test('getAutocompleteCandidates returns the phase 5 query parameter set for query stage', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|A1:C3?mode=table&', {
    files: ['./roles.csv'],
    sheets: ['Sheet1'],
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    AUTOCOMPLETE_QUERY_PARAM_CANDIDATES.filter((candidate) => candidate !== 'mode'),
  );
  assert.ok(candidates.every((candidate) => candidate.kind === 'query-param'));
  assert.ok(candidates.every((candidate) => candidate.insertText === `${candidate.label}=`));
});

test('getAutocompleteCandidates filters query parameter candidates by active fragment', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|A1:C3?he', {
    files: ['./roles.csv'],
    sheets: ['Sheet1'],
  });

  assert.deepEqual(candidates, [
    { label: 'header', insertText: 'header=', kind: 'query-param' },
  ]);
});

test('getAutocompleteCandidates allows overriding query parameter candidates when needed', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|A1:C3?ca', {
    files: ['./roles.csv'],
    sheets: ['Sheet1'],
    queryParams: ['mode', 'caption'],
  });

  assert.deepEqual(candidates, [
    { label: 'caption', insertText: 'caption=', kind: 'query-param' },
  ]);
});

test('getAutocompleteCandidates does not re-suggest an already assigned active query parameter name', () => {
  const candidates = getAutocompleteCandidates('![[docs/spec.xlsx#Sheet1|A1:C3?mode=table&header=', {
    files: ['./roles.csv'],
    sheets: ['Sheet1'],
  });

  assert.equal(candidates.some((candidate) => candidate.label === 'header'), false);
  assert.equal(candidates.some((candidate) => candidate.label === 'mode'), false);
});
