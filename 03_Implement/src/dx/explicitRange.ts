import {
  cellRangeToA1,
  parseRangeToCellRange,
} from '../core/tableGeometry.js';

const EXCEL_MAX_ROWS = 1_048_576;
const EXCEL_MAX_COLUMNS = 16_384;

/**
 * Validate a user-entered A1 range without reading or mutating the workbook.
 * The range stays within Excel's physical worksheet bounds and is normalized
 * to uppercase A1 notation before authoring continues.
 */
export function normalizeExplicitRangeInput(
  input: string,
): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const range = parseRangeToCellRange(trimmed);
    if (
      range.startRow < 0
      || range.startCol < 0
      || range.endRow < range.startRow
      || range.endCol < range.startCol
      || range.endRow >= EXCEL_MAX_ROWS
      || range.endCol >= EXCEL_MAX_COLUMNS
    ) {
      return undefined;
    }
    return cellRangeToA1(range);
  } catch {
    return undefined;
  }
}
