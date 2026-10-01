/**
 * A1-notation geometry primitives shared by the render pipeline
 * (`renderTable`) and the Smart Fallback size estimator (`smartFallback`).
 *
 * Both call sites must compute the *same* logical slice from the same `range`:
 * the estimator decides table-vs-card from the sliced row/column/cell counts,
 * and the renderer then materialises that same slice. If the two used separate
 * copies of this logic they could drift, and a reference could be sized as a
 * table but rendered from a different region (or vice versa) — a determinism
 * violation (spec P3). Keeping one implementation here makes that impossible.
 *
 * Columns are 1-based letters in the notation (`A`, `B`, ... `AA`) but 0-based
 * indices internally; rows are 1-based in the notation and 0-based internally.
 *
 * `measureRegion` and `sliceRegion` operate on a `SheetSource` (physical,
 * origin-preserving coordinates -- see `sheetSource.ts`) rather than on a
 * pre-materialised `string[][]`. This is what lets Smart Fallback measure a
 * reference's dimensions (issue-0114 review R3: "measure before you
 * materialise") without ever touching a cell, and lets `renderTable` slice
 * only the exact rectangle that will actually be shown -- never an entire
 * sheet "just in case", which is what made a distant used-range origin
 * (e.g. `ZZ5000:AAB5010`) expand to millions of cells under the previous
 * A1-relative slicing.
 */
import type { CooperativeTimeBudget } from './cooperativeTimeBudget.js';
import type { CellRange, SheetSource } from './sheetSource.js';

/**
 * Converts an A1 column label to a 0-based column index.
 * `A` -> 0, `Z` -> 25, `AA` -> 26. Input is assumed upper-cased.
 */
export function columnToIndex(column: string): number {
  return [...column].reduce((result, char) => result * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

/**
 * Parses a single A1 cell reference (e.g. `B3`) into 0-based `{ row, col }`.
 * The column letters are case-insensitive. Throws on malformed input so the
 * failure surfaces as a visible embed error rather than a silent mis-slice.
 */
export function parseCellRef(cellRef: string): { row: number; col: number } {
  const match = /^(?<col>[A-Z]+)(?<row>\d+)$/i.exec(cellRef.trim());
  if (!match?.groups) {
    throw new Error(`Invalid range reference: ${cellRef}`);
  }

  return {
    col: columnToIndex(match.groups.col.toUpperCase()),
    row: Number(match.groups.row) - 1,
  };
}

/**
 * Parses an A1 range (e.g. `A1:C4`) into a physical `CellRange`. A
 * single-cell range (`B2`) collapses to a 1x1 region because the end
 * reference defaults to the start.
 */
export function parseRangeToCellRange(range: string): CellRange {
  const [startRef, endRef = startRef] = range.split(':', 2);
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);

  return { startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col };
}

/**
 * Converts a 0-based column index back to its A1 letter label -- the inverse
 * of `columnToIndex` (`0` -> `A`, `25` -> `Z`, `26` -> `AA`). Needed once a
 * physical `CellRange` produced somewhere other than by parsing notation
 * (e.g. a content-match result, `dx/contentMatchSearch.ts`) must be rendered
 * back into an A1 range string for insertion.
 */
export function indexToColumn(index: number): string {
  let remaining = index + 1;
  let label = '';
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

/**
 * Renders a physical `CellRange` back into an A1 range string, collapsing to
 * a single cell reference when start equals end -- the inverse of
 * `parseRangeToCellRange`.
 */
export function cellRangeToA1(range: CellRange): string {
  const start = `${indexToColumn(range.startCol)}${range.startRow + 1}`;
  const end = `${indexToColumn(range.endCol)}${range.endRow + 1}`;
  return start === end ? start : `${start}:${end}`;
}

export interface RegionDimensions {
  rowCount: number;
  columnCount: number;
  cellCount: number;
}

/**
 * Pure arithmetic on a `CellRange` -- no cell is touched. A reversed range
 * (end before start) reports zero rows/columns rather than throwing, matching
 * the previous `Array.prototype.slice` behaviour (`slice(3, 0)` -> `[]`).
 */
export function rangeDimensions(range: CellRange): RegionDimensions {
  const rowCount = Math.max(0, range.endRow - range.startRow + 1);
  const columnCount = Math.max(0, range.endCol - range.startCol + 1);
  return { rowCount, columnCount, cellCount: rowCount * columnCount };
}

/**
 * Dimensions of `range` (or, if omitted, the sheet's used range) without
 * materialising a single cell. Smart Fallback calls this to decide
 * table-vs-card *before* any rectangle is built (review R3) -- essential for
 * a reference whose range is huge or whose sheet has a used range far from
 * the origin, where building the display matrix first would be the
 * expensive step this function exists to avoid.
 */
export function measureRegion(sheet: SheetSource, range?: string): RegionDimensions {
  const cellRange = range ? parseRangeToCellRange(range) : sheet.usedRange;
  if (!cellRange) {
    return { rowCount: 0, columnCount: 0, cellCount: 0 };
  }

  return rangeDimensions(cellRange);
}

/**
 * Materialises `range` (or the sheet's used range) as a display matrix.
 * Always returns a true rectangle -- a cell with no data becomes `''`, so
 * every row has the same length regardless of blank cells or a ragged used
 * range. Call only for a region that `measureRegion` + Smart Fallback have
 * already accepted (review R3): this function does not itself impose a size
 * limit.
 */
export interface SliceRegionOptions {
  budget?: CooperativeTimeBudget;
}

export function sliceRegion(sheet: SheetSource, range?: string, options: SliceRegionOptions = {}): string[][] {
  const cellRange = range ? parseRangeToCellRange(range) : sheet.usedRange;
  if (!cellRange) {
    return [];
  }

  const budget = options.budget;
  budget?.check();

  const { startRow, startCol, endRow, endCol } = cellRange;
  const rows: string[][] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const line: string[] = [];
    for (let col = startCol; col <= endCol; col += 1) {
      budget?.consume();
      line.push(sheet.cellAt(row, col)?.text ?? '');
    }
    rows.push(line);
  }

  budget?.check();
  return rows;
}
