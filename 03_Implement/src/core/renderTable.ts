import { type EmbedQuery } from '../parser/embedSyntax.js';
import { type WorkbookData } from './workbookLoader.js';

export function renderEmbedTable(query: EmbedQuery, workbook: WorkbookData): string {
  const sheetName = query.target ?? Object.keys(workbook.sheets)[0];
  const rows = workbook.sheets[sheetName];

  if (!rows) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const transformed = applyStructuralTransformations(query, query.range ? sliceRange(rows, query.range) : rows);
  const { headers, bodyRows } = splitHeaderRows(transformed, query.params.get('header'));
  const filteredBodyRows = applyRowFilters(query, bodyRows);

  const headerHtml = headers
    ? `<thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>`
    : '';
  const bodyHtml = filteredBodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `<table class="mmi-table">${headerHtml}<tbody>${bodyHtml}</tbody></table>`;
}

function applyStructuralTransformations(query: EmbedQuery, rows: string[][]): string[][] {
  let transformed = rows.map((row) => [...row]);

  const columns = query.params.get('columns');
  if (columns) {
    const columnIndexes = columns
      .split(',')
      .map((column) => columnToIndex(column.trim().toUpperCase()));
    transformed = transformed.map((row) => columnIndexes.map((index) => row[index] ?? ''));
  }

  const transpose = query.params.get('transpose');
  if (transpose === 'true') {
    transformed = transposeRows(transformed);
  }

  return transformed;
}

function applyRowFilters(query: EmbedQuery, rows: string[][]): string[][] {
  const grep = query.params.get('grep')?.toLowerCase();
  if (!grep) {
    return rows;
  }

  return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(grep)));
}

function splitHeaderRows(rows: string[][], headerMode: string | null): { headers?: string[]; bodyRows: string[][] } {
  if (rows.length === 0 || headerMode === 'none') {
    return { bodyRows: rows };
  }

  if (headerMode === 'first') {
    return {
      headers: rows[0],
      bodyRows: rows.slice(1),
    };
  }

  if (headerMode && /^\d+$/.test(headerMode)) {
    const headerIndex = Number(headerMode) - 1;
    const headers = rows[headerIndex];
    if (!headers) {
      throw new Error(`Header row not found: ${headerMode}`);
    }

    return {
      headers,
      bodyRows: rows.filter((_, index) => index !== headerIndex),
    };
  }

  return { bodyRows: rows };
}

function transposeRows(rows: string[][]): string[][] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, columnIndex) => rows.map((row) => row[columnIndex] ?? ''));
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
