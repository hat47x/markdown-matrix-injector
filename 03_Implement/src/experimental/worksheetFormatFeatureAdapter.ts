import { normalizeFormatFeatures } from './flyInspiredFormatMatcher.js';

export type FormatFillTone = 'dark' | 'gray' | 'light' | 'none' | 'other';
export type FormatBorderKind = 'grid' | 'thin' | 'none' | 'other';

export interface WorksheetFormatCell {
  row: number;
  column: number;
  text?: string;
  fillTone?: FormatFillTone;
  borderKind?: FormatBorderKind;
}

export interface WorksheetFormatMerge {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface WorksheetFormatSnapshot {
  cells: readonly WorksheetFormatCell[];
  merges?: readonly WorksheetFormatMerge[];
}

export interface WorksheetFormatFeatureOptions {
  maxHeaderScanRows?: number;
}

export interface WorksheetFormatFeatureObservation {
  features: readonly string[];
  headerRow?: number;
  headerColumns: readonly number[];
}

interface RowCandidate {
  row: number;
  cells: WorksheetFormatCell[];
  score: number;
}

const DEFAULT_MAX_HEADER_SCAN_ROWS = 20;

export function extractWorksheetFormatFeatures(
  snapshot: WorksheetFormatSnapshot,
  options: WorksheetFormatFeatureOptions = {},
): WorksheetFormatFeatureObservation {
  const maxHeaderScanRows = options.maxHeaderScanRows ?? DEFAULT_MAX_HEADER_SCAN_ROWS;
  if (!Number.isInteger(maxHeaderScanRows) || maxHeaderScanRows <= 0) {
    throw new Error('maxHeaderScanRows must be a positive integer.');
  }

  const cells = validateAndCanonicalizeCells(snapshot.cells);
  const merges = validateMerges(snapshot.merges ?? []);
  const header = selectHeaderRow(cells, maxHeaderScanRows);
  if (!header) return { features: [], headerColumns: [] };

  const headerColumns = header.cells
    .filter((cell) => normalizedText(cell.text) !== '')
    .map((cell) => cell.column)
    .sort((left, right) => left - right);
  const features: string[] = [];

  if (hasTitleRow(cells, merges, header.row, headerColumns)) features.push('region:title-row');

  const fillTone = dominantValue(header.cells.map((cell) => cell.fillTone).filter(isMeaningfulFillTone));
  if (fillTone) features.push(`header:${fillTone}-fill`);

  for (const cell of header.cells) {
    const label = normalizedText(cell.text);
    if (label !== '') features.push(`column:${label}`);
  }

  const borderKind = dominantValue(
    cells.filter((cell) => normalizedText(cell.text) !== '')
      .map((cell) => cell.borderKind)
      .filter(isMeaningfulBorderKind),
  );
  if (borderKind) features.push(`border:${borderKind}`);

  if (headerColumns.length >= 2) {
    const span = headerColumns[headerColumns.length - 1] - headerColumns[0] + 1;
    features.push(`layout:${span}-columns`);
  }

  return { features: normalizeFormatFeatures(features), headerRow: header.row, headerColumns };
}

function validateAndCanonicalizeCells(input: readonly WorksheetFormatCell[]): WorksheetFormatCell[] {
  const coordinates = new Set<string>();
  const result = input.map((cell) => {
    assertCoordinate('row', cell.row);
    assertCoordinate('column', cell.column);
    const key = `${cell.row}:${cell.column}`;
    if (coordinates.has(key)) throw new Error(`Duplicate worksheet cell coordinate: ${key}.`);
    coordinates.add(key);
    return { ...cell };
  });
  return result.sort((left, right) => left.row - right.row || left.column - right.column);
}

function validateMerges(input: readonly WorksheetFormatMerge[]): WorksheetFormatMerge[] {
  return input.map((merge) => {
    assertCoordinate('startRow', merge.startRow);
    assertCoordinate('startColumn', merge.startColumn);
    assertCoordinate('endRow', merge.endRow);
    assertCoordinate('endColumn', merge.endColumn);
    if (merge.endRow < merge.startRow || merge.endColumn < merge.startColumn) {
      throw new Error('Worksheet merge end must not precede start.');
    }
    return { ...merge };
  });
}

function selectHeaderRow(cells: readonly WorksheetFormatCell[], maxRows: number): RowCandidate | undefined {
  const byRow = new Map<number, WorksheetFormatCell[]>();
  for (const cell of cells) {
    if (cell.row >= maxRows || normalizedText(cell.text) === '') continue;
    const row = byRow.get(cell.row) ?? [];
    row.push(cell);
    byRow.set(cell.row, row);
  }

  const candidates: RowCandidate[] = [];
  for (const [row, rowCells] of byRow) {
    if (rowCells.length < 2) continue;
    const fillEvidence = rowCells.filter((cell) => isMeaningfulFillTone(cell.fillTone)).length;
    const borderEvidence = rowCells.filter((cell) => isMeaningfulBorderKind(cell.borderKind)).length;
    const score = rowCells.length + (fillEvidence * 1.5) + (borderEvidence * 0.5);
    candidates.push({ row, cells: [...rowCells].sort((a, b) => a.column - b.column), score });
  }
  return candidates.sort((left, right) => right.score - left.score || left.row - right.row)[0];
}

function hasTitleRow(
  cells: readonly WorksheetFormatCell[], merges: readonly WorksheetFormatMerge[],
  headerRow: number, headerColumns: readonly number[],
): boolean {
  if (headerColumns.length < 2) return false;
  const headerStart = headerColumns[0];
  const headerEnd = headerColumns[headerColumns.length - 1];
  return merges.some((merge) => {
    if (merge.startRow >= headerRow || merge.startRow !== merge.endRow) return false;
    const overlapStart = Math.max(merge.startColumn, headerStart);
    const overlapEnd = Math.min(merge.endColumn, headerEnd);
    if (overlapEnd - overlapStart + 1 < 2) return false;
    return cells.some((cell) => cell.row === merge.startRow
      && cell.column >= merge.startColumn && cell.column <= merge.endColumn
      && normalizedText(cell.text) !== '');
  });
}

function normalizedText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}
function isMeaningfulFillTone(value: FormatFillTone | undefined): value is Exclude<FormatFillTone, 'none' | 'other'> {
  return value === 'dark' || value === 'gray' || value === 'light';
}
function isMeaningfulBorderKind(value: FormatBorderKind | undefined): value is Exclude<FormatBorderKind, 'none' | 'other'> {
  return value === 'grid' || value === 'thin';
}
function dominantValue<T extends string>(values: readonly T[]): T | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([lv, lc], [rv, rc]) => rc - lc || lv.localeCompare(rv))[0]?.[0];
}
function assertCoordinate(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
}
