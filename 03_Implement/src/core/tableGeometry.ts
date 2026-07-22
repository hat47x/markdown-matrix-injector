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
 */

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
 * Slices a row matrix to an A1 range (e.g. `A1:C4`). A single-cell range
 * (`B2`) collapses to a 1x1 slice because the end reference defaults to the
 * start. Both bounds are inclusive, matching spreadsheet range semantics.
 */
export function sliceRange(rows: string[][], range: string): string[][] {
  const [startRef, endRef = startRef] = range.split(':', 2);
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);

  return rows.slice(start.row, end.row + 1).map((row) => row.slice(start.col, end.col + 1));
}
