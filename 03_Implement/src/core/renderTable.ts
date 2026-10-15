import { type EmbedQuery } from '../parser/embedSyntax.js';
import type { CooperativeTimeBudget } from './cooperativeTimeBudget.js';
import { escapeHtml } from './html.js';
import { LocalizedError } from './messages/index.js';
import { columnToIndex, sliceRegion } from './tableGeometry.js';
import { type WorkbookData } from './workbookLoader.js';

export interface LogicalTable {
  headers?: string[];
  bodyRows: string[][];
}

export interface LogicalTableWorkOptions {
  budget?: CooperativeTimeBudget;
}

/** The logical table of spec §6 (range → columns → transpose → header → grep), shared by every output format. */
export function buildLogicalTable(
  query: EmbedQuery,
  workbook: WorkbookData,
  options: LogicalTableWorkOptions = {},
): LogicalTable {
  const sheetName = query.target ?? Object.keys(workbook.sheets)[0];
  const sheet = workbook.sheets[sheetName];

  if (!sheet) {
    throw new LocalizedError('sheetNotFound', { sheet: sheetName, available: Object.keys(workbook.sheets) }, { sheet: sheetName });
  }

  // By the time this is called, Smart Fallback has already accepted the
  // region's dimensions (measured without touching a cell -- smartFallback.ts)
  // and decided this reference renders as a table. This is the single point
  // where the corresponding display rectangle is actually materialised.
  const budget = options.budget;
  budget?.check();
  const transformed = applyStructuralTransformations(
    query,
    sliceRegion(sheet, query.range, { budget }),
    budget,
  );
  const { headers, bodyRows } = splitHeaderRows(transformed, query.params.get('header'));
  const filteredBodyRows = applyRowFilters(query, bodyRows, budget);
  budget?.check();
  return { headers, bodyRows: filteredBodyRows };
}

export function renderEmbedTable(
  query: EmbedQuery,
  workbook: WorkbookData,
  options: LogicalTableWorkOptions = {},
): string {
  return renderLogicalTable(query, buildLogicalTable(query, workbook, options), options.budget);
}

/** HTML for an already built logical table; decorations (highlight, formatColumn) come from `query`. */
export function renderLogicalTable(
  query: EmbedQuery,
  logical: LogicalTable,
  budget?: CooperativeTimeBudget,
): string {
  const { headers, bodyRows: filteredBodyRows } = logical;
  const highlightColumnIndex = resolveColumnSelector(query.params.get('highlightColumn'), headers);
  const highlightValue = query.params.get('highlightValue');
  const formatColumnSpecs = parseFormatColumns(query.params.getAll('formatColumn'), headers);

  budget?.check();
  const headerHtml = headers
    ? `<thead><tr>${headers.map((cell) => {
        budget?.consume();
        return `<th>${escapeHtml(cell)}</th>`;
      }).join('')}</tr></thead>`
    : '';
  const bodyHtml = filteredBodyRows
    .map((row) => {
      const rowClasses = ['mmi-table__row'];
      if (shouldHighlightRow(row, highlightColumnIndex, highlightValue)) {
        rowClasses.push('mmi-table__row--highlight');
      }
      const cells = row
        .map((cell, cellIndex) => {
          budget?.consume();
          return renderBodyCell(cell, cellIndex, formatColumnSpecs);
        })
        .join('');

      return `<tr class="${rowClasses.join(' ')}">${cells}</tr>`;
    })
    .join('');

  budget?.check();
  return `<table class="mmi-table">${headerHtml}<tbody>${bodyHtml}</tbody></table>`;
}

function applyStructuralTransformations(
  query: EmbedQuery,
  rows: string[][],
  budget?: CooperativeTimeBudget,
): string[][] {
  let transformed = rows.map((row) => {
    budget?.consume(row.length);
    return [...row];
  });

  const columns = query.params.get('columns');
  if (columns) {
    const columnIndexes = columns
      .split(',')
      .map((column) => columnToIndex(column.trim().toUpperCase()));
    transformed = transformed.map((row) =>
      columnIndexes.map((index) => {
        budget?.consume();
        return row[index] ?? '';
      }),
    );
  }

  const transpose = query.params.get('transpose');
  if (transpose === 'true') {
    transformed = transposeRows(transformed, budget);
  }

  return transformed;
}

function applyRowFilters(query: EmbedQuery, rows: string[][], budget?: CooperativeTimeBudget): string[][] {
  const grep = query.params.get('grep')?.toLowerCase();
  if (!grep) {
    return rows;
  }

  return rows.filter((row) =>
    row.some((cell) => {
      budget?.consume();
      return cell.toLowerCase().includes(grep);
    }),
  );
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

function transposeRows(rows: string[][], budget?: CooperativeTimeBudget): string[][] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, columnIndex) =>
    rows.map((row) => {
      budget?.consume();
      return row[columnIndex] ?? '';
    }),
  );
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
