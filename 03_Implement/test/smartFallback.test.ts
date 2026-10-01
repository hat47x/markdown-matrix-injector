import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSmartFallback,
  MAX_CELLS_HARD_LIMIT,
  shouldRenderAsCardAfterLoad,
  SmartFallbackLimitError,
  type SmartFallbackInput,
} from '../src/core/smartFallback.js';
import { type EmbedQuery } from '../src/parser/embedSyntax.js';
import { type WorkbookData } from '../src/core/workbookLoader.js';
import { sheetSourceFromMatrix, type SheetSource } from '../src/core/sheetSource.js';

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
      Sheet1: sheetSourceFromMatrix(rows),
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

// ── mode=table's hard resource ceiling (input-assistance-source-model.md §3:
// "mode=tableで強制された場合も上限を外さない") ───────────────────────────

test('evaluateSmartFallback throws a coded error when mode=table exceeds the hard cell limit', () => {
  assert.throws(
    () => evaluateSmartFallback(createInput({ mode: 'table', rowCount: 1, columnCount: 100_001, cellCount: 100_001 })),
    (error: unknown) => {
      assert.ok(error instanceof SmartFallbackLimitError);
      assert.equal(error.code, 'MMI_TABLE_TOO_LARGE');
      assert.equal(error.cellCount, 100_001);
      assert.equal(error.limit, MAX_CELLS_HARD_LIMIT);
      assert.match(error.message, /100001 cells exceeds the 100000-cell limit/);
      return true;
    },
  );
});

test('evaluateSmartFallback keeps table mode for mode=table at the hard limit boundary', () => {
  const decision = evaluateSmartFallback(createInput({ mode: 'table', rowCount: 1, columnCount: 100_000, cellCount: 100_000 }));

  assert.equal(decision.renderMode, 'table');
  assert.deepEqual(decision.reasons, ['explicit-table-mode']);
});

test('shouldRenderAsCardAfterLoad propagates the hard-limit error for mode=table without ever touching a cell', () => {
  // A declared range whose dimensions alone (arithmetic on the range, per
  // measureRegion's contract) exceed the hard limit. cellAt throws if called,
  // proving the rejection happens before any cell would be materialised.
  const hugeSheet: SheetSource = {
    usedRange: { startRow: 0, startCol: 0, endRow: 999, endCol: 999 }, // 1,000,000 cells
    merges: [],
    cellAt: () => {
      throw new Error('cellAt must not be called before the hard-limit check');
    },
  };
  const workbook: WorkbookData = { sheets: { Sheet1: hugeSheet } };

  assert.throws(
    () => shouldRenderAsCardAfterLoad(createQuery({ params: new URLSearchParams('mode=table') }), workbook),
    /1000000 cells exceeds the 100000-cell limit/,
  );
});

test('shouldRenderAsCardAfterLoad measures the declared range width, not the sheet\'s actual column count', () => {
  // A sheet with only 3 real columns, but a query that declares a 12-column
  // range. The range itself defines the rectangle to be shown (spec §6 step
  // 1); Smart Fallback must decide on that declared width, not on how many
  // columns happen to be populated. Getting this wrong under-counts columns
  // and silently renders as a table something the declared range says should
  // fall back to a card.
  const workbook = createWorkbook([
    ['A', 'B', 'C'],
    ['1', '2', '3'],
  ]);

  const shouldRenderCard = shouldRenderAsCardAfterLoad(
    createQuery({ range: 'A1:L2' }),
    workbook,
  );

  assert.equal(shouldRenderCard, true);
});
