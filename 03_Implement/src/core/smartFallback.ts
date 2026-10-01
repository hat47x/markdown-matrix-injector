import { type EmbedQuery } from '../parser/embedSyntax.js';
import { measureRegion } from './tableGeometry.js';
import { type WorkbookData } from './workbookLoader.js';

const MAX_COLUMNS_BEFORE_CARD = 10;
const MAX_CELLS_BEFORE_CARD = 500;

/**
 * Hard ceiling that an explicit `mode=table` cannot lift
 * (`input-assistance-source-model.md` §3: "mode=tableで強制された場合も上限を
 * 外さない。超過は記法仕様P2に沿う可視エラーとする。"). Unlike
 * `MAX_CELLS_BEFORE_CARD` -- a rendering-quality threshold that only ever
 * applies when the mode is left to auto-detect -- this exists solely to stop
 * a forced table from materialising a pathologically large rectangle (the
 * design doc's own motivating case: a distant used-range origin expanding to
 * 3,527,040 cells). The exact number is a provisional placeholder; real
 * render-time performance has not been measured yet (issue-0114 "Remaining
 * work").
 */
export const MAX_CELLS_HARD_LIMIT = 100_000;

export function tableTooLargeMessage(cellCount: number, limit = MAX_CELLS_HARD_LIMIT): string {
  return (
    `Reference too large to render as a table (${cellCount} cells exceeds the ` +
    `${limit}-cell limit). mode=table does not lift this limit -- narrow ` +
    'the range or split the reference.'
  );
}

export class SmartFallbackLimitError extends Error {
  readonly code = 'MMI_TABLE_TOO_LARGE' as const;

  constructor(
    readonly cellCount: number,
    readonly limit: number,
  ) {
    super(tableTooLargeMessage(cellCount, limit));
    this.name = 'SmartFallbackLimitError';
  }
}

export type SmartFallbackRenderMode = 'table' | 'card';

export type SmartFallbackReason =
  | 'explicit-card-mode'
  | 'explicit-table-mode'
  | 'missing-sheet-target'
  | 'column-threshold-exceeded'
  | 'cell-threshold-exceeded'
  | 'within-table-threshold';

export interface SmartFallbackInput {
  mode?: string;
  hasSheetTarget: boolean;
  rowCount: number;
  columnCount: number;
  cellCount: number;
}

export interface SmartFallbackDecision {
  renderMode: SmartFallbackRenderMode;
  reasons: SmartFallbackReason[];
  metrics: {
    rowCount: number;
    columnCount: number;
    cellCount: number;
  };
}

export function evaluateSmartFallback(input: SmartFallbackInput): SmartFallbackDecision {
  const normalizedMode = input.mode?.trim().toLowerCase();

  if (normalizedMode === 'card') {
    return createDecision('card', ['explicit-card-mode'], input);
  }

  if (normalizedMode === 'table') {
    if (input.cellCount > MAX_CELLS_HARD_LIMIT) {
      throw new SmartFallbackLimitError(input.cellCount, MAX_CELLS_HARD_LIMIT);
    }
    return createDecision('table', ['explicit-table-mode'], input);
  }

  if (!input.hasSheetTarget) {
    return createDecision('card', ['missing-sheet-target'], input);
  }

  const thresholdReasons: SmartFallbackReason[] = [];
  if (input.columnCount > MAX_COLUMNS_BEFORE_CARD) {
    thresholdReasons.push('column-threshold-exceeded');
  }

  if (input.cellCount > MAX_CELLS_BEFORE_CARD) {
    thresholdReasons.push('cell-threshold-exceeded');
  }

  if (thresholdReasons.length > 0) {
    return createDecision('card', thresholdReasons, input);
  }

  return createDecision('table', ['within-table-threshold'], input);
}

/**
 * Smart Fallback decision that can be made WITHOUT loading the workbook
 * (e.g. `mode=card`). Counts are zero here; only the mode is decisive.
 */
export function getImmediateSmartFallbackDecision(query: EmbedQuery): SmartFallbackDecision {
  return evaluateSmartFallback({
    mode: query.params.get('mode') ?? undefined,
    hasSheetTarget: true,
    rowCount: 0,
    columnCount: 0,
    cellCount: 0,
  });
}

/**
 * Smart Fallback decision once the workbook is loaded, using the real selection
 * metrics (row/column/cell counts) and whether a sheet target was specified.
 */
export function getSmartFallbackDecisionAfterLoad(query: EmbedQuery, workbook: WorkbookData): SmartFallbackDecision {
  const metrics = getWorkbookSelectionMetrics(query, workbook);

  return evaluateSmartFallback({
    mode: query.params.get('mode') ?? undefined,
    hasSheetTarget: Boolean(query.target),
    ...metrics,
  });
}

export function shouldRenderAsCardImmediately(query: EmbedQuery): boolean {
  return getImmediateSmartFallbackDecision(query).renderMode === 'card';
}

export function shouldRenderAsCardAfterLoad(query: EmbedQuery, workbook: WorkbookData): boolean {
  return getSmartFallbackDecisionAfterLoad(query, workbook).renderMode === 'card';
}

/**
 * Dimensions only -- no cell is touched (review R3: measure before you
 * materialise). This is what lets a reference to a huge or distant-origin
 * range be sized as a card without ever building its display matrix.
 */
function getWorkbookSelectionMetrics(query: EmbedQuery, workbook: WorkbookData): Pick<SmartFallbackInput, 'rowCount' | 'columnCount' | 'cellCount'> {
  if (!query.target) {
    return { rowCount: 0, columnCount: 0, cellCount: 0 };
  }

  const sheet = workbook.sheets[query.target];
  if (!sheet) {
    throw new Error(`Sheet not found: ${query.target}`);
  }

  return measureRegion(sheet, query.range);
}

function createDecision(
  renderMode: SmartFallbackRenderMode,
  reasons: SmartFallbackReason[],
  input: SmartFallbackInput,
): SmartFallbackDecision {
  return {
    renderMode,
    reasons,
    metrics: {
      rowCount: input.rowCount,
      columnCount: input.columnCount,
      cellCount: input.cellCount,
    },
  };
}
