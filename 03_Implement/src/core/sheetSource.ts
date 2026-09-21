/**
 * Origin-preserving sheet model (issue-0114 / ADR-0016).
 *
 * `workbookLoader` used to return each sheet as a plain `string[][]` produced
 * by `XLSX.sheet_to_json({ header: 1, blankrows: false })`. That call both
 * drops blank rows and always returns an array indexed from physical row/
 * column 0 -- so a sheet whose used range starts at, say, `C5` is returned as
 * an array whose `[0][0]` is really `C5`, not `A1`. A range like `C5:F12`
 * sliced against that array lands on the wrong cells entirely (see
 * `02_Architecture/input-assistance-source-model.md` for the measured
 * reproduction).
 *
 * `SheetSource` fixes this by keeping cells addressed by their *physical*
 * 0-based row/column for as long as possible. A dense `string[][]` display
 * matrix is only ever materialised at the very end, for the exact rectangle
 * that will be shown (`sliceRegion` in `tableGeometry.ts`) -- never for an
 * entire sheet "just in case".
 */

/** A 0-based, inclusive rectangular region. Independent of A1 notation. */
export interface CellRange {
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
}

/**
 * SheetJS single-letter cell type codes: string, number, date, boolean, error.
 * `z` (stub/blank) is included for completeness but `cellAt` never returns a
 * `z` cell -- a cell with no real content is treated as absent (`undefined`),
 * matching the existing "missing cell renders as empty string" contract.
 */
export type SourceCellType = 's' | 'n' | 'd' | 'b' | 'e' | 'z';

export interface SourceCell {
  /**
   * The display string: what Excel itself would show for this cell (its
   * SheetJS `.w`, i.e. the value already formatted per the cell's number
   * format). This is what MMI renders, and it is also the value a clipboard
   * HTML capture's cell text should be compared against when matching a
   * paste back to its origin (`input-assistance-paste-provenance.md` §6).
   */
  readonly text: string;
  readonly type: SourceCellType;
  /** Raw value: distinguishes a leading-zero string, a Date, a number, etc. */
  readonly value: string | number | boolean | Date | null;
  /**
   * Present only when the cell holds a formula. `text`/`value` are always the
   * *saved* result -- MMI is read-only and never (re)evaluates a formula or
   * refreshes an external link (spec P1).
   */
  readonly formula?: string;
}

export interface SheetSource {
  /**
   * The sheet's original used-range address (SheetJS `!ref`), 0-based
   * inclusive. `undefined` only for a genuinely empty sheet -- never widened
   * to A1 and never narrowed by dropping blank rows.
   */
  readonly usedRange?: CellRange;
  /** Declared merge ranges only. Never inferred from blank/adjacent cells. */
  readonly merges: readonly CellRange[];
  /** Sparse lookup by 0-based physical row/column. `undefined` when empty. */
  cellAt(row: number, col: number): SourceCell | undefined;
}

/**
 * Wraps a plain, already-dense `string[][]` (e.g. from the CSV parser, which
 * has no physical-coordinate problem to begin with: RFC4180 text has no
 * concept of "used range" other than "everything that was written") as a
 * `SheetSource` whose origin is `A1`. Every non-empty row is assumed
 * rectangular relative to the widest row; missing cells beyond a short row's
 * length are simply absent (`cellAt` returns `undefined`), which
 * `sliceRegion` fills back in as `''` -- the same behaviour the old
 * `string[][]`-based slicing had.
 *
 * Also used directly by tests that want a `SheetSource` without going
 * through a real file.
 */
export function sheetSourceFromMatrix(rows: readonly (readonly string[])[]): SheetSource {
  if (rows.length === 0) {
    return { usedRange: undefined, merges: [], cellAt: () => undefined };
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const usedRange: CellRange = { startRow: 0, startCol: 0, endRow: rows.length - 1, endCol: columnCount - 1 };

  return {
    usedRange,
    merges: [],
    cellAt(row, col) {
      const text = rows[row]?.[col];
      if (text === undefined) {
        return undefined;
      }
      return { text, type: 's', value: text };
    },
  };
}
