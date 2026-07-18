import { type EmbedQuery } from '../parser/embedSyntax.js';
import { type WorkbookData } from './workbookLoader.js';

const MAX_COLUMNS_BEFORE_CARD = 10;
const MAX_CELLS_BEFORE_CARD = 500;

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

function getWorkbookSelectionMetrics(query: EmbedQuery, workbook: WorkbookData): Pick<SmartFallbackInput, 'rowCount' | 'columnCount' | 'cellCount'> {
  if (!query.target) {
    return { rowCount: 0, columnCount: 0, cellCount: 0 };
  }

  const rows = workbook.sheets[query.target];
  if (!rows) {
    throw new Error(`Sheet not found: ${query.target}`);
  }

  const slicedRows = query.range ? sliceRange(rows, query.range) : rows;
  return {
    rowCount: slicedRows.length,
    columnCount: slicedRows.reduce((max, row) => Math.max(max, row.length), 0),
    cellCount: slicedRows.reduce((count, row) => count + row.length, 0),
  };
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

function sliceRange(rows: string[][], range: string): string[][] {
  const [startRef, endRef = startRef] = range.split(':', 2);
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);

  return rows.slice(start.row, end.row + 1).map((row) => row.slice(start.col, end.col + 1));
}

function parseCellRef(cellRef: string): { row: number; col: number } {
  const match = /^(?<col>[A-Z]+)(?<row>\d+)$/i.exec(cellRef.trim());
  if (!match?.groups) {
    throw new Error(`Invalid range reference: ${cellRef}`);
  }

  return {
    col: columnToIndex(match.groups.col.toUpperCase()),
    row: Number(match.groups.row) - 1,
  };
}

function columnToIndex(column: string): number {
  return [...column].reduce((result, char) => result * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}
