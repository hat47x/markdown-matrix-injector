import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDiagnosticPolicy } from '../src/dx/diagnosticPolicy.js';
import type { DocumentDiagnosticItem } from '../src/dx/vscodeAdapters.js';

const item = (line: number, code: string): DocumentDiagnosticItem => ({
  diagnostic: { severity: 'error', code: code as never, message: code, range: { start: 0, end: 1 }, source: 'markdown-matrix-injector', priority: 0 },
  range: { start: { line, character: 0 }, end: { line, character: 10 } },
});
const items = [item(2, 'MMI_SHEET_NOT_FOUND'), item(5, 'MMI_FILE_NOT_FOUND')];
const lines = (list: DocumentDiagnosticItem[]) => list.map((entry) => entry.range.start.line);

test('while typing, the reference under the cursor is held back and already-written ones are still reported', () => {
  assert.deepEqual(lines(applyDiagnosticPolicy(items, { phase: 'authoring', cursorLine: 2 })), [5]);
});

test('review (open, save, leaving the line) reports everything, and so does the full setting', () => {
  assert.deepEqual(lines(applyDiagnosticPolicy(items, { phase: 'review', cursorLine: 2 })), [2, 5]);
  assert.deepEqual(lines(applyDiagnosticPolicy(items, { phase: 'authoring', cursorLine: 2, whileTyping: 'full' })), [2, 5]);
  assert.deepEqual(lines(applyDiagnosticPolicy(items, { phase: 'authoring', cursorLine: 3 })), [2, 5], 'a cursor on another line holds nothing back');
  assert.deepEqual(lines(applyDiagnosticPolicy(items, { phase: 'authoring' })), [2, 5], 'no cursor, nothing to hold back');
});
