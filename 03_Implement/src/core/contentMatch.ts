/**
 * Content-based match search (`input-assistance-paste-provenance.md` §5),
 * for the case where a paste carries no provenance and MMI must find where
 * the pasted values came from by content alone.
 *
 * Given a value matrix already extracted from the clipboard (e.g. via
 * `extractHtmlTableShape` + `parseTsv` in `pasteDrop.ts`), this module finds
 * every rectangle within a single already-loaded `SheetSource` whose
 * displayed values match it exactly -- §5 steps 2-4 (anchor lookup, offset
 * candidates, full-rectangle verification) plus the size/count limits step 5
 * asks for.
 *
 * Out of scope here, by design:
 * - §5 step 1, *which* workbook(s) to search (a workspace-scope / multi-file
 *   product decision -- the caller picks the `SheetSource` to pass in).
 * - The candidate-selection UI and the auto-confirm rule (§4 "自動確定の規則":
 *   a single exact match may still require explicit confirmation; multiple
 *   matches must never auto-confirm). This module only reports candidates;
 *   it never picks one.
 *
 * Neither is wired into any VS Code paste path yet -- see issue-0114
 * "Remaining work".
 */
import type { CellRange, SheetSource } from './sheetSource.js';
import { rangeDimensions } from './tableGeometry.js';

export interface ContentMatch {
  /** Physical (0-based) coordinates in the searched `SheetSource` -- not A1. */
  readonly range: CellRange;
}

export interface ContentMatchOptions {
  /**
   * Upper bound on candidate origins verified against the full needle
   * (§5 step 5: "候補数...に上限...を設ける"). Candidates beyond this are
   * silently dropped -- a large count is treated as "content repeats a lot"
   * (§5 step 6), not an error, since §4's auto-confirm rule already refuses
   * to pick among multiple matches. Default 200.
   */
  readonly maxCandidates?: number;
  /**
   * Upper bound on sheet cells indexed (§5 step 5: "読込サイズ...に上限...
   * を設ける"). Unlike `maxCandidates`, exceeding this throws: silently
   * searching only part of the sheet could miss the true match without any
   * sign that the search was incomplete. Default 200,000.
   */
  readonly maxIndexedCells?: number;
}

interface Position {
  readonly row: number;
  readonly col: number;
}

const DEFAULT_MAX_CANDIDATES = 200;
const DEFAULT_MAX_INDEXED_CELLS = 200_000;
/** How many of the needle's rarest anchors are cross-checked (§5 step 3). */
const MAX_ANCHORS = 5;

/**
 * Finds every rectangle in `sheet` whose displayed values exactly match
 * `needle`, cell for cell. `needle` uses the same convention as
 * `sliceRegion`'s return value: a dense `string[][]`, missing cells already
 * normalised to `''`.
 */
export function findContentMatches(
  sheet: SheetSource,
  needle: readonly (readonly string[])[],
  options?: ContentMatchOptions,
): ContentMatch[] {
  const rowCount = needle.length;
  const columnCount = needle.reduce((max, row) => Math.max(max, row.length), 0);
  if (rowCount === 0 || columnCount === 0) {
    return [];
  }

  const anchors = collectAnchors(needle, rowCount, columnCount);
  if (anchors.length === 0) {
    // Every needle cell is empty -- content alone cannot anchor a search
    // (§5 step 6: "全セルが空...の場合は曖昧さを保ち"). Nothing to find.
    return [];
  }

  const usedRange = sheet.usedRange;
  if (!usedRange) {
    return [];
  }
  const sheetDimensions = rangeDimensions(usedRange);
  if (rowCount > sheetDimensions.rowCount || columnCount > sheetDimensions.columnCount) {
    return [];
  }

  const maxIndexedCells = options?.maxIndexedCells ?? DEFAULT_MAX_INDEXED_CELLS;
  if (sheetDimensions.cellCount > maxIndexedCells) {
    throw new Error(
      `findContentMatches: sheet used range has ${sheetDimensions.cellCount} cells, ` +
        `which exceeds the indexable limit of ${maxIndexedCells}`,
    );
  }

  const index = buildValueIndex(sheet, usedRange);
  const candidateOrigins = candidateOriginsFromAnchors(anchors, index);
  if (candidateOrigins.length === 0) {
    return [];
  }

  const maxCandidates = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const boundedOrigins = sortOrigins(candidateOrigins).slice(0, maxCandidates);

  const results: ContentMatch[] = [];
  for (const origin of boundedOrigins) {
    const range = candidateRange(origin, rowCount, columnCount);
    if (!fitsWithin(range, usedRange)) {
      continue;
    }
    if (rectangleMatches(sheet, range, needle)) {
      results.push({ range });
    }
  }
  return results;
}

interface Anchor extends Position {
  readonly value: string;
}

/** Every non-empty needle cell, in row-major order. */
function collectAnchors(needle: readonly (readonly string[])[], rowCount: number, columnCount: number): Anchor[] {
  const anchors: Anchor[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < columnCount; col += 1) {
      const value = needle[row]?.[col] ?? '';
      if (value !== '') {
        anchors.push({ row, col, value });
      }
    }
  }
  return anchors;
}

function buildValueIndex(sheet: SheetSource, usedRange: CellRange): Map<string, Position[]> {
  const index = new Map<string, Position[]>();
  for (let row = usedRange.startRow; row <= usedRange.endRow; row += 1) {
    for (let col = usedRange.startCol; col <= usedRange.endCol; col += 1) {
      const text = sheet.cellAt(row, col)?.text ?? '';
      if (text === '') {
        continue;
      }
      const positions = index.get(text);
      if (positions) {
        positions.push({ row, col });
      } else {
        index.set(text, [{ row, col }]);
      }
    }
  }
  return index;
}

/**
 * Ranks the needle's anchors by rarity in the source (rarest first, so the
 * primary anchor narrows the search as much as possible -- §5 step 2), then
 * intersects the origins the rarest few imply (§5 step 3), instead of
 * brute-force scanning every possible top-left position (§5 step 4: "全矩形
 * の総当たり走査は行わない").
 */
function candidateOriginsFromAnchors(anchors: readonly Anchor[], index: Map<string, Position[]>): Position[] {
  const ranked = anchors
    .map((anchor) => ({ anchor, positions: index.get(anchor.value) ?? [] }))
    .sort((a, b) => a.positions.length - b.positions.length);

  const primary = ranked[0];
  if (!primary || primary.positions.length === 0) {
    return [];
  }

  let origins = primary.positions.map((position) => originFor(position, primary.anchor));

  for (const { anchor, positions } of ranked.slice(1, MAX_ANCHORS)) {
    if (origins.length <= 1) {
      break;
    }
    const impliedOrigins = new Set(positions.map((position) => originKey(originFor(position, anchor))));
    origins = origins.filter((origin) => impliedOrigins.has(originKey(origin)));
  }

  return dedupeOrigins(origins);
}

function originFor(position: Position, anchor: Anchor): Position {
  return { row: position.row - anchor.row, col: position.col - anchor.col };
}

function originKey(origin: Position): string {
  return `${origin.row},${origin.col}`;
}

function dedupeOrigins(origins: readonly Position[]): Position[] {
  const seen = new Map<string, Position>();
  for (const origin of origins) {
    seen.set(originKey(origin), origin);
  }
  return [...seen.values()];
}

function sortOrigins(origins: readonly Position[]): Position[] {
  return [...origins].sort((a, b) => a.row - b.row || a.col - b.col);
}

function candidateRange(origin: Position, rowCount: number, columnCount: number): CellRange {
  return {
    startRow: origin.row,
    startCol: origin.col,
    endRow: origin.row + rowCount - 1,
    endCol: origin.col + columnCount - 1,
  };
}

function fitsWithin(range: CellRange, usedRange: CellRange): boolean {
  return (
    range.startRow >= usedRange.startRow &&
    range.startCol >= usedRange.startCol &&
    range.endRow <= usedRange.endRow &&
    range.endCol <= usedRange.endCol
  );
}

/** §4 step 5: every displayed value must match -- a partial match is not a candidate. */
function rectangleMatches(sheet: SheetSource, range: CellRange, needle: readonly (readonly string[])[]): boolean {
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const needleValue = needle[row - range.startRow]?.[col - range.startCol] ?? '';
      const sourceValue = sheet.cellAt(row, col)?.text ?? '';
      if (needleValue !== sourceValue) {
        return false;
      }
    }
  }
  return true;
}
