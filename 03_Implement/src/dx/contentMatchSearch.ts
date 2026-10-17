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
import { ContentMatchIndexLimitError, findContentMatchesDetailed } from '../core/contentMatch.js';
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

export interface ContentMatchSkippedSheet {
  readonly filepath: string;
  readonly sheet: string;
  readonly reason: 'sheet-too-large';
  readonly cellCount: number;
  readonly limit: number;
}

export interface ContentMatchTruncatedSheet {
  readonly filepath: string;
  readonly sheet: string;
  readonly limit: number;
}

export interface WorkbookContentMatchSearchResult {
  readonly matches: readonly WorkbookContentMatch[];
  readonly skippedSheets: readonly ContentMatchSkippedSheet[];
  readonly truncatedSheets: readonly ContentMatchTruncatedSheet[];
}

/**
 * Rechecks one previously found range against the current workbook model.
 * This is intentionally a direct rectangle comparison rather than a new
 * workspace search: after the user has picked a candidate, only that exact
 * source range needs to remain equal to the clipboard values.
 */
export function contentMatchStillExact(
  clipboardPlainText: string,
  sheet: SheetSource,
  range: CellRange,
): boolean {
  const needle = parseTsv(clipboardPlainText);
  const rowCount = needle.length;
  const columnCount = needle.reduce((max, row) => Math.max(max, row.length), 0);
  if (rowCount === 0 || columnCount === 0) return false;
  if (range.endRow - range.startRow + 1 !== rowCount || range.endCol - range.startCol + 1 !== columnCount) {
    return false;
  }

  for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
    for (let colOffset = 0; colOffset < columnCount; colOffset += 1) {
      const expected = needle[rowOffset]?.[colOffset] ?? '';
      const actual = sheet.cellAt(range.startRow + rowOffset, range.startCol + colOffset)?.text ?? '';
      if (actual !== expected) return false;
    }
  }
  return true;
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
 * workbook/sheet, bounded by the core candidate cap; the detailed result also
 * reports sheets whose exact-match list was truncated so the caller does not
 * present a bounded prefix as a complete candidate set
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
  return [...findWorkbookContentMatchesDetailed(clipboardPlainText, workbooks).matches];
}

export function findWorkbookContentMatchesDetailed(
  clipboardPlainText: string,
  workbooks: readonly WorkbookSheetsSource[],
): WorkbookContentMatchSearchResult {
  const needle = parseTsv(clipboardPlainText);
  if (needle.length === 0) {
    return { matches: [], skippedSheets: [], truncatedSheets: [] };
  }

  const matches: WorkbookContentMatch[] = [];
  const skippedSheets: ContentMatchSkippedSheet[] = [];
  const truncatedSheets: ContentMatchTruncatedSheet[] = [];
  for (const workbook of workbooks) {
    for (const [sheetName, sheet] of Object.entries(workbook.sheets)) {
      const result = matchesForSheet(workbook.filepath, sheetName, sheet, needle);
      matches.push(...result.matches);
      if (result.skipped) skippedSheets.push(result.skipped);
      if (result.truncated) truncatedSheets.push(result.truncated);
    }
  }
  return { matches, skippedSheets, truncatedSheets };
}

function matchesForSheet(
  filepath: string,
  sheetName: string,
  sheet: SheetSource,
  needle: readonly (readonly string[])[],
): {
  matches: WorkbookContentMatch[];
  skipped?: ContentMatchSkippedSheet;
  truncated?: ContentMatchTruncatedSheet;
} {
  let sheetResult: ReturnType<typeof findContentMatchesDetailed>;
  try {
    sheetResult = findContentMatchesDetailed(sheet, needle);
  } catch (error) {
    if (error instanceof ContentMatchIndexLimitError) {
      return {
        matches: [],
        skipped: {
          filepath,
          sheet: sheetName,
          reason: 'sheet-too-large',
          cellCount: error.cellCount,
          limit: error.limit,
        },
      };
    }
    throw error;
  }

  return {
    matches: sheetResult.matches.map((match) => ({
      filepath,
      sheet: sheetName,
      range: match.range,
      context: matchContext(sheet, match.range),
    })),
    truncated: sheetResult.truncated ? { filepath, sheet: sheetName, limit: sheetResult.limit } : undefined,
  };
}

/**
 * Compact, single-line context for the host Paste As picker. Exact copied
 * values are already the matching evidence; this summary exists only to help
 * a human distinguish multiple identical occurrences before choosing one.
 *
 * Title/header/neighbor text is source-derived, whitespace-normalized and
 * bounded so a large or multiline cell cannot flood the picker label.
 */
export interface ContentMatchContextPhrases {
  /** The wording used in the picker when a shown cell is empty. */
  emptyValue(): string;
  tableTitle(value: string): string;
  headers(value: string): string;
  values(value: string): string;
  rowAbove(value: string): string;
  rowBelow(value: string): string;
}

/** The wording a plain (no VS Code host) caller sees: the English reference. */
export const enContentMatchContextPhrases: ContentMatchContextPhrases = {
  emptyValue: () => '(empty)',
  tableTitle: (value) => `table: ${value}`,
  headers: (value) => `headers: ${value}`,
  values: (value) => `values: ${value}`,
  rowAbove: (value) => `above: ${value}`,
  rowBelow: (value) => `below: ${value}`,
};

/** The previous Japanese wording, kept verbatim (the reference the picker was checked against). */
export const jaContentMatchContextPhrases: ContentMatchContextPhrases = {
  emptyValue: () => '（空）',
  tableTitle: (value) => `表:${value}`,
  headers: (value) => `見出し:${value}`,
  values: (value) => `値:${value}`,
  rowAbove: (value) => `前:${value}`,
  rowBelow: (value) => `後:${value}`,
};

export function summarizeContentMatchContext(
  match: WorkbookContentMatch,
  maxLength = 96,
  phrases: ContentMatchContextPhrases = enContentMatchContextPhrases,
): string {
  const context = match.context;
  if (!context || maxLength <= 0) return '';

  const clean = (value: string): string => value.replace(/\s+/gu, ' ').trim() || phrases.emptyValue();
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
    context.title ? phrases.tableTitle(clean(context.title)) : undefined,
    headers ? phrases.headers(headers) : undefined,
    preview ? phrases.values(preview) : undefined,
    rowAbove ? phrases.rowAbove(rowAbove) : undefined,
    rowBelow ? phrases.rowBelow(rowBelow) : undefined,
  ].filter((part): part is string => Boolean(part));

  return truncate(parts.join(' / '), maxLength);
}

/** The longer wording of the QuickPick detail row: the same context, read as a sentence. */
export interface ContentMatchDetailPhrases {
  emptyValue(): string;
  headers(value: string): string;
  withinTheRange(value: string): string;
  previousRow(value: string): string;
  nextRow(value: string): string;
  /** Joins the two preview rows. */
  previewSeparator(): string;
  /** Joins the four context fields. */
  fieldSeparator(): string;
}

export const enContentMatchDetailPhrases: ContentMatchDetailPhrases = {
  emptyValue: () => '(empty)',
  headers: (value) => `column headers: ${value}`,
  withinTheRange: (value) => `within the range: ${value}`,
  previousRow: (value) => `previous row: ${value}`,
  nextRow: (value) => `next row: ${value}`,
  previewSeparator: () => ' / ',
  fieldSeparator: () => ' ',
};

/** The previous Japanese wording, kept verbatim. */
export const jaContentMatchDetailPhrases: ContentMatchDetailPhrases = {
  emptyValue: () => '（空）',
  headers: (value) => `見出し: ${value}`,
  withinTheRange: (value) => `範囲内: ${value}`,
  previousRow: (value) => `直前の行: ${value}`,
  nextRow: (value) => `直後の行: ${value}`,
  previewSeparator: () => ' ／ ',
  fieldSeparator: () => '　',
};

/** One-line detail of the Paste As QuickPick: headers, the rows inside the range, and its neighbors. */
export function describeContentMatchDetail(
  match: WorkbookContentMatch,
  phrases: ContentMatchDetailPhrases = enContentMatchDetailPhrases,
): string {
  const context = match.context;
  if (!context) return '';
  const clean = (value: string): string => value.replace(/\s+/gu, ' ').trim() || phrases.emptyValue();
  const values = (input?: readonly string[]): string | undefined => {
    const shown = input?.map(clean).join(' | ');
    return shown ? shown : undefined;
  };
  const preview = context.previewRows
    ?.slice(0, 2)
    .map((row) => values(row))
    .filter((row): row is string => Boolean(row))
    .join(phrases.previewSeparator());
  return [
    context.headers ? phrases.headers(values(context.headers) ?? '') : '',
    preview ? phrases.withinTheRange(preview) : '',
    context.rowAbove ? phrases.previousRow(values(context.rowAbove) ?? '') : '',
    context.rowBelow ? phrases.nextRow(values(context.rowBelow) ?? '') : '',
  ]
    .filter(Boolean)
    .join(phrases.fieldSeparator());
}

/**
 * Why the Paste As search could not see every book and sheet. Shown only when
 * nothing was found (or only the labelled edit), so the user can tell an empty
 * result from an unchecked part of the workspace.
 */
export interface ContentMatchIncompletePhrases {
  detail(parts: readonly string[]): string;
  unreadableBooks(count: number): string;
  sheetsPastTheIndexLimit(count: number): string;
  sheetsAtTheCandidateCap(count: number): string;
  booksPastTheSelectionLimit(limit: number): string;
  cancelled(): string;
  listSeparator(): string;
}

export const enContentMatchIncompletePhrases: ContentMatchIncompletePhrases = {
  detail: (parts) => (parts.length > 0 ? `The search is not complete (${parts.join(', ')}).` : ''),
  unreadableBooks: (count) => `${count} unreadable books`,
  sheetsPastTheIndexLimit: (count) => `${count} sheets past the index limit`,
  sheetsAtTheCandidateCap: (count) => `${count} sheets at the candidate cap`,
  booksPastTheSelectionLimit: (limit) => `more books than the limit of ${limit} to search`,
  cancelled: () => 'the search was cancelled',
  listSeparator: () => ', ',
};

/** The previous Japanese wording, kept verbatim. */
export const jaContentMatchIncompletePhrases: ContentMatchIncompletePhrases = {
  detail: (parts) => (parts.length > 0 ? `検索は完全ではありません（${parts.join('、')}）。` : ''),
  unreadableBooks: (count) => `読めないブック ${count}件`,
  sheetsPastTheIndexLimit: (count) => `索引上限を超えたシート ${count}件`,
  sheetsAtTheCandidateCap: (count) => `候補上限に達したシート ${count}件`,
  booksPastTheSelectionLimit: (limit) => `探索対象ブックが上限${limit}件を超過`,
  cancelled: () => '検索が中断されました',
  listSeparator: () => '、',
};

export function describeIncompleteContentMatchSearch(
  skippedFileCount: number,
  skippedSheetCount: number,
  truncatedSheetCount: number,
  fileSelectionTruncated: boolean,
  fileSelectionLimit: number,
  cancelled: boolean,
  phrases: ContentMatchIncompletePhrases = enContentMatchIncompletePhrases,
): string {
  const parts = [
    skippedFileCount > 0 ? phrases.unreadableBooks(skippedFileCount) : '',
    skippedSheetCount > 0 ? phrases.sheetsPastTheIndexLimit(skippedSheetCount) : '',
    truncatedSheetCount > 0 ? phrases.sheetsAtTheCandidateCap(truncatedSheetCount) : '',
    fileSelectionTruncated ? phrases.booksPastTheSelectionLimit(fileSelectionLimit) : '',
    cancelled ? phrases.cancelled() : '',
  ].filter(Boolean);
  return phrases.detail(parts);
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
