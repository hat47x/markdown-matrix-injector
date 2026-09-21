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

export interface WorkbookSheetsSource {
  /** Path as it should appear in the resulting `![[...]]` reference (already relativized by the caller). */
  readonly filepath: string;
  readonly sheets: Readonly<Record<string, SheetSource>>;
}

export interface WorkbookContentMatch {
  readonly filepath: string;
  readonly sheet: string;
  readonly range: CellRange;
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

  return sheetMatches.map((match) => ({ filepath, sheet: sheetName, range: match.range }));
}

/** Renders a content match as the `![[file#sheet|range]]` text to insert. */
export function buildContentMatchMarkdown(match: WorkbookContentMatch): string {
  return `![[${match.filepath}#${match.sheet}|${cellRangeToA1(match.range)}]]`;
}
