/**
 * Aggregates content-matching (`core/contentMatch.ts`) across a set of
 * already-loaded workbooks -- the orchestration layer between the pure
 * single-sheet matcher and the VS Code host (`extension.ts`).
 *
 * `input-assistance-paste-provenance.md` §5 step 1 ("探索対象は利用者が選んだ
 * ブック、または許可されたworkspace内に限る") is deliberately resolved here in
 * its most conservative form: this module performs no file discovery or
 * workspace scanning of its own. The caller supplies the exact candidate
 * workbooks -- keeping this module pure and unit-testable, and keeping the
 * actual "which files" policy (and any `vscode.workspace.findFiles` call) in
 * the host layer, where it belongs.
 */
import { findContentMatches, type ContentMatch } from '../core/contentMatch.js';
import { cellRangeToA1 } from '../core/tableGeometry.js';
import type { CellRange, SheetSource } from '../core/sheetSource.js';
import { parseTsv } from './pasteDrop.js';
import { detectRegions } from '../search/regionDetector.js';

export interface WorkbookSheetsSource {
  /** Path as it should appear in the resulting `![[...]]` reference (already relativized by the caller). */
  readonly filepath: string;
  readonly sheets: Readonly<Record<string, SheetSource>>;
}

export interface WorkbookContentMatch {
  readonly filepath: string;
  readonly sheet: string;
  readonly range: CellRange;
  /** Where the match sits, so identical copies in different places can be told apart. */
  readonly context?: MatchContext;
}

export interface MatchContext {
  /** Title of the detected table that contains the match. */
  readonly title?: string;
  /** Headers of that table, if the match is below its header row. */
  readonly headers?: readonly string[];
  /** First source rows inside the matched rectangle, bounded for human preview. */
  readonly previewRows?: readonly (readonly string[])[];
  /** Displayed values of the row just above / below the match, within its columns. */
  readonly rowAbove?: readonly string[];
  readonly rowBelow?: readonly string[];
}

/** Context for one match, read from the source sheet (read-only). */
export function matchContext(sheet: SheetSource, range: CellRange): MatchContext {
  const rowOf = (row: number): string[] | undefined => {
    if (row < 0) return undefined;
    const values: string[] = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) values.push(sheet.cellAt(row, col)?.text ?? '');
    return values.some((value) => value !== '') ? values : undefined;
  };
  let region;
  try {
    region = detectRegions('', sheet, { maxScanCells: 200_000, maxValueSample: 0 }).find(
      (candidate) =>
        candidate.range.startRow <= range.startRow &&
        candidate.range.endRow >= range.endRow &&
        candidate.range.startCol <= range.startCol &&
        candidate.range.endCol >= range.endCol,
    );
  } catch {
    region = undefined;
  }
  const headers =
    region?.headers && region.headerConfidence !== 'none' && range.startRow > region.range.startRow
      ? region.headers.slice(range.startCol - region.range.startCol, range.endCol - region.range.startCol + 1)
      : undefined;
  const previewRows: string[][] = [];
  const previewEndRow = Math.min(range.endRow, range.startRow + 1);
  for (let row = range.startRow; row <= previewEndRow; row += 1) {
    const values = rowOf(row);
    if (values) previewRows.push(values);
  }
  return {
    title: region?.title,
    headers,
    previewRows: previewRows.length > 0 ? previewRows : undefined,
    rowAbove: rowOf(range.startRow - 1),
    rowBelow: rowOf(range.endRow + 1),
  };
}

/**
 * Searches every sheet of every given workbook for a rectangle whose
 * displayed values exactly match `clipboardPlainText` (parsed as TSV --
 * `pasteDrop.ts::parseTsv`). Returns every exact match found across every
 * workbook/sheet; the caller decides what to do with 0, 1, or many results
 * (design §4 "自動確定の規則": multiple matches must never be auto-resolved to
 * one).
 *
 * A single sheet whose used range exceeds `findContentMatches`'s own
 * `maxIndexedCells` limit is skipped rather than aborting the whole search --
 * one pathologically large, unrelated sheet in one workbook should not
 * prevent finding a genuine match elsewhere.
 */
export function findWorkbookContentMatches(
  clipboardPlainText: string,
  workbooks: readonly WorkbookSheetsSource[],
): WorkbookContentMatch[] {
  const needle = parseTsv(clipboardPlainText);
  if (needle.length === 0) {
    return [];
  }

  const matches: WorkbookContentMatch[] = [];
  for (const workbook of workbooks) {
    for (const [sheetName, sheet] of Object.entries(workbook.sheets)) {
      matches.push(...matchesForSheet(workbook.filepath, sheetName, sheet, needle));
    }
  }
  return matches;
}

function matchesForSheet(
  filepath: string,
  sheetName: string,
  sheet: SheetSource,
  needle: readonly (readonly string[])[],
): WorkbookContentMatch[] {
  let sheetMatches: readonly ContentMatch[];
  try {
    sheetMatches = findContentMatches(sheet, needle);
  } catch {
    return []; // sheet too large to index (maxIndexedCells) -- skip, don't abort the whole search
  }

  return sheetMatches.map((match) => ({
    filepath,
    sheet: sheetName,
    range: match.range,
    context: matchContext(sheet, match.range),
  }));
}

/**
 * Compact, single-line context for the host Paste As picker. Exact copied
 * values are already the matching evidence; this summary exists only to help
 * a human distinguish multiple identical occurrences before choosing one.
 *
 * Title/header/neighbor text is source-derived, whitespace-normalized and
 * bounded so a large or multiline cell cannot flood the picker label.
 */
export function summarizeContentMatchContext(match: WorkbookContentMatch, maxLength = 96): string {
  const context = match.context;
  if (!context || maxLength <= 0) return '';

  const clean = (value: string): string => value.replace(/\s+/gu, ' ').trim() || '（空）';
  const values = (input?: readonly string[]): string | undefined => {
    if (!input || input.length === 0) return undefined;
    const shown = input.slice(0, 3).map((value) => truncate(clean(value), 18)).join('|');
    return input.length > 3 ? `${shown}|…` : shown;
  };
  const headers = values(context.headers);
  const preview = context.previewRows
    ?.slice(0, 2)
    .map((row) => values(row))
    .filter((row): row is string => Boolean(row))
    .join(' / ');
  const rowAbove = values(context.rowAbove);
  const rowBelow = values(context.rowBelow);
  const parts = [
    context.title ? `表:${clean(context.title)}` : undefined,
    headers ? `見出し:${headers}` : undefined,
    preview ? `値:${preview}` : undefined,
    rowAbove ? `前:${rowAbove}` : undefined,
    rowBelow ? `後:${rowBelow}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return truncate(parts.join(' / '), maxLength);
}

function truncate(value: string, maxLength: number): string {
  const chars = [...value];
  if (chars.length <= maxLength) return value;
  if (maxLength <= 1) return '…'.slice(0, maxLength);
  return `${chars.slice(0, maxLength - 1).join('')}…`;
}

/** Renders a content match as the `![[file#sheet|range]]` text to insert. */
export function buildContentMatchMarkdown(match: WorkbookContentMatch): string {
  return `![[${match.filepath}#${match.sheet}|${cellRangeToA1(match.range)}]]`;
}
