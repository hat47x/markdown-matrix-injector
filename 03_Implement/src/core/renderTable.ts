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
  const highlightColumnIndex = resolveColumnSelector(query.params.get('highlightColumn'), headers);
  const highlightValue = query.params.get('highlightValue');
  const formatColumnSpecs = parseFormatColumns(query.params.getAll('formatColumn'), headers);

  const headerHtml = headers
    ? `<thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>`
    : '';
  const bodyHtml = filteredBodyRows
    .map((row) => {
      const rowClasses = ['mmi-table__row'];
      if (shouldHighlightRow(row, highlightColumnIndex, highlightValue)) {
        rowClasses.push('mmi-table__row--highlight');
      }
      const cells = row
        .map((cell, cellIndex) => renderBodyCell(cell, cellIndex, formatColumnSpecs))
        .join('');

      return `<tr class="${rowClasses.join(' ')}">${cells}</tr>`;
    })
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

function resolveColumnSelector(column: string | null, headers?: string[]): number | undefined {
  if (!column) {
    return undefined;
  }

  const normalized = column.trim();
  if (headers) {
    const normalizedHeaderSelector = normalizeComparableValue(normalized);
    const index = headers.findIndex((header) => normalizeComparableValue(header) === normalizedHeaderSelector);
    if (index >= 0) {
      return index;
    }
  }

  if (/^[A-Z]+$/i.test(normalized)) {
    return columnToIndex(normalized.toUpperCase());
  }

  return undefined;
}

function shouldHighlightRow(
  row: string[],
  highlightColumnIndex: number | undefined,
  highlightValue: string | null,
): boolean {
  if (!highlightValue) {
    return false;
  }

  const normalizedHighlightValue = normalizeComparableValue(highlightValue);

  if (highlightColumnIndex === undefined) {
    return row.some((cell) => normalizeComparableValue(cell) === normalizedHighlightValue);
  }

  return normalizeComparableValue(row[highlightColumnIndex] ?? '') === normalizedHighlightValue;
}

function parseFormatColumns(
  formatColumns: readonly string[],
  headers?: string[],
): ReadonlyMap<number, string> {
  const specs = new Map<number, string>();

  for (const formatColumn of formatColumns) {
    const parsedSpec = parseFormatColumnSpec(formatColumn, headers);
    if (!parsedSpec) {
      continue;
    }

    specs.set(parsedSpec.index, parsedSpec.format);
  }

  return specs;
}

function parseFormatColumnSpec(
  formatColumn: string,
  headers?: string[],
): { index: number; format: string } | undefined {
  const [columnSelector, format] = formatColumn.split(':', 2);
  if (!columnSelector || !format) {
    return undefined;
  }

  const normalizedColumnSelector = columnSelector.trim();
  const normalizedFormat = format.trim().toLowerCase();
  if (!normalizedColumnSelector || !normalizedFormat) {
    return undefined;
  }

  const index = resolveColumnSelector(normalizedColumnSelector, headers);
  if (index === undefined) {
    return undefined;
  }

  return {
    index,
    format: normalizedFormat,
  };
}

function renderBodyCell(
  value: string,
  cellIndex: number,
  formatColumnSpecs: ReadonlyMap<number, string>,
): string {
  const cellClasses = ['mmi-table__cell'];
  const renderedCell = renderCellContent(value, cellIndex, formatColumnSpecs);

  if (formatColumnSpecs.has(cellIndex)) {
    cellClasses.push('mmi-table__cell--formatted');
  }

  return `<td class="${cellClasses.join(' ')}">${renderedCell}</td>`;
}

function renderCellContent(
  value: string,
  cellIndex: number,
  formatColumnSpecs: ReadonlyMap<number, string>,
): string {
  const escapedValue = escapeHtml(value);
  const format = formatColumnSpecs.get(cellIndex);

  if (!format) {
    return escapedValue;
  }

  return `<pre class="mmi-table__cell-code" data-format="${escapeHtml(format)}"><code>${escapedValue}</code></pre>`;
}

function normalizeComparableValue(value: string): string {
  return value.trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
