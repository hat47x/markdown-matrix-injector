/**
 * Table-region detection over a `SheetSource` (input-assistance-cpu-search.md
 * §2.1). Regions are found by splitting the occupied area into bands separated
 * by fully empty rows, then each band into blocks separated by fully empty
 * columns -- linear in scanned cells, and it never enumerates candidate
 * rectangles.
 *
 * Merged ranges come from `sheet.merges` (the workbook's own declaration) and
 * count as occupied; nothing is inferred from blank cells. Any boundary the
 * detector is not sure about is carried as a `reason` on the region rather
 * than silently decided.
 */
import type { CellRange, SheetSource, SourceCellType } from '../core/sheetSource.js';
import { cellRangeToA1 } from '../core/tableGeometry.js';

export type RegionReason =
  | 'split-by-blank-row'
  | 'split-by-blank-column'
  | 'contains-merged-cells'
  | 'header-uncertain'
  | 'no-header'
  | 'truncated-scan'
  | 'single-row'
  | 'single-column';

export type HeaderConfidence = 'likely' | 'uncertain' | 'none';

export interface ColumnProfile {
  header?: string;
  /** Share of non-empty body cells per SheetJS type code. */
  typeRatio: Partial<Record<SourceCellType, number>>;
  blankRatio: number;
}

export interface DetectedRegion {
  sheet: string;
  /** Physical 0-based range, header row included, title row excluded. */
  range: CellRange;
  a1: string;
  title?: string;
  titleA1?: string;
  headers?: string[];
  headerConfidence: HeaderConfidence;
  columns: ColumnProfile[];
  valueSample: string[];
  nonEmptyCells: number;
  reasons: RegionReason[];
  /**
   * Set only for a table on a merged grid (方眼紙; importAssist/tableRegions.ts):
   * the physical column holding each logical column's value. `headers` and
   * `columns` then follow these anchors, not the physical columns.
   */
  columnAnchors?: number[];
}

export interface DetectOptions {
  /** Upper bound on cells scanned per sheet (rows are truncated beyond it). */
  maxScanCells?: number;
  /** Distinct body values kept per region for value-role features. */
  maxValueSample?: number;
}

const DEFAULT_MAX_SCAN_CELLS = 1_000_000;
const DEFAULT_MAX_VALUE_SAMPLE = 200;
const MAX_VALUE_LENGTH = 64;

interface Block {
  top: number;
  bottom: number;
  left: number;
  right: number;
  splitByRow: boolean;
  splitByColumn: boolean;
}

export function detectRegions(sheetName: string, sheet: SheetSource, options: DetectOptions = {}): DetectedRegion[] {
  const used = sheet.usedRange;
  if (!used) return [];

  const maxScan = options.maxScanCells ?? DEFAULT_MAX_SCAN_CELLS;
  const width = used.endCol - used.startCol + 1;
  const maxRows = Math.max(1, Math.floor(maxScan / Math.max(1, width)));
  const lastRow = Math.min(used.endRow, used.startRow + maxRows - 1);
  const truncated = lastRow < used.endRow;

  const occupied = new Map<number, Set<number>>();
  const mark = (row: number, col: number): void => {
    let cols = occupied.get(row);
    if (!cols) occupied.set(row, (cols = new Set()));
    cols.add(col);
  };
  for (let row = used.startRow; row <= lastRow; row += 1) {
    for (let col = used.startCol; col <= used.endCol; col += 1) {
      const cell = sheet.cellAt(row, col);
      if (cell && cell.text.trim() !== '') mark(row, col);
    }
  }
  for (const merge of sheet.merges) {
    if (merge.startRow > lastRow) continue;
    for (let row = merge.startRow; row <= Math.min(merge.endRow, lastRow); row += 1) {
      for (let col = merge.startCol; col <= merge.endCol; col += 1) mark(row, col);
    }
  }

  const blocks = findBlocks(occupied);
  const regions: DetectedRegion[] = [];
  const consumedAsTitle = new Set<Block>();

  // A one-cell block right above another block (at most one blank row between)
  // whose columns overlap is that block's title, not a region of its own.
  const titleFor = new Map<Block, Block>();
  for (const candidate of blocks) {
    if (candidate.top !== candidate.bottom) continue;
    const cells = occupiedCellsIn(occupied, candidate);
    if (cells.length !== 1 && !isSingleMerge(sheet.merges, candidate)) continue;
    const below = blocks.find(
      (other) =>
        other !== candidate &&
        other.top > candidate.bottom &&
        other.top - candidate.bottom <= 2 &&
        other.left <= candidate.right &&
        other.right >= candidate.left &&
        !titleFor.has(other),
    );
    if (below) {
      titleFor.set(below, candidate);
      consumedAsTitle.add(candidate);
    }
  }

  for (const block of blocks) {
    if (consumedAsTitle.has(block)) continue;
    let { top } = block;
    let title: string | undefined;
    let titleA1: string | undefined;
    const reasons: RegionReason[] = [];

    const detachedTitle = titleFor.get(block);
    if (detachedTitle) {
      const [cell] = occupiedCellsIn(occupied, detachedTitle);
      const titleRow = detachedTitle.top;
      const titleCol = cell ?? detachedTitle.left;
      title = sheet.cellAt(titleRow, titleCol)?.text.trim();
      titleA1 = cellRangeToA1({ startRow: titleRow, startCol: titleCol, endRow: titleRow, endCol: titleCol });
    } else if (block.bottom > top && block.right > block.left) {
      // Title glued to the table: first row holds exactly one value (or one
      // merge) while the next row is populated across the block.
      const firstRow = occupiedCellsInRow(occupied, top, block);
      const secondRow = occupiedCellsInRow(occupied, top + 1, block);
      const firstIsSingle =
        firstRow.length === 1 || isSingleMerge(sheet.merges, { ...block, top, bottom: top });
      if (firstIsSingle && secondRow.length >= 2) {
        const col = firstRow[0] ?? block.left;
        title = sheet.cellAt(top, col)?.text.trim();
        titleA1 = cellRangeToA1({ startRow: top, startCol: col, endRow: top, endCol: col });
        top += 1;
      }
    }

    const range: CellRange = { startRow: top, startCol: block.left, endRow: block.bottom, endCol: block.right };
    const rowCount = range.endRow - range.startRow + 1;
    const colCount = range.endCol - range.startCol + 1;
    if (block.splitByRow) reasons.push('split-by-blank-row');
    if (block.splitByColumn) reasons.push('split-by-blank-column');
    if (truncated) reasons.push('truncated-scan');
    if (rowCount === 1) reasons.push('single-row');
    if (colCount === 1) reasons.push('single-column');
    if (sheet.merges.some((merge) => overlaps(merge, range))) reasons.push('contains-merged-cells');

    const header = classifyHeader(sheet, range);
    if (header.confidence === 'uncertain') reasons.push('header-uncertain');
    if (header.confidence === 'none') reasons.push('no-header');

    const bodyStart = header.confidence === 'none' ? range.startRow : range.startRow + 1;
    const columns: ColumnProfile[] = [];
    const sample = new Set<string>();
    const maxSample = options.maxValueSample ?? DEFAULT_MAX_VALUE_SAMPLE;
    let nonEmpty = 0;
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const counts: Partial<Record<SourceCellType, number>> = {};
      let filled = 0;
      let total = 0;
      for (let row = bodyStart; row <= range.endRow; row += 1) {
        total += 1;
        const cell = sheet.cellAt(row, col);
        if (!cell || cell.text.trim() === '') continue;
        filled += 1;
        counts[cell.type] = (counts[cell.type] ?? 0) + 1;
        if (sample.size < maxSample) sample.add(cell.text.trim().slice(0, MAX_VALUE_LENGTH));
      }
      nonEmpty += filled;
      const typeRatio: Partial<Record<SourceCellType, number>> = {};
      for (const [type, count] of Object.entries(counts) as [SourceCellType, number][]) {
        typeRatio[type] = filled === 0 ? 0 : count / filled;
      }
      columns.push({
        header: header.texts?.[col - range.startCol],
        typeRatio,
        blankRatio: total === 0 ? 1 : 1 - filled / total,
      });
    }
    if (header.texts) nonEmpty += header.texts.filter((text) => text !== '').length;

    regions.push({
      sheet: sheetName,
      range,
      a1: cellRangeToA1(range),
      title,
      titleA1,
      headers: header.texts,
      headerConfidence: header.confidence,
      columns,
      valueSample: [...sample],
      nonEmptyCells: nonEmpty,
      reasons,
    });
  }
  return regions;
}

function findBlocks(occupied: Map<number, Set<number>>): Block[] {
  const rows = [...occupied.keys()].sort((a, b) => a - b);
  const bands: number[][] = [];
  for (const row of rows) {
    const band = bands[bands.length - 1];
    if (band && row === band[band.length - 1] + 1) band.push(row);
    else bands.push([row]);
  }
  const multipleBands = bands.length > 1;

  const blocks: Block[] = [];
  for (const band of bands) {
    const cols = new Set<number>();
    for (const row of band) for (const col of occupied.get(row) ?? []) cols.add(col);
    const sortedCols = [...cols].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const col of sortedCols) {
      const group = groups[groups.length - 1];
      if (group && col === group[group.length - 1] + 1) group.push(col);
      else groups.push([col]);
    }
    for (const group of groups) {
      const left = group[0];
      const right = group[group.length - 1];
      const inGroup = band.filter((row) => [...(occupied.get(row) ?? [])].some((col) => col >= left && col <= right));
      blocks.push({
        top: inGroup[0],
        bottom: inGroup[inGroup.length - 1],
        left,
        right,
        splitByRow: multipleBands,
        splitByColumn: groups.length > 1,
      });
    }
  }
  return blocks;
}

function occupiedCellsIn(occupied: Map<number, Set<number>>, block: Block): number[] {
  const cols: number[] = [];
  for (let row = block.top; row <= block.bottom; row += 1) {
    for (const col of occupied.get(row) ?? []) if (col >= block.left && col <= block.right) cols.push(col);
  }
  return cols.sort((a, b) => a - b);
}

function occupiedCellsInRow(occupied: Map<number, Set<number>>, row: number, block: Block): number[] {
  return [...(occupied.get(row) ?? [])].filter((col) => col >= block.left && col <= block.right).sort((a, b) => a - b);
}

function isSingleMerge(merges: readonly CellRange[], block: Block): boolean {
  return merges.some(
    (merge) =>
      merge.startRow <= block.top &&
      merge.endRow >= block.bottom &&
      merge.startCol <= block.left &&
      merge.endCol >= block.right,
  );
}

function overlaps(a: CellRange, b: CellRange): boolean {
  return a.startRow <= b.endRow && a.endRow >= b.startRow && a.startCol <= b.endCol && a.endCol >= b.startCol;
}

interface HeaderClassification {
  confidence: HeaderConfidence;
  texts?: string[];
}

/**
 * The first row is a header when its populated cells are all text and fill
 * most of the width. It is "likely" when the body disagrees with it in type
 * (some body column is mostly non-text) or its values never recur in the body;
 * otherwise it is "uncertain" and flagged -- a header is never asserted on
 * shape alone.
 */
function classifyHeader(sheet: SheetSource, range: CellRange): HeaderClassification {
  const width = range.endCol - range.startCol + 1;
  const texts: string[] = [];
  let populated = 0;
  let allText = true;
  for (let col = range.startCol; col <= range.endCol; col += 1) {
    const cell = sheet.cellAt(range.startRow, col);
    const text = cell?.text.trim() ?? '';
    texts.push(text);
    if (text === '') continue;
    populated += 1;
    if (cell?.type !== 's') allText = false;
  }
  if (range.endRow === range.startRow || !allText || populated < Math.max(1, Math.ceil(width * 0.6))) {
    return { confidence: 'none' };
  }

  let bodyDisagrees = false;
  let valuesRecur = false;
  for (let col = range.startCol; col <= range.endCol; col += 1) {
    let nonText = 0;
    let filled = 0;
    const headerText = texts[col - range.startCol];
    for (let row = range.startRow + 1; row <= range.endRow; row += 1) {
      const cell = sheet.cellAt(row, col);
      if (!cell || cell.text.trim() === '') continue;
      filled += 1;
      if (cell.type !== 's') nonText += 1;
      if (headerText !== '' && cell.text.trim() === headerText) valuesRecur = true;
    }
    if (filled > 0 && nonText / filled >= 0.5) bodyDisagrees = true;
  }
  const distinct = new Set(texts.filter((text) => text !== '')).size === populated;
  const likely = bodyDisagrees || (distinct && !valuesRecur);
  return { confidence: likely ? 'likely' : 'uncertain', texts };
}
