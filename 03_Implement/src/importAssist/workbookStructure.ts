/**
 * What a workbook declares about its own structure, beyond cell values
 * (02_Architecture/table-navigation.md §2): defined names, Excel tables
 * (ListObjects), sheet visibility, hidden rows and columns, and autofilters.
 *
 * These are the author's own declarations -- like `!merges`, and unlike
 * anything inferred from blank cells -- so input assistance prefers them
 * over detection. The renderer does not use them: MMI Notation v1 addresses
 * A1 ranges and shows every row of a range, hidden or not.
 *
 * Read-only. `.xlsx`/`.xlsm` are read part by part from the zip (no cell
 * parsing); other formats go through SheetJS, which exposes names,
 * visibility and hidden rows but not tables.
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import type { CellRange } from '../core/sheetSource.js';
import { parseRangeToCellRange } from '../core/tableGeometry.js';
import type { WorkbookData } from '../core/workbookLoader.js';

export type SheetVisibility = 'visible' | 'hidden' | 'veryHidden';

export type DefinedNameKind = 'range' | 'cell' | 'rows' | 'columns' | 'formula' | 'constant' | 'broken';

export interface DefinedName {
  name: string;
  /** Sheet a sheet-scoped name belongs to; undefined for workbook scope. */
  scope?: string;
  /** The definition as stored (without the leading `=`). */
  formula: string;
  kind: DefinedNameKind;
  /** Target sheet and 0-based range, when the name is a plain reference. Whole rows/columns are cut to the used range. */
  sheet?: string;
  range?: CellRange;
}

export interface ExcelTable {
  name: string;
  sheet: string;
  /** Whole table, header and totals rows included. */
  range: CellRange;
  headerRowCount: number;
  totalsRowCount: number;
  columns: string[];
}

export interface SheetStructure {
  name: string;
  visibility: SheetVisibility;
  hiddenRows: number[];
  hiddenColumns: number[];
  autofilter?: CellRange;
}

export interface WorkbookStructure {
  sheets: SheetStructure[];
  names: DefinedName[];
  tables: ExcelTable[];
  /** Structure the reader could not obtain for this format (e.g. tables in .xlsb). */
  unavailable: string[];
}

/** Reads the structure of the workbook at `absolutePath`. `workbook` supplies used ranges for whole-row/column names. */
export function readWorkbookStructure(absolutePath: string, workbook?: WorkbookData): WorkbookStructure {
  const bytes = fs.readFileSync(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const structure = extension === '.xlsx' || extension === '.xlsm' ? fromOoxml(bytes) : fromSheetJs(bytes, extension);
  for (const name of structure.names) resolveName(name, workbook);
  return structure;
}

// ---------------------------------------------------------------------------
// OOXML (.xlsx / .xlsm): read the parts directly
// ---------------------------------------------------------------------------

interface ZipEntry {
  content: Uint8Array;
}

function fromOoxml(bytes: Uint8Array): WorkbookStructure {
  const CFB = (XLSX as unknown as { CFB: { read(data: Uint8Array, options: { type: string }): unknown; find(container: unknown, name: string): ZipEntry | null } }).CFB;
  const zip = CFB.read(bytes, { type: 'buffer' });
  const part = (name: string): string | undefined => {
    const entry = CFB.find(zip, `/${name}`) ?? CFB.find(zip, name);
    return entry ? Buffer.from(entry.content).toString('utf8') : undefined;
  };
  const workbookXml = part('xl/workbook.xml') ?? '';
  const workbookRels = relationships(part('xl/_rels/workbook.xml.rels') ?? '', 'xl');

  const sheets: SheetStructure[] = [];
  const tables: ExcelTable[] = [];
  const sheetNames: string[] = [];
  for (const tag of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const attrs = attributes(tag[1]);
    const name = attrs.name ?? '';
    sheetNames.push(name);
    const target = workbookRels.get(attrs['r:id'] ?? '');
    const xml = target ? part(target) ?? '' : '';
    const hiddenRows = [...xml.matchAll(/<row\b([^>]*)>/g)]
      .map((row) => attributes(row[1]))
      .filter((row) => row.hidden === '1' || row.hidden === 'true')
      .map((row) => Number(row.r) - 1);
    const hiddenColumns = [...xml.matchAll(/<col\b([^>]*?)\/?>/g)]
      .map((col) => attributes(col[1]))
      .filter((col) => col.hidden === '1' || col.hidden === 'true')
      .flatMap((col) => span(Number(col.min) - 1, Number(col.max) - 1));
    const filter = /<autoFilter\b([^>]*?)\/?>/.exec(xml);
    const filterRef = filter ? attributes(filter[1]).ref : undefined;
    sheets.push({
      name,
      visibility: attrs.state === 'veryHidden' ? 'veryHidden' : attrs.state === 'hidden' ? 'hidden' : 'visible',
      hiddenRows,
      hiddenColumns,
      ...(filterRef ? { autofilter: parseRangeToCellRange(filterRef.replace(/\$/g, '')) } : {}),
    });

    if (target) {
      const sheetRels = relationships(part(relsPathOf(target)) ?? '', path.posix.dirname(target));
      for (const tablePart of xml.matchAll(/<tablePart\b([^>]*?)\/?>/g)) {
        const tableTarget = sheetRels.get(attributes(tablePart[1])['r:id'] ?? '');
        const tableXml = tableTarget ? part(tableTarget) : undefined;
        const table = tableXml ? parseTable(tableXml, name) : undefined;
        if (table) tables.push(table);
      }
    }
  }

  const names: DefinedName[] = [];
  for (const tag of workbookXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    const attrs = attributes(tag[1]);
    const local = attrs.localSheetId !== undefined ? sheetNames[Number(attrs.localSheetId)] : undefined;
    names.push({ name: attrs.name ?? '', ...(local !== undefined ? { scope: local } : {}), formula: decode(tag[2]), kind: 'formula' });
  }
  return { sheets, names: names.filter((name) => !name.name.startsWith('_xlnm.')), tables, unavailable: [] };
}

function parseTable(xml: string, sheet: string): ExcelTable | undefined {
  const head = /<table\b([^>]*)>/.exec(xml);
  if (!head) return undefined;
  const attrs = attributes(head[1]);
  if (!attrs.ref) return undefined;
  return {
    name: attrs.displayName ?? attrs.name ?? '',
    sheet,
    range: parseRangeToCellRange(attrs.ref),
    headerRowCount: attrs.headerRowCount !== undefined ? Number(attrs.headerRowCount) : 1,
    totalsRowCount: attrs.totalsRowCount !== undefined ? Number(attrs.totalsRowCount) : attrs.totalsRowShown === '1' ? 0 : 0,
    columns: [...xml.matchAll(/<tableColumn\b([^>]*?)\/?>/g)].map((column) => attributes(column[1]).name ?? ''),
  };
}

function relationships(xml: string, baseDir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const attrs = attributes(tag[1]);
    if (!attrs.Id || !attrs.Target) continue;
    const target = attrs.Target.startsWith('/') ? attrs.Target.slice(1) : path.posix.normalize(path.posix.join(baseDir, attrs.Target));
    out.set(attrs.Id, target);
  }
  return out;
}

function relsPathOf(target: string): string {
  return path.posix.join(path.posix.dirname(target), '_rels', `${path.posix.basename(target)}.rels`);
}

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[match[1]] = decode(match[2]);
  return out;
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Other formats (.xlsb / .xls / .xml): what SheetJS exposes
// ---------------------------------------------------------------------------

function fromSheetJs(bytes: Uint8Array, extension: string): WorkbookStructure {
  const book = XLSX.read(bytes, { type: 'buffer', dense: true, cellStyles: true });
  const meta = book.Workbook as
    | { Names?: { Name: string; Ref: string; Sheet?: number }[]; Sheets?: { name?: string; Hidden?: number }[] }
    | undefined;
  const sheets: SheetStructure[] = book.SheetNames.map((name, index) => {
    const worksheet = book.Sheets[name];
    const hidden = meta?.Sheets?.[index]?.Hidden ?? 0;
    const rows = (worksheet['!rows'] ?? []) as ({ hidden?: boolean } | undefined)[];
    const cols = (worksheet['!cols'] ?? []) as ({ hidden?: boolean } | undefined)[];
    const filter = (worksheet['!autofilter'] as { ref?: string } | undefined)?.ref;
    return {
      name,
      visibility: hidden === 2 ? 'veryHidden' : hidden === 1 ? 'hidden' : 'visible',
      hiddenRows: rows.flatMap((row, i) => (row?.hidden ? [i] : [])),
      hiddenColumns: cols.flatMap((col, i) => (col?.hidden ? [i] : [])),
      ...(filter ? { autofilter: parseRangeToCellRange(filter.replace(/\$/g, '')) } : {}),
    };
  });
  const names: DefinedName[] = (meta?.Names ?? [])
    .filter((name) => !name.Name.startsWith('_xlnm.'))
    .map((name) => ({
      name: name.Name,
      ...(name.Sheet !== undefined && name.Sheet !== null ? { scope: book.SheetNames[name.Sheet] } : {}),
      formula: String(name.Ref),
      kind: 'formula' as const,
    }));
  return { sheets, names, tables: [], unavailable: extension === '.xlsb' || extension === '.xls' ? ['tables'] : [] };
}

// ---------------------------------------------------------------------------
// Names: classify and resolve plain references
// ---------------------------------------------------------------------------

const REFERENCE = /^(?:'((?:[^']|'')+)'|([^!'"()]+))!(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?\d+:\$?\d+|\$?[A-Z]{1,3}:\$?[A-Z]{1,3})$/i;

function resolveName(name: DefinedName, workbook?: WorkbookData): void {
  const formula = name.formula.trim().replace(/^=/, '');
  if (/#REF!/i.test(formula)) {
    name.kind = 'broken';
    return;
  }
  const match = REFERENCE.exec(formula);
  if (!match) {
    name.kind = /^(?:"[^"]*"|[+-]?\d+(?:\.\d+)?|TRUE|FALSE)$/i.test(formula) ? 'constant' : 'formula';
    return;
  }
  const sheet = match[1] !== undefined ? match[1].replace(/''/g, "'") : match[2];
  const ref = match[3].replace(/\$/g, '').toUpperCase();
  name.sheet = sheet;
  const used = workbook?.sheets[sheet]?.usedRange;
  if (/^\d+:\d+$/.test(ref)) {
    const [top, bottom] = ref.split(':').map((row) => Number(row) - 1);
    name.kind = 'rows';
    if (used) name.range = { startRow: top, endRow: bottom, startCol: used.startCol, endCol: used.endCol };
  } else if (/^[A-Z]+:[A-Z]+$/.test(ref)) {
    const [left, right] = ref.split(':').map((col) => parseRangeToCellRange(`${col}1`).startCol);
    name.kind = 'columns';
    if (used) name.range = { startRow: used.startRow, endRow: used.endRow, startCol: left, endCol: right };
  } else {
    const range = parseRangeToCellRange(ref);
    // .xls stores whole columns as D1:D65536 and whole rows as A1:IV1.
    const allRows = range.startRow === 0 && (range.endRow === 65_535 || range.endRow === 1_048_575);
    const allColumns = range.startCol === 0 && (range.endCol === 255 || range.endCol === 16_383);
    if (allRows && !allColumns) {
      name.kind = 'columns';
      if (used) name.range = { ...range, startRow: used.startRow, endRow: used.endRow };
    } else if (allColumns && !allRows) {
      name.kind = 'rows';
      if (used) name.range = { ...range, startCol: used.startCol, endCol: used.endCol };
    } else {
      name.range = range;
      name.kind = range.startRow === range.endRow && range.startCol === range.endCol ? 'cell' : 'range';
    }
  }
}

function span(from: number, to: number): number[] {
  return Number.isFinite(from) && Number.isFinite(to) ? Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i) : [];
}
