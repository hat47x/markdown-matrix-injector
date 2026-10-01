/**
 * Table regions for search, completion and guided authoring, aware of
 * 方眼紙 grids (02_Architecture/import-assistance.md §7.4).
 *
 * `detectRegions` works on physical cells: on a sheet whose tables are laid
 * out on a merged grid it finds the right rectangle but no header, and the
 * reference it leads to renders as a card. On such a sheet -- one where the
 * import analysis finds a table with a column merged across several physical
 * columns -- the regions come from the import analysis instead: one per
 * table, with its logical columns (`columnAnchors`) and the headers the
 * renderer will show. Every other sheet keeps `detectRegions` unchanged.
 */
import type { SheetSource } from '../core/sheetSource.js';
import { indexToColumn } from '../core/tableGeometry.js';
import { detectRegions, type ColumnProfile, type DetectOptions, type DetectedRegion, type RegionReason } from '../search/regionDetector.js';
import type { SourceCellType } from '../core/sheetSource.js';
import { analyzeSheetForImport, type ImportCandidate } from './importCandidates.js';

const DEFAULT_MAX_VALUE_SAMPLE = 200;
const MAX_VALUE_LENGTH = 64;
/** Smart Fallback's thresholds (spec §7). */
const MAX_TABLE_COLUMNS = 10;
const MAX_TABLE_CELLS = 500;

export function detectTableRegions(sheetName: string, sheet: SheetSource, options: DetectOptions = {}): DetectedRegion[] {
  const regions = detectRegions(sheetName, sheet, options);
  if (sheet.merges.length === 0) return regions;
  const tables = analyzeSheetForImport(sheetName, sheet, { maxScanCells: options.maxScanCells }).filter((candidate) => candidate.role === 'table');
  if (!tables.some((table) => (table.columns ?? []).some((column) => column.endCol > column.startCol))) return regions;
  return tables.map((table) => toRegion(sheetName, sheet, table, options.maxValueSample ?? DEFAULT_MAX_VALUE_SAMPLE));
}

function toRegion(sheetName: string, sheet: SheetSource, table: ImportCandidate, maxSample: number): DetectedRegion {
  const columns = table.columns ?? [];
  const anchors = columns.map((column) => column.anchor);
  const { startRow, endRow } = table.range;
  const text = (row: number, col: number): string => sheet.cellAt(row, col)?.text.trim() ?? '';
  const cautions = new Set(table.cautions.map((caution) => caution.code));
  const hasHeader = !cautions.has('header-not-found');
  // What `header=first` will show: the top row at each anchor.
  const headers = hasHeader ? anchors.map((col) => text(startRow, col)) : undefined;
  const bodyStart = hasHeader ? startRow + 1 : startRow;

  const sample = new Set<string>();
  let nonEmpty = headers?.filter((header) => header !== '').length ?? 0;
  const profiles: ColumnProfile[] = anchors.map((col, i) => {
    const counts: Partial<Record<SourceCellType, number>> = {};
    let filled = 0;
    let total = 0;
    for (let row = bodyStart; row <= endRow; row += 1) {
      total += 1;
      const cell = sheet.cellAt(row, col);
      const value = cell?.text.trim() ?? '';
      if (!cell || value === '') continue;
      filled += 1;
      counts[cell.type] = (counts[cell.type] ?? 0) + 1;
      if (sample.size < maxSample) sample.add(value.slice(0, MAX_VALUE_LENGTH));
    }
    nonEmpty += filled;
    const typeRatio: Partial<Record<SourceCellType, number>> = {};
    for (const [type, count] of Object.entries(counts) as [SourceCellType, number][]) typeRatio[type] = count / filled;
    return { header: headers?.[i], typeRatio, blankRatio: total === 0 ? 1 : 1 - filled / total };
  });

  const reasons: RegionReason[] = ['contains-merged-cells'];
  if (cautions.has('multi-row-header')) reasons.push('header-uncertain');
  if (!hasHeader) reasons.push('no-header');
  return {
    sheet: sheetName,
    range: table.range,
    a1: table.a1,
    title: table.title,
    titleA1: table.titleA1,
    headers,
    headerConfidence: !hasHeader ? 'none' : cautions.has('multi-row-header') ? 'uncertain' : 'likely',
    columns: profiles,
    valueSample: [...sample],
    nonEmptyCells: nonEmpty,
    reasons,
    columnAnchors: anchors,
  };
}

/**
 * Parameters that make a region render as its logical table when the whole
 * region is referenced: `columns=` picking every anchor (letters counted from
 * the region's first column) and `mode=table` when the physical slice passes
 * Smart Fallback's thresholds but the logical table does not. Empty for a
 * region without merged columns. `selected` (indexes into the logical
 * columns) narrows the projection.
 */
export function gridProjection(region: DetectedRegion, selected?: readonly number[]): { columns?: string; mode?: 'table' } {
  const anchors = region.columnAnchors;
  if (!anchors) return {};
  const picked = selected ?? anchors.map((_, i) => i);
  const letters = picked.map((i) => indexToColumn(anchors[i] - region.range.startCol));
  const merged = anchors.some((anchor, i) => (anchors[i + 1] ?? region.range.endCol + 1) - anchor > 1);
  const rows = region.range.endRow - region.range.startRow + 1;
  const physicalColumns = region.range.endCol - region.range.startCol + 1;
  const exceeds = physicalColumns > MAX_TABLE_COLUMNS || physicalColumns * rows > MAX_TABLE_CELLS;
  const fits = picked.length <= MAX_TABLE_COLUMNS && picked.length * rows <= MAX_TABLE_CELLS;
  return {
    ...(merged || selected ? { columns: letters.join(',') } : {}),
    ...(exceeds && fits ? { mode: 'table' as const } : {}),
  };
}

/** The relative column letter of logical column `index` (for `columns=` completion). */
export function logicalColumnLetter(region: DetectedRegion, index: number): string {
  return indexToColumn((region.columnAnchors?.[index] ?? region.range.startCol + index) - region.range.startCol);
}
