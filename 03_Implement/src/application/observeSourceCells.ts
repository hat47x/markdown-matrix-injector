import path from 'node:path';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';
import { loadWorkbookFromBytes } from '../core/workbookLoader.js';
import type { CellRange, SourceCell } from '../core/sheetSource.js';
import { cellRangeToA1, parseRangeToCellRange, rangeDimensions } from '../core/tableGeometry.js';

export const SOURCE_CELLS_CONTRACT = 'mmi.source-cells/v0' as const;
export const SOURCE_CELLS_LIMIT = 4096;
export interface SourceCellsOptions {
  source: string;
  bytes: Buffer;
  sheet: string;
  range: string;
  headerRange?: string;
  includeValues?: boolean;
  expectedSourceDigest?: string;
  maxCells?: number;
}
export interface ObservedSourceCell {
  address: string;
  presence: 'represented' | 'not-represented';
  type?: SourceCell['type'];
  valueOrigin: 'literal' | 'saved-formula-cache' | 'formula-cache-unavailable' | 'unobserved';
  mergeRole: 'none' | 'anchor' | 'covered' | 'ambiguous';
  mergeRanges: string[];
  /** Only present after explicit value disclosure; no values are filled from a merge anchor. */
  payload?: { value: SourceCell['value']; text: string; formula?: string };
}
function parseSelection(value: string): CellRange {
  if (!/^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/iu.test(value)) throw new Error('range must be a single A1 cell or rectangle');
  const range = parseRangeToCellRange(value);
  const coords = [range.startRow, range.endRow, range.startCol, range.endCol];
  if (!coords.every(Number.isSafeInteger) || range.startRow > range.endRow || range.startCol > range.endCol
      || range.endRow >= 1048576 || range.endCol >= 16384) throw new Error('range is reversed or outside Excel coordinates');
  return range;
}
const contains = (outer: CellRange, inner: CellRange) => outer.startRow <= inner.startRow && outer.endRow >= inner.endRow && outer.startCol <= inner.startCol && outer.endCol >= inner.endCol;
const intersects = (a: CellRange, b: CellRange) => a.startRow <= b.endRow && a.endRow >= b.startRow && a.startCol <= b.endCol && a.endCol >= b.startCol;

/** Project the same input bytes as source evidence, never as accepted business meaning. */
export function observeSourceCells(options: SourceCellsOptions) {
  const range = parseSelection(options.range);
  const maxCells = options.maxCells ?? SOURCE_CELLS_LIMIT;
  if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > SOURCE_CELLS_LIMIT) throw new Error('max-cells must be between 1 and 4096');
  if (rangeDimensions(range).cellCount > maxCells) throw new Error('selected range exceeds max-cells');
  const header = options.headerRange === undefined ? undefined : parseSelection(options.headerRange);
  if (header && !contains(range, header)) throw new Error('header-range must stay inside the selected range');
  if (!/\.(xlsx|xlsm|xls|csv|xml)$/iu.test(options.source)) throw new Error('cell observation supports Excel, CSV and XML Spreadsheet 2003');
  const sourceIdentity = createSourceIdentityFromBytes(options.bytes);
  if (options.expectedSourceDigest !== undefined) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(options.expectedSourceDigest)) throw new Error('expected-source-digest must be a SHA-256 Source Identity digest');
    if (sourceIdentity.digest !== options.expectedSourceDigest) throw new Error('source digest mismatch; create a new inventory before observing cells');
  }
  const workbook = loadWorkbookFromBytes(options.source, options.bytes);
  if (!Object.hasOwn(workbook.sheets, options.sheet)) throw new Error('selected sheet does not exist');
  const sheet = workbook.sheets[options.sheet];
  const selectedMerges = sheet.merges.filter((merge) => intersects(range, merge));
  const cells: ObservedSourceCell[] = [];
  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = range.startCol; col <= range.endCol; col++) {
      const point = { startRow: row, endRow: row, startCol: col, endCol: col };
      const cell = sheet.cellAt(row, col);
      const merges = selectedMerges.filter((merge) => contains(merge, point));
      const mergeRole = merges.length > 1 ? 'ambiguous' : !merges.length ? 'none'
        : merges[0].startRow === row && merges[0].startCol === col ? 'anchor' : 'covered';
      cells.push({
        address: cellRangeToA1(point), presence: cell ? 'represented' : 'not-represented',
        ...(cell ? { type: cell.type } : {}),
        valueOrigin: !cell ? 'unobserved' : cell.formula === undefined ? 'literal'
          : cell.value === null ? 'formula-cache-unavailable' : 'saved-formula-cache',
        mergeRole, mergeRanges: merges.map(cellRangeToA1),
        ...(options.includeValues && cell ? { payload: { value: cell.value, text: cell.text,
          ...(cell.formula === undefined ? {} : { formula: cell.formula }) } } : {}),
      });
    }
  }
  return {
    contract: SOURCE_CELLS_CONTRACT,
    source: options.source.split(path.sep).join('/'), sourceIdentity,
    sheet: options.sheet, range: cellRangeToA1(range),
    usedRange: sheet.usedRange ? cellRangeToA1(sheet.usedRange) : null,
    valuesIncluded: Boolean(options.includeValues),
    ...(header ? { headerSelection: { range: cellRangeToA1(header), basis: 'caller-specified' as const } } : {}),
    merges: selectedMerges.map((merge) => ({ range: cellRangeToA1(merge),
      anchor: cellRangeToA1({ ...merge, endRow: merge.startRow, endCol: merge.startCol }),
      anchorOutsideSelection: !contains(range, { ...merge, endRow: merge.startRow, endCol: merge.startCol }),
    })),
    limitations: ['absent-and-style-only-cells-are-not-distinguished', 'formula-results-are-saved-not-recalculated', 'header-meaning-is-not-inferred', 'values-are-loader-decoded-not-original-lexemes', 'display-text-is-not-excel-render-verification'],
    cells,
  };
}
