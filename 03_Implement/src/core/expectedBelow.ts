/**
 * `x-below` -- how many rows continued directly below the range when the
 * reference was written (ADR-0022, option B; issue #521). Experimental key:
 * renderers that do not know it ignore it (spec P5), so it never changes what
 * is displayed.
 *
 *   ![[./設計.xlsx#受注登録|B11:AD19?header=first&x-below=0]]
 *
 * A fixed A1 range keeps resolving after a row is inserted inside it: the
 * inserted row is shown and the row that used to be last falls out of the
 * range, with nothing to see. Recording whether the range ended where its
 * data ended (0 rows below it) and how many rows continued below it lets a
 * checker notice that this state changed, and ask the person whether the
 * range still shows what they meant.
 *
 * The count is taken over the rows just below `range.endRow`, inside the
 * range's own columns, until the first row where every one of those columns
 * is empty. A table that continues for `MAX_TRACKED_BELOW_ROWS` rows or more
 * records that limit, so a very long column below the range does not make the
 * value long (growth past the limit is not reported). Only the count is
 * recorded; no cell value is stored.
 */
import type { EmbedQuery } from '../parser/embedSyntax.js';
import type { WorkbookData } from './workbookLoader.js';
import { formatMessage } from './messages/index.js';
import { parseRangeToCellRange } from './tableGeometry.js';
import type { CellRange, SheetSource } from './sheetSource.js';

export const EXPECTED_BELOW_PARAM = 'x-below';

/** A table that continues this far below the range is recorded as "this many or more". */
export const MAX_TRACKED_BELOW_ROWS = 1000;

export interface BelowResult {
  /**
   * `grew`: more rows continue below the range now than when it was written (a row may have been
   * inserted inside the range, and the row shown last may no longer be the one that was chosen).
   * `shrank`: fewer (rows below the range may have been removed or moved).
   */
  status: 'ok' | 'grew' | 'shrank';
  expected: number;
  actual: number;
}

/** The recorded count in `x-below`, or `undefined` when the key is absent or does not hold a count. */
export function parseBelowValue(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = value.trim();
  if (!/^\d{1,4}$/u.test(text)) return undefined;
  const count = Number(text);
  return count <= MAX_TRACKED_BELOW_ROWS ? count : undefined;
}

/** How many rows continued below the range at the time of writing; `undefined` when it cannot be told. */
export function currentBelowRows(query: EmbedQuery, workbook: WorkbookData): number | undefined {
  if (query.range === undefined || query.target === undefined) return undefined;
  const sheet = workbook.sheets[query.target];
  if (!sheet) return undefined;
  let range: CellRange;
  try {
    range = parseRangeToCellRange(query.range);
  } catch {
    return undefined;
  }
  return countRowsBelow(sheet, range);
}

/**
 * Compare the reference's `x-below` with the rows that continue below the range now.
 * `undefined` when the key is absent, or when the state cannot be read (the key is then ignored).
 */
export function checkExpectedBelow(query: EmbedQuery, workbook: WorkbookData): BelowResult | undefined {
  const expected = parseBelowValue(query.params.get(EXPECTED_BELOW_PARAM));
  if (expected === undefined) return undefined;
  const actual = currentBelowRows(query, workbook);
  if (actual === undefined) return undefined;
  if (actual === expected) return { status: 'ok', expected, actual };
  return { status: actual > expected ? 'grew' : 'shrank', expected, actual };
}

/** Severity of one `x-below` check in a diagnostic. `ok` produces none. */
export function belowSeverity(result: BelowResult): 'warning' | 'information' | undefined {
  if (result.status === 'ok') return undefined;
  return result.status === 'grew' ? 'warning' : 'information';
}

/** One readable sentence for a diagnostic in `locale` (default English). */
export function describeBelowChange(result: BelowResult, locale?: string): string {
  return formatMessage('belowChanged', {
    expected: result.expected,
    actual: result.actual,
    grew: result.status === 'grew',
  }, locale);
}

function countRowsBelow(sheet: SheetSource, range: CellRange): number {
  let count = 0;
  while (count < MAX_TRACKED_BELOW_ROWS && rowHasValue(sheet, range.endRow + 1 + count, range)) {
    count += 1;
  }
  return count;
}

function rowHasValue(sheet: SheetSource, row: number, range: CellRange): boolean {
  for (let col = range.startCol; col <= range.endCol; col += 1) {
    if ((sheet.cellAt(row, col)?.text ?? '').trim() !== '') return true;
  }
  return false;
}
