import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSmartFallback,
  shouldRenderAsCardAfterLoad,
  type SmartFallbackInput,
} from '../src/core/smartFallback.js';
import { type EmbedQuery } from '../src/parser/embedSyntax.js';
import { type WorkbookData } from '../src/core/workbookLoader.js';

function createInput(overrides: Partial<SmartFallbackInput> = {}): SmartFallbackInput {
  return {
    mode: undefined,
    hasSheetTarget: true,
    rowCount: 5,
    columnCount: 5,
    cellCount: 25,
    ...overrides,
  };
}

function createQuery(overrides: Partial<EmbedQuery> = {}): EmbedQuery {
  return {
    filepath: './roles.csv',
    target: 'Sheet1',
    range: undefined,
    params: new URLSearchParams(),
    raw: '![[./roles.csv#Sheet1]]',
    ...overrides,
  };
}

function createWorkbook(rows: string[][]): WorkbookData {
  return {
    sheets: {
      Sheet1: rows,
    },
  };
}

test('evaluateSmartFallback returns structured card decision for mode=card', () => {
  const decision = evaluateSmartFallback(createInput({ mode: 'card' }));

  assert.deepEqual(decision, {
    renderMode: 'card',
    reasons: ['explicit-card-mode'],
    metrics: {
      rowCount: 5,
      columnCount: 5,
      cellCount: 25,
    },
  });
});

test('evaluateSmartFallback keeps table mode for mode=table even when thresholds are exceeded', () => {
  const decision = evaluateSmartFallback(
    createInput({
      mode: 'table',
      rowCount: 46,
      columnCount: 11,
      cellCount: 506,
    }),
  );

  assert.equal(decision.renderMode, 'table');
  assert.deepEqual(decision.reasons, ['explicit-table-mode']);
  assert.deepEqual(decision.metrics, {
    rowCount: 46,
    columnCount: 11,
    cellCount: 506,
  });
});

test('shouldRenderAsCardAfterLoad keeps table rendering when mode=table overrides a wide workbook', () => {
  const workbook = createWorkbook([
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
  ]);

  const shouldRenderCard = shouldRenderAsCardAfterLoad(
    createQuery({ params: new URLSearchParams('mode=table') }),
    workbook,
  );

  assert.equal(shouldRenderCard, false);
});

test('evaluateSmartFallback keeps table mode at the 10-column boundary', () => {
  const decision = evaluateSmartFallback(createInput({ columnCount: 10, cellCount: 100 }));

  assert.equal(decision.renderMode, 'table');
  assert.deepEqual(decision.reasons, ['within-table-threshold']);
});

test('evaluateSmartFallback switches to card mode at 11 columns', () => {
  const decision = evaluateSmartFallback(createInput({ columnCount: 11, cellCount: 110 }));

  assert.equal(decision.renderMode, 'card');
  assert.deepEqual(decision.reasons, ['column-threshold-exceeded']);
});

test('evaluateSmartFallback keeps table mode at the 500-cell boundary', () => {
  const decision = evaluateSmartFallback(createInput({ rowCount: 50, columnCount: 10, cellCount: 500 }));

  assert.equal(decision.renderMode, 'table');
  assert.deepEqual(decision.reasons, ['within-table-threshold']);
});

test('evaluateSmartFallback switches to card mode at 501 cells', () => {
  const decision = evaluateSmartFallback(createInput({ rowCount: 167, columnCount: 3, cellCount: 501 }));

  assert.equal(decision.renderMode, 'card');
  assert.deepEqual(decision.reasons, ['cell-threshold-exceeded']);
});

test('evaluateSmartFallback switches to card mode when no sheet target is provided', () => {
  const decision = evaluateSmartFallback(createInput({ hasSheetTarget: false, rowCount: 0, columnCount: 0, cellCount: 0 }));

  assert.equal(decision.renderMode, 'card');
  assert.deepEqual(decision.reasons, ['missing-sheet-target']);
});
