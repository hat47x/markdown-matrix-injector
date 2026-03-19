import { type EmbedQuery } from '../parser/embedSyntax.js';
import { type WorkbookData } from './workbookLoader.js';

const MAX_COLUMNS_BEFORE_CARD = 10;
const MAX_CELLS_BEFORE_CARD = 500;

export function shouldRenderAsCardImmediately(query: EmbedQuery): boolean {
  return query.params.get('mode') === 'card';
}

export function shouldRenderAsCardAfterLoad(query: EmbedQuery, workbook: WorkbookData): boolean {
  const mode = query.params.get('mode');
  if (mode === 'card') {
    return true;
  }

  if (mode === 'table') {
    return false;
  }

  if (!query.target) {
    return true;
  }

  const rows = workbook.sheets[query.target];
  if (!rows) {
    throw new Error(`Sheet not found: ${query.target}`);
  }

  const slicedRows = query.range ? sliceRange(rows, query.range) : rows;
  const columnCount = slicedRows.reduce((max, row) => Math.max(max, row.length), 0);
  const cellCount = slicedRows.reduce((count, row) => count + row.length, 0);

  return columnCount > MAX_COLUMNS_BEFORE_CARD || cellCount > MAX_CELLS_BEFORE_CARD;
}

function sliceRange(rows: string[][], range: string): string[][] {
  const [startRef, endRef = startRef] = range.split(':', 2);
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);

  return rows.slice(start.row, end.row + 1).map((row) => row.slice(start.col, end.col + 1));
}

function parseCellRef(cellRef: string): { row: number; col: number } {
  const match = /^(?<col>[A-Z]+)(?<row>\d+)$/i.exec(cellRef.trim());
  if (!match?.groups) {
    throw new Error(`Invalid range reference: ${cellRef}`);
  }

  return {
    col: columnToIndex(match.groups.col.toUpperCase()),
    row: Number(match.groups.row) - 1,
  };
}

function columnToIndex(column: string): number {
  return [...column].reduce((result, char) => result * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}
