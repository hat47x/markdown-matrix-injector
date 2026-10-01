/**
 * The workbook catalog: what a person or an AI agent needs to find a table
 * without opening Excel (02_Architecture/table-navigation.md §3).
 *
 * Books -> sheets -> tables -> columns, each table with its source (an Excel
 * table the author declared, or a detected region), defined names, body row
 * count, cautions and a reference already checked by the renderer. By
 * default only structure is returned: headers, titles and names, which a
 * reference has to name anyway. Cell values (sample rows, excerpts of
 * non-table blocks) are included only when asked for, because the caller may
 * forward the output to an external AI provider (ADR-0019 D7).
 */
import path from 'node:path';
import { cellRangeToA1, indexToColumn } from '../core/tableGeometry.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { analyzeSheetForImport, type ImportCandidate } from '../importAssist/importCandidates.js';
import { readWorkbookStructure, type DefinedName, type WorkbookStructure } from '../importAssist/workbookStructure.js';

export const CATALOG_SCHEMA = 'mmi.catalog/v0';

export interface CatalogColumn {
  header: string;
  /** Letter for `columns=`, counted from the table's first column. */
  letter: string;
  /** Column letter on the sheet, as Excel shows it. */
  sheetColumn: string;
}

export interface CatalogTable {
  /** Stable within the book: `sheet!A1range`. */
  id: string;
  sheet: string;
  range: string;
  title?: string;
  source: 'excel-table' | 'detected';
  excelTable?: string;
  names: string[];
  hasHeader: boolean;
  columns: CatalogColumn[];
  bodyRows: number;
  reference?: string;
  renderMode?: 'table' | 'card';
  cautions: { code: string; message: string }[];
  sample?: string[][];
}

export interface CatalogBlock {
  role: ImportCandidate['role'];
  range: string;
  labels?: string[];
  excerpt?: string[];
}

export interface CatalogSheet {
  name: string;
  visibility: 'visible' | 'hidden' | 'veryHidden';
  usedRange?: string;
  tables: CatalogTable[];
  otherBlocks: CatalogBlock[];
}

export interface CatalogName {
  name: string;
  scope?: string;
  kind: DefinedName['kind'];
  sheet?: string;
  range?: string;
}

export interface WorkbookCatalog {
  schema: typeof CATALOG_SCHEMA;
  book: string;
  referencePath: string;
  sheets: CatalogSheet[];
  names: CatalogName[];
  /** Structure the reader could not obtain for this format. */
  unavailable: string[];
}

export interface CatalogOptions {
  /** Path written into references (relative to the Markdown document). Defaults to the file name. */
  referencePath?: string;
  workbook?: WorkbookData;
  structure?: WorkbookStructure;
  /** Include this many body rows per table (cell values). Default 0. */
  sampleRows?: number;
  /** Include excerpts of non-table blocks (cell values). Default false. */
  includeValues?: boolean;
}

export interface LoadedBook {
  workbook: WorkbookData;
  structure?: WorkbookStructure;
  candidates: Map<string, ImportCandidate[]>;
}

/** Loads and analyzes a book once; `describeWorkbook` and `selectFromBook` share the result. */
export function analyzeBook(absolutePath: string, referencePath: string, options: Pick<CatalogOptions, 'workbook' | 'structure'> = {}): LoadedBook {
  const workbook = options.workbook ?? loadWorkbook({ absolutePath });
  let structure = options.structure;
  if (!structure) {
    try {
      structure = readWorkbookStructure(absolutePath, workbook);
    } catch {
      structure = undefined; // declared structure is optional evidence
    }
  }
  const candidates = new Map<string, ImportCandidate[]>();
  for (const [sheet, source] of Object.entries(workbook.sheets)) {
    candidates.set(sheet, analyzeSheetForImport(sheet, source, { referencePath, workbook, structure }));
  }
  return { workbook, structure, candidates };
}

export function describeWorkbook(absolutePath: string, options: CatalogOptions = {}): WorkbookCatalog {
  const referencePath = options.referencePath ?? `./${path.basename(absolutePath)}`;
  const book = analyzeBook(absolutePath, referencePath, options);
  const sheets: CatalogSheet[] = Object.entries(book.workbook.sheets).map(([name, source]) => {
    const candidates = book.candidates.get(name) ?? [];
    const visibility = book.structure?.sheets.find((sheet) => sheet.name === name)?.visibility ?? 'visible';
    return {
      name,
      visibility,
      ...(source.usedRange ? { usedRange: cellRangeToA1(source.usedRange) } : {}),
      tables: candidates.filter((c) => c.role === 'table').map((c) => catalogTable(c, options.sampleRows ?? 0)),
      otherBlocks: candidates
        .filter((c) => c.role !== 'table')
        .map((c) => ({
          role: c.role,
          range: c.a1,
          ...(c.labels ? { labels: c.labels } : {}),
          ...(options.includeValues ? { excerpt: c.excerpt } : {}),
        })),
    };
  });
  return {
    schema: CATALOG_SCHEMA,
    book: path.basename(absolutePath),
    referencePath,
    sheets,
    names: (book.structure?.names ?? []).map((name) => ({
      name: name.name,
      ...(name.scope ? { scope: name.scope } : {}),
      kind: name.kind,
      ...(name.sheet ? { sheet: name.sheet } : {}),
      ...(name.range ? { range: cellRangeToA1(name.range) } : {}),
    })),
    unavailable: book.structure?.unavailable ?? ['names', 'tables'],
  };
}

export function catalogTable(candidate: ImportCandidate, sampleRows: number): CatalogTable {
  const columns = candidate.columns ?? [];
  const hasHeader = columns.some((column) => column.header !== '');
  const bodyRows = candidate.range.endRow - candidate.range.startRow + 1 - (hasHeader ? 1 : 0);
  return {
    id: `${candidate.sheet}!${candidate.a1}`,
    sheet: candidate.sheet,
    range: candidate.a1,
    ...(candidate.title ? { title: candidate.title } : {}),
    source: candidate.excelTable ? 'excel-table' : 'detected',
    ...(candidate.excelTable ? { excelTable: candidate.excelTable } : {}),
    names: candidate.names ?? [],
    hasHeader,
    columns: columns.map((column) => ({
      header: column.header,
      letter: indexToColumn(column.anchor - candidate.range.startCol),
      sheetColumn: indexToColumn(column.anchor),
    })),
    bodyRows,
    ...(candidate.proposal ? { reference: candidate.proposal.reference, renderMode: candidate.proposal.renderMode } : {}),
    cautions: candidate.cautions.map((caution) => ({ code: caution.code, message: caution.message })),
    ...(sampleRows > 0 && candidate.proposal ? { sample: candidate.proposal.preview.rows.slice(0, sampleRows) } : {}),
  };
}
