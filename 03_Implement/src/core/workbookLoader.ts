import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { WorkbookCache, type FileSnapshot } from '../cache/workbookCache.js';
import { sheetSourceFromMatrix, type CellRange, type SheetSource, type SourceCell, type SourceCellType } from './sheetSource.js';
import { parseRangeToCellRange } from './tableGeometry.js';
import { isXmlSpreadsheet2003Bytes } from './xmlFormat.js';

export type { CellRange, SheetSource, SourceCell, SourceCellType } from './sheetSource.js';

/** A dense display matrix -- only ever the *result* of slicing a `SheetSource` (see `tableGeometry.ts#sliceRegion`), never the storage shape for a whole sheet. */
export type SheetMatrix = string[][];

export interface WorkbookData {
  sheets: Record<string, SheetSource>;
}

export interface LoadWorkbookOptions {
  absolutePath: string;
  cache?: WorkbookCache<WorkbookData>;
}

export function loadWorkbook(options: LoadWorkbookOptions): WorkbookData {
  const snapshot = readSnapshot(options.absolutePath);
  const cache = options.cache;
  if (cache) {
    return cache.getOrCreate(options.absolutePath, snapshot, () => loadWorkbookUncached(options.absolutePath));
  }

  return loadWorkbookUncached(options.absolutePath);
}

export function readSnapshot(absolutePath: string): FileSnapshot {
  const stat = fs.statSync(absolutePath);
  return { mtimeMs: stat.mtimeMs };
}

function loadWorkbookUncached(absolutePath: string): WorkbookData {
  return loadWorkbookFromBytes(absolutePath, fs.readFileSync(absolutePath));
}

/**
 * Parses already-read workbook bytes into the same WorkbookData used by the
 * production loader. Keeping this boundary public lets performance evidence
 * measure filesystem I/O separately from decode/parse/model construction
 * without duplicating the loader in a benchmark-only implementation.
 */
export function loadWorkbookFromBytes(absolutePath: string, bytes: Buffer): WorkbookData {
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === '.csv') {
    // RFC4180 text has no "used range" distinct from "everything that was
    // written", and no physical-coordinate problem: the parser is already
    // A1-origin and dense. Wrapping it is enough; see sheetSource.ts.
    return {
      sheets: {
        Sheet1: sheetSourceFromMatrix(parseCsv(decodeCsv(bytes))),
      },
    };
  }

  if (extension === '.xml') {
    if (!isXmlSpreadsheet2003Bytes(bytes)) {
      throw new Error('Unsupported XML format: only XML Spreadsheet 2003 is allowed.');
    }
  }

  // cellDates + dateNF normalises a date-typed cell that carries NO number
  // format of its own to unambiguous ISO-8601 (YYYY-MM-DD) text, instead of
  // SheetJS's locale-ambiguous short form (e.g. "4/3/26") -- which for a SIer
  // design-document audience (EffectiveFrom / ExpiresAt columns are a
  // recurring pattern -- see the Phase 9 benchmark pack) can misread as
  // either April 3 or March 4, 2026. A date cell that DOES carry its own
  // number format (e.g. "yyyy/mm/dd") is unaffected by dateNF either way --
  // it already renders unambiguously via its own format. Text cells that
  // merely look like dates, and non-date numeric cells, are untouched.
  // The production caller reads bytes explicitly because the SheetJS ESM
  // build does not bind Node's fs. This function then performs only
  // decode/parse/model construction, which is also the benchmark boundary.
  const workbook = XLSX.read(bytes, {
    type: 'buffer', dense: true, cellDates: true, dateNF: 'yyyy-mm-dd',
  });
  const sheets = Object.fromEntries(
    workbook.SheetNames.map((sheetName) => [sheetName, sheetSourceFromWorksheet(workbook.Sheets[sheetName])]),
  );

  return { sheets };
}

/**
 * Builds a `SheetSource` directly from a SheetJS dense worksheet, reading
 * cells by physical `!data[row][col]` address rather than through
 * `sheet_to_json` -- which is what silently lost the used-range origin and
 * dropped blank rows (see `input-assistance-source-model.md` §1). `.w`
 * (SheetJS's precomputed display string) is read straight off each cell:
 * it already reflects `raw:false`-equivalent formatting, `dateNF`, and error
 * values (`#DIV/0!` etc.) with no extra work, so switching to direct access
 * changes nothing about how an individual cell is displayed -- only that
 * physical coordinates and blank rows are no longer lost.
 */
function sheetSourceFromWorksheet(worksheet: XLSX.WorkSheet): SheetSource {
  const ref = worksheet['!ref'];
  const usedRange: CellRange | undefined = ref ? parseRangeToCellRange(ref) : undefined;
  const merges: CellRange[] = (worksheet['!merges'] ?? []).map((merge) => ({
    startRow: merge.s.r,
    startCol: merge.s.c,
    endRow: merge.e.r,
    endCol: merge.e.c,
  }));

  // `dense: true` (passed by every call site that reaches here) always
  // produces `!data`, a sparse `(SheetCell | undefined)[][]` indexed by
  // physical row then column; out-of-range access safely yields `undefined`.
  const data = worksheet['!data'] ?? [];

  return {
    usedRange,
    merges,
    cellAt(row, col) {
      return toSourceCell(data[row]?.[col]);
    },
  };
}

/**
 * A cell whose type is `z` (SheetJS's "stub" marker -- present in the sparse
 * grid but carrying no real value, e.g. a cell that only has styling) is
 * treated as absent, matching the pre-existing "no data here" contract that
 * `sliceRegion` fills back in as `''`.
 */
function toSourceCell(cell: XLSX.CellObject | undefined): SourceCell | undefined {
  if (!cell || cell.t === 'z') {
    return undefined;
  }

  const value = (cell.v ?? null) as string | number | boolean | Date | null;
  const text = cell.w !== undefined ? cell.w : (value === null ? '' : String(value));

  return {
    text,
    type: cell.t as SourceCellType,
    value,
    ...(cell.f !== undefined ? { formula: cell.f } : {}),
  };
}

function decodeCsv(bytes: Uint8Array): string {
  const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    throw new Error('CSVはUTF-8またはCP932で保存してください。UTF-16には対応していません。');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (hasUtf8Bom) throw new Error('CSVのUTF-8データが不正です。');
  }
  try {
    // WHATWG shift_jis includes the Windows-31J extensions used by Excel.
    return new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('CSVをUTF-8またはCP932として読み込めません。文字コードを確認してください。');
  }
}

/**
 * RFC4180-aware CSV parser. Handles quoted fields (commas and embedded
 * newlines inside quotes, `""` as an escaped literal quote) without a naive
 * `split(',')`, which silently corrupts any real-world CSV cell containing a
 * comma (e.g. `"Smith, John"`) into extra misaligned columns.
 *
 * Behavior preserved from the previous implementation: the whole file is
 * trimmed once (stripping leading/trailing blank lines), CRLF and LF line
 * endings are both accepted, and unquoted cells are trimmed. Quoted cells are
 * NOT trimmed -- their content (including intentional leading/trailing
 * whitespace) is preserved verbatim per RFC4180, since only the delimiters
 * are structural, not the quoted payload.
 *
 * The whole-file `trim()` still shifts the A1 origin by however many leading
 * blank lines a file has (e.g. 2 leading blank lines -> row 3 becomes row 1).
 * That is a known, separate gap from the used-range/blank-row bug this module
 * fixes for XLSX/XML; changing it is out of scope here (see
 * `input-assistance-source-model.md` §7).
 */
export function parseCsv(contents: string): SheetMatrix {
  const text = contents.replace(/^﻿/, '').trim();
  if (text.length === 0) {
    return [];
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let fieldIsQuoted = false;
  let inQuotes = false;

  const flushField = (): void => {
    row.push(fieldIsQuoted ? field : field.trim());
    field = '';
    fieldIsQuoted = false;
  };
  const flushRow = (): void => {
    flushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '' && !fieldIsQuoted) {
      inQuotes = true;
      fieldIsQuoted = true;
      continue;
    }

    if (ch === ',') {
      flushField();
      continue;
    }

    if (ch === '\r') {
      continue;
    }

    if (ch === '\n') {
      flushRow();
      continue;
    }

    field += ch;
  }

  flushRow(); // final row -- `text` was trimmed, so it never ends on a bare newline

  return rows;
}
