import type {
  FormatBorderKind,
  FormatFillTone,
  WorksheetFormatCell,
  WorksheetFormatMerge,
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';

export interface SheetJsCellLike {
  v?: unknown;
  w?: string;
  s?: unknown;
}

export interface SheetJsRangeLike {
  s?: { r?: unknown; c?: unknown };
  e?: { r?: unknown; c?: unknown };
}

export interface SheetJsWorksheetLike {
  '!ref'?: unknown;
  '!data'?: unknown;
  '!merges'?: unknown;
  [address: string]: unknown;
}

interface CellAddress { row: number; column: number; }
interface CellRange { startRow: number; startColumn: number; endRow: number; endColumn: number; }

type UnknownRecord = Record<string, unknown>;

/**
 * Converts the stable parts of a SheetJS worksheet representation to the
 * experimental format snapshot used by the fly-inspired matcher pipeline.
 * The bridge is read-only and never mutates the supplied worksheet.
 */
export function sheetJsWorksheetToFormatSnapshot(worksheet: SheetJsWorksheetLike): WorksheetFormatSnapshot {
  const range = decodeWorksheetRange(worksheet['!ref']);
  if (!range) return { cells: [], merges: [] };

  const cells = isDenseWorksheetData(worksheet['!data'])
    ? collectDenseCells(worksheet['!data'], range)
    : collectSparseCells(worksheet, range);
  const merges = collectMerges(worksheet['!merges'], range);

  return { cells, merges };
}

function collectSparseCells(worksheet: SheetJsWorksheetLike, range: CellRange): WorksheetFormatCell[] {
  const cells: WorksheetFormatCell[] = [];
  for (const [key, value] of Object.entries(worksheet)) {
    if (key.startsWith('!') || !isSheetJsCell(value)) continue;
    const address = decodeCellAddress(key);
    if (!address || !isInsideRange(address, range)) continue;
    cells.push(toFormatCell(address, value));
  }
  return sortCells(cells);
}

function collectDenseCells(data: unknown[][], range: CellRange): WorksheetFormatCell[] {
  const cells: WorksheetFormatCell[] = [];
  const endRow = Math.min(range.endRow, data.length - 1);
  for (let row = range.startRow; row <= endRow; row += 1) {
    const sourceRow = data[row];
    if (!Array.isArray(sourceRow)) continue;
    const endColumn = Math.min(range.endColumn, sourceRow.length - 1);
    for (let column = range.startColumn; column <= endColumn; column += 1) {
      const value = sourceRow[column];
      if (!isSheetJsCell(value)) continue;
      cells.push(toFormatCell({ row, column }, value));
    }
  }
  return sortCells(cells);
}

function collectMerges(value: unknown, range: CellRange): WorksheetFormatMerge[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('SheetJS worksheet !merges must be an array when present.');

  const merges = value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`SheetJS merge at index ${index} is invalid.`);
    const decoded = decodeSheetJsRange(entry as SheetJsRangeLike);
    if (!decoded) throw new Error(`SheetJS merge at index ${index} is invalid.`);
    return decoded;
  }).filter((merge) => rangesOverlap(merge, range));

  return merges
    .map(({ startRow, startColumn, endRow, endColumn }) => ({ startRow, startColumn, endRow, endColumn }))
    .sort((left, right) => left.startRow - right.startRow || left.startColumn - right.startColumn
      || left.endRow - right.endRow || left.endColumn - right.endColumn);
}

function toFormatCell(address: CellAddress, cell: SheetJsCellLike): WorksheetFormatCell {
  const text = cellText(cell);
  const fillTone = classifyFillTone(cell.s);
  const borderKind = classifyBorderKind(cell.s);
  return {
    row: address.row,
    column: address.column,
    ...(text === undefined ? {} : { text }),
    ...(fillTone === undefined ? {} : { fillTone }),
    ...(borderKind === undefined ? {} : { borderKind }),
  };
}

export function classifySheetJsFillTone(style: unknown): FormatFillTone | undefined {
  return classifyFillTone(style);
}

export function classifySheetJsBorderKind(style: unknown): FormatBorderKind | undefined {
  return classifyBorderKind(style);
}

function classifyFillTone(style: unknown): FormatFillTone | undefined {
  if (!isRecord(style)) return undefined;
  const fill = isRecord(style.fill) ? style.fill : style;
  const patternType = stringValue(fill.patternType)?.toLowerCase();
  if (patternType === 'none') return 'none';

  const color = firstDefined(fill.fgColor, fill.bgColor, style.fgColor, style.bgColor);
  if (color == null) return patternType ? 'other' : undefined;
  const rgb = extractRgb(color);
  if (!rgb) return 'other';

  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  if (max - min <= 18 && luma >= 72 && luma <= 205) return 'gray';
  if (luma <= 110) return 'dark';
  if (luma >= 205) return 'light';
  return 'other';
}

function classifyBorderKind(style: unknown): FormatBorderKind | undefined {
  if (!isRecord(style)) return undefined;
  const border = isRecord(style.border) ? style.border : style;
  const sides = ['top', 'right', 'bottom', 'left']
    .map((key) => lineStyle(border[key]))
    .filter((value): value is string => value !== undefined && value !== 'none');

  if (sides.length === 0) return undefined;
  if (sides.length === 4) return 'grid';
  if (sides.every((value) => value === 'thin' || value === 'hair')) return 'thin';
  return 'other';
}

function lineStyle(value: unknown): string | undefined {
  if (typeof value === 'string') return value.toLowerCase();
  if (!isRecord(value)) return undefined;
  return stringValue(value.style)?.toLowerCase();
}

function cellText(cell: SheetJsCellLike): string | undefined {
  if (typeof cell.w === 'string') return cell.w;
  const value = cell.v;
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function decodeWorksheetRange(value: unknown): CellRange | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parts = value.split(':');
  if (parts.length > 2) throw new Error(`Unsupported SheetJS worksheet range: ${value}.`);
  const start = decodeCellAddress(parts[0]);
  const end = decodeCellAddress(parts[1] ?? parts[0]);
  if (!start || !end || end.row < start.row || end.column < start.column) {
    throw new Error(`Invalid SheetJS worksheet range: ${value}.`);
  }
  return { startRow: start.row, startColumn: start.column, endRow: end.row, endColumn: end.column };
}

function decodeSheetJsRange(value: SheetJsRangeLike): CellRange | undefined {
  const startRow = nonNegativeInteger(value.s?.r);
  const startColumn = nonNegativeInteger(value.s?.c);
  const endRow = nonNegativeInteger(value.e?.r);
  const endColumn = nonNegativeInteger(value.e?.c);
  if (startRow === undefined || startColumn === undefined || endRow === undefined || endColumn === undefined) return undefined;
  if (endRow < startRow || endColumn < startColumn) return undefined;
  return { startRow, startColumn, endRow, endColumn };
}

function decodeCellAddress(value: string): CellAddress | undefined {
  const match = /^\$?([A-Za-z]+)\$?([1-9][0-9]*)$/u.exec(value);
  if (!match) return undefined;
  let column = 0;
  for (const char of match[1].toUpperCase()) column = (column * 26) + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (!Number.isSafeInteger(row)) return undefined;
  return { row: row - 1, column: column - 1 };
}

function extractRgb(value: unknown): { r: number; g: number; b: number } | undefined {
  const raw = typeof value === 'string' ? value : isRecord(value) ? stringValue(value.rgb) : undefined;
  if (!raw) return undefined;
  const normalized = raw.replace(/^#/u, '').toUpperCase();
  const hex = normalized.length === 8 ? normalized.slice(2) : normalized;
  if (!/^[0-9A-F]{6}$/u.test(hex)) return undefined;
  return { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16) };
}

function isSheetJsCell(value: unknown): value is SheetJsCellLike {
  if (!isRecord(value)) return false;
  return 'v' in value || 'w' in value || 's' in value;
}
function isDenseWorksheetData(value: unknown): value is unknown[][] { return Array.isArray(value); }
function isRecord(value: unknown): value is UnknownRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function firstDefined(...values: unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
function nonNegativeInteger(value: unknown): number | undefined { return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined; }
function isInsideRange(address: CellAddress, range: CellRange): boolean { return address.row >= range.startRow && address.row <= range.endRow && address.column >= range.startColumn && address.column <= range.endColumn; }
function rangesOverlap(left: CellRange, right: CellRange): boolean { return left.startRow <= right.endRow && right.startRow <= left.endRow && left.startColumn <= right.endColumn && right.startColumn <= left.endColumn; }
function sortCells(cells: WorksheetFormatCell[]): WorksheetFormatCell[] { return cells.sort((left, right) => left.row - right.row || left.column - right.column); }
