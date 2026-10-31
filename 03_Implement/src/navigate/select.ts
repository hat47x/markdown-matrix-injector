/**
 * Selecting part of a table by what it says, not by cell coordinates
 * (02_Architecture/table-navigation.md §4): the table by its Excel table
 * name, defined name, title or range; columns by header name; rows by a
 * keyword (optionally tied to a column) or by count from the top.
 *
 * The result is ordinary MMI Notation v1 -- `columns=` letters, `grep=`, a
 * narrowed range -- and it is accepted only after the renderer shows what
 * was asked for. Where v1 cannot express the request exactly (`grep` matches
 * any shown cell, not one column), the result says so with counts instead of
 * silently widening the selection.
 */
import { EXPECTED_TABLE_PARAM } from '../core/expectedBinding.js';
import { currentBelowRows, EXPECTED_BELOW_PARAM } from '../core/expectedBelow.js';
import { encodeHeaderListForQuery, EXPECTED_HEADERS_PARAM, formatHeaderList } from '../core/expectedHeaders.js';
import { buildLogicalTable } from '../core/renderTable.js';
import { getSmartFallbackDecisionAfterLoad } from '../core/smartFallback.js';
import { cellRangeToA1, indexToColumn } from '../core/tableGeometry.js';
import type { ImportCandidate } from '../importAssist/importCandidates.js';
import { parseEmbedSyntax } from '../parser/embedSyntax.js';
import { bigramDice } from '../search/textFeatures.js';
import { catalogTable, type CatalogTable, type LoadedBook } from './catalog.js';

export const SELECTION_SCHEMA = 'mmi.selection/v0';

export type RowSelection = { contains: string; column?: string } | { first: number };

export interface SelectionRequest {
  sheet?: string;
  /** Table id (`sheet!A1:B2`), Excel table name, defined name, title, or A1 range on `sheet`. */
  table: string;
  /** Header names, in the order to show them. Omit for every column. */
  columns?: string[];
  rows?: RowSelection;
}

export interface SelectionIssue {
  code:
    | 'TABLE_NOT_FOUND'
    | 'TABLE_AMBIGUOUS'
    | 'COLUMN_NOT_FOUND'
    | 'COLUMN_AMBIGUOUS'
    | 'NO_HEADER'
    | 'FILTER_COLUMN_NOT_SHOWN'
    | 'GREP_NOT_EXACT'
    | 'NO_ROWS_MATCH'
    | 'RENDER_FAILED'
    | 'SOURCE_DIGEST_MISMATCH'
    | 'TABLE_CAUTION';
  message: string;
  suggestions?: string[];
}

export interface SelectionResult {
  schema: typeof SELECTION_SCHEMA;
  ok: boolean;
  reference?: string;
  table?: Pick<CatalogTable, 'id' | 'sheet' | 'range' | 'title' | 'excelTable'>;
  columns?: { header: string; letter: string }[];
  rows?: { mode: 'all' | 'contains' | 'first'; shown: number; ofTotal: number; exact: boolean };
  renderMode?: 'table' | 'card';
  /**
   * A sample for confirming the selection, not the whole range. `rows` holds at most
   * `limit` (SELECTION_PREVIEW_ROW_LIMIT) rows; `truncated` says rows were left out.
   */
  preview?: { headers?: string[]; rows: string[][]; limit: number; shown: number; ofSelected: number; truncated: boolean };
  errors: SelectionIssue[];
  warnings: SelectionIssue[];
}

/** Rows `preview` carries. A selection of more rows is cut to this many and flagged by `preview.truncated`. */
export const SELECTION_PREVIEW_ROW_LIMIT = 5;

const MAX_TABLE_COLUMNS = 10;
const MAX_TABLE_CELLS = 500;

const normalize = (text: string): string => text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const withoutNumbering = (text: string): string => normalize(text).replace(/^(?:\d+(?:[.．]\d+)*[.．、)）]?|第.+?[章節])/, '');

export function selectFromBook(book: LoadedBook, referencePath: string, request: SelectionRequest): SelectionResult {
  const result: SelectionResult = { schema: SELECTION_SCHEMA, ok: false, errors: [], warnings: [] };
  const found = findTable(book, request);
  if ('error' in found) {
    result.errors.push(found.error);
    return result;
  }
  const table = found.table;
  const info = catalogTable(table, 0);
  result.table = { id: info.id, sheet: info.sheet, range: info.range, ...(info.title ? { title: info.title } : {}), ...(info.excelTable ? { excelTable: info.excelTable } : {}) };
  for (const caution of table.cautions) result.warnings.push({ code: 'TABLE_CAUTION', message: caution.message });

  // Columns by header name.
  const columns = table.columns ?? [];
  let selected = columns.map((_, i) => i);
  if (request.columns && request.columns.length > 0) {
    if (!info.hasHeader) {
      result.errors.push({ code: 'NO_HEADER', message: 'この表には見出し行が見つからないため、列を名前で選べません。' });
      return result;
    }
    selected = [];
    for (const wanted of request.columns) {
      const matches = columns.flatMap((column, i) => (normalize(column.header) === normalize(wanted) ? [i] : []));
      if (matches.length > 1) {
        result.errors.push({ code: 'COLUMN_AMBIGUOUS', message: `見出し「${wanted}」の列が${matches.length}つあります。` });
      } else if (matches.length === 0) {
        const suggestions = columns
          .map((column) => ({ header: column.header, score: bigramDice(column.header, wanted) }))
          .filter((entry) => entry.header !== '' && entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((entry) => entry.header);
        result.errors.push({ code: 'COLUMN_NOT_FOUND', message: `見出し「${wanted}」の列がありません。`, suggestions: suggestions.length > 0 ? suggestions : columns.map((c) => c.header).filter(Boolean) });
      } else if (!selected.includes(matches[0])) {
        selected.push(matches[0]);
      }
    }
    if (result.errors.length > 0) return result;
  }
  const letters = selected.map((i) => indexToColumn(columns[i].anchor - table.range.startCol));
  result.columns = selected.map((i, k) => ({ header: columns[i].header, letter: letters[k] }));

  // Rows.
  let range = { ...table.range };
  let grep: string | undefined;
  let filterIndex: number | undefined;
  const rows = request.rows;
  if (rows && 'first' in rows) {
    const bodyStart = table.range.startRow + (info.hasHeader ? 1 : 0);
    range = { ...range, endRow: Math.min(table.range.endRow, bodyStart + Math.max(1, Math.floor(rows.first)) - 1) };
  } else if (rows && 'contains' in rows) {
    grep = rows.contains;
    if (rows.column !== undefined) {
      const position = result.columns.findIndex((column) => normalize(column.header) === normalize(rows.column!));
      if (position < 0) {
        result.errors.push({
          code: 'FILTER_COLUMN_NOT_SHOWN',
          message: `絞り込みの列「${rows.column}」を表示する列に含めてください。MMIの行の絞り込み（grep）は、表示する列だけを対象にします。`,
        });
        return result;
      }
      filterIndex = position;
    }
  }

  // Parameters, as the renderer understands them.
  const params: string[] = [];
  const merged = columns.some((column) => column.endCol > column.startCol);
  const subset = selected.length !== columns.length || selected.some((index, k) => index !== k);
  if (merged || subset) params.push(`columns=${letters.join(',')}`);
  if (info.hasHeader) params.push('header=first');
  if (grep !== undefined) params.push(`grep=${grep.replace(/[%&+=#|[\]?\s]/gu, (ch) => encodeURIComponent(ch))}`);
  const rowCount = range.endRow - range.startRow + 1;
  const physicalColumns = range.endCol - range.startCol + 1;
  const exceeds = physicalColumns > MAX_TABLE_COLUMNS || physicalColumns * rowCount > MAX_TABLE_CELLS;
  const fits = selected.length <= MAX_TABLE_COLUMNS && selected.length * rowCount <= MAX_TABLE_CELLS;
  if (params.some((param) => param.startsWith('columns=')) && exceeds && fits) params.push('mode=table');
  const a1 = cellRangeToA1(range);
  const reference = `![[${referencePath}#${table.sheet}|${a1}${params.length > 0 ? `?${params.join('&')}` : ''}]]`;

  // Check with the renderer.
  let displayedHeaders: readonly string[] | undefined;
  const query = parseEmbedSyntax(reference);
  if (!query) {
    result.errors.push({ code: 'RENDER_FAILED', message: '参照を記法として解釈できませんでした。' });
    return result;
  }
  try {
    result.renderMode = getSmartFallbackDecisionAfterLoad(query, book.workbook).renderMode;
    const logical = buildLogicalTable(query, book.workbook);
    const unfiltered = grep === undefined ? logical : buildLogicalTable({ ...query, params: withoutGrep(query.params) }, book.workbook);
    const total = unfiltered.bodyRows.length;
    let exact = true;
    if (grep !== undefined && filterIndex !== undefined) {
      const needle = grep.toLowerCase();
      const wanted = unfiltered.bodyRows.filter((row) => (row[filterIndex!] ?? '').toLowerCase().includes(needle)).length;
      exact = wanted === logical.bodyRows.length;
      if (!exact) {
        result.warnings.push({
          code: 'GREP_NOT_EXACT',
          message: `「${grep}」を「${result.columns[filterIndex].header}」に含む行は${wanted}行ですが、MMIのgrepは表示するどの列でも部分一致するため${logical.bodyRows.length}行が表示されます。`,
        });
      }
    }
    if (grep !== undefined && logical.bodyRows.length === 0) {
      result.warnings.push({ code: 'NO_ROWS_MATCH', message: `「${grep}」を含む行がありません（表示は見出しだけになります）。` });
    }
    result.rows = { mode: grep !== undefined ? 'contains' : rows && 'first' in rows ? 'first' : 'all', shown: logical.bodyRows.length, ofTotal: rows && 'first' in rows ? info.bodyRows : total, exact };
    const previewRows = logical.bodyRows.slice(0, SELECTION_PREVIEW_ROW_LIMIT);
    result.preview = {
      headers: logical.headers,
      rows: previewRows,
      limit: SELECTION_PREVIEW_ROW_LIMIT,
      shown: previewRows.length,
      ofSelected: logical.bodyRows.length,
      truncated: previewRows.length < logical.bodyRows.length,
    };
    displayedHeaders = logical.headers;
  } catch (error) {
    result.errors.push({ code: 'RENDER_FAILED', message: `参照を描画できませんでした: ${(error as Error).message}` });
    return result;
  }
  // ADR-0022: record the headers the reference was written against, so a later column insertion in the
  // source is reported instead of silently pointing at another column. Renderers ignore the key (spec P5).
  result.reference = displayedHeaders && displayedHeaders.length > 0
    ? reference.replace(/\]\]$/u, () => `&${EXPECTED_HEADERS_PARAM}=${encodeHeaderListForQuery(formatHeaderList(displayedHeaders!))}]]`)
    : reference;
  // The Excel table the range was taken from is a declaration in the book itself: record it as well, so a
  // table that grows or is renamed is reported (x-table, ADR-0022). Names are not recorded: one range can carry several.
  if (info.excelTable) {
    result.reference = result.reference.replace(/\]\]$/u, () => `&${EXPECTED_TABLE_PARAM}=${encodeHeaderListForQuery(info.excelTable!)}]]`);
  }
  // ADR-0022 / issue #521: record how many rows continued below the range, so a row inserted inside the range
  // is reported instead of silently pushing the last row out of it. Renderers ignore the key (spec P5).
  const below = currentBelowRows(query, book.workbook);
  if (below !== undefined) result.reference = appendQueryParam(result.reference, EXPECTED_BELOW_PARAM, String(below));
  result.ok = true;
  return result;
}

/** Adds one `key=value` to the reference's query, opening it with `?` when the reference had no parameters. */
function appendQueryParam(reference: string, key: string, value: string): string {
  const separator = reference.includes('?') ? '&' : '?';
  return reference.replace(/\]\]$/u, () => `${separator}${key}=${value}]]`);
}

function withoutGrep(params: URLSearchParams): URLSearchParams {
  const copy = new URLSearchParams(params);
  copy.delete('grep');
  return copy;
}

function findTable(book: LoadedBook, request: SelectionRequest): { table: ImportCandidate } | { error: SelectionIssue } {
  const [sheetPart, rangePart] = request.table.includes('!') ? [request.table.slice(0, request.table.lastIndexOf('!')), request.table.slice(request.table.lastIndexOf('!') + 1)] : [request.sheet, undefined];
  const sheets = sheetPart ? [sheetPart] : [...book.candidates.keys()];
  const tables = sheets.flatMap((sheet) => (book.candidates.get(sheet) ?? []).filter((candidate) => candidate.role === 'table'));
  const key = normalize(rangePart ?? request.table);
  const byRange = tables.filter((table) => normalize(table.a1) === key);
  const byName = tables.filter((table) =>
    [table.excelTable, ...(table.names ?? [])].some((name) => name !== undefined && normalize(name) === key));
  const byTitle = tables.filter((table) => table.title !== undefined && (normalize(table.title) === key || withoutNumbering(table.title) === withoutNumbering(request.table)));
  const hits = byRange.length > 0 ? byRange : byName.length > 0 ? byName : byTitle;
  if (hits.length === 1) return { table: hits[0] };
  const describe = (table: ImportCandidate): string => `${table.sheet}!${table.a1}${table.title ? `（${table.title}）` : ''}`;
  if (hits.length > 1) {
    return { error: { code: 'TABLE_AMBIGUOUS', message: `「${request.table}」に当たる表が${hits.length}つあります。シートか範囲で指定してください。`, suggestions: hits.map(describe) } };
  }
  return {
    error: {
      code: 'TABLE_NOT_FOUND',
      message: `「${request.table}」に当たる表が${sheetPart ? `シート「${sheetPart}」に` : ''}見つかりません。`,
      suggestions: tables.map(describe).slice(0, 10),
    },
  };
}
