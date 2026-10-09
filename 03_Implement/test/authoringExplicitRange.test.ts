import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeExplicitRangeInput,
} from '../src/dx/authoringFlow.js';

test('explicit range input accepts and normalizes valid A1 ranges', () => {
  assert.equal(normalizeExplicitRangeInput('a1:d20'), 'A1:D20');
  assert.equal(normalizeExplicitRangeInput(' B3 '), 'B3');
  assert.equal(
    normalizeExplicitRangeInput('XFD1048576'),
    'XFD1048576',
  );
});

test('explicit range input rejects malformed, reversed and out-of-sheet ranges', () => {
  for (const value of [
    '',
    'A0',
    'A1:',
    'A1:D',
    'D20:A1',
    'XFE1',
    'A1048577',
    'Sheet1!A1:B2',
  ]) {
    assert.equal(
      normalizeExplicitRangeInput(value),
      undefined,
      value,
    );
  }
});
