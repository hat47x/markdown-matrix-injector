import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { WorkbookCache, type FileSnapshot } from '../cache/workbookCache.js';
import { LocalizedError } from './messages/index.js';
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
      throw new LocalizedError('invalidXml', {});
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
  const isOoxml = extension === '.xlsx' || extension === '.xlsm';
  if (isOoxml) assertOoxmlBytes(path.basename(absolutePath), bytes);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: 'buffer', dense: true, cellDates: true, dateNF: 'yyyy-mm-dd',
    });
  } catch (error) {
    if (!isOoxml) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new LocalizedError(
      'workbookDamaged',
      { file: path.basename(absolutePath), reason },
    );
  }
  const sheets = Object.fromEntries(
    workbook.SheetNames.map((sheetName) => [sheetName, sheetSourceFromWorksheet(workbook.Sheets[sheetName])]),
  );

  return { sheets };
}

const CFB_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');

/**
 * Names the real cause of an unreadable .xlsx/.xlsm before SheetJS guesses.
 * SheetJS parses an empty or non-workbook file as if it were text, so the
 * reference then fails with "Sheet not found" and sends the writer to fix a
 * sheet name that is fine. A password-protected book (a CFB container) fails
 * as "Unsupported ZIP encryption", which does not say what to do.
 */
function assertOoxmlBytes(fileName: string, bytes: Buffer): void {
  if (bytes.length === 0) {
    throw new LocalizedError('workbookEmpty', { file: fileName });
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return;
  if (bytes.length >= CFB_SIGNATURE.length && bytes.subarray(0, CFB_SIGNATURE.length).equals(CFB_SIGNATURE)) {
    throw new LocalizedError('workbookPasswordProtected', { file: fileName });
  }
  throw new LocalizedError('workbookNotWorkbook', { file: fileName });
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
    throw new LocalizedError('csvUtf16', {});
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (hasUtf8Bom) throw new LocalizedError('csvInvalidUtf8', {});
  }
  try {
    // WHATWG shift_jis includes the Windows-31J extensions used by Excel.
    return new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  } catch {
    throw new LocalizedError('csvUnreadableEncoding', {});
  }
}

/**
 * RFC4180-aware CSV parser. Handles quoted fields (commas and embedded
 * newlines inside quotes, `""` as an escaped literal quote) without a naive
 * `split(',')`, which silently corrupts any real-world CSV cell containing a
 * comma (e.g. `"Smith, John"`) into extra misaligned columns.
 *
 * Physical CSV record positions are preserved. Leading blank records are real
 * rows for A1 addressing and must not be removed: if two blank records precede
 * the header, that header is on row 3. A single final line terminator only
 * terminates the preceding record and does not create another row; repeated
 * final line terminators still preserve the intervening blank records.
 *
 * CRLF and LF line endings are accepted. Unquoted cell payload is trimmed,
 * preserving the existing CSV value contract; quoted payload is preserved
 * verbatim per RFC4180.
 */
export function parseCsv(contents: string): SheetMatrix {
  const text = contents.replace(/^﻿/, '');
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

  // A final LF terminates the record already flushed in the loop. Flushing
  // again would invent an extra blank row. If there is no final LF, the last
  // record still needs to be emitted.
  if (!text.endsWith('\n')) {
    flushRow();
  }

  return rows;
}
