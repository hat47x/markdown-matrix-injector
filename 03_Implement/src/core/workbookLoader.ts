import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { WorkbookCache, type FileSnapshot } from '../cache/workbookCache.js';

export type SheetMatrix = string[][];

export interface WorkbookData {
  sheets: Record<string, SheetMatrix>;
}

export interface LoadWorkbookOptions {
  absolutePath: string;
  cache?: WorkbookCache<WorkbookData>;
}

const XML_SPREADSHEET_SIGNATURES = [
  '<?mso-application progid="Excel.Sheet"?>',
  'urn:schemas-microsoft-com:office:spreadsheet',
];

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
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === '.csv') {
    return {
      sheets: {
        Sheet1: parseCsv(fs.readFileSync(absolutePath, 'utf8')),
      },
    };
  }

  if (extension === '.xml') {
    const xml = fs.readFileSync(absolutePath, 'utf8');
    if (!XML_SPREADSHEET_SIGNATURES.some((signature) => xml.includes(signature))) {
      throw new Error('Unsupported XML format: only XML Spreadsheet 2003 is allowed.');
    }
  }

  // cellDates + dateNF forces genuinely date-typed cells to render as
  // unambiguous ISO-8601 (YYYY-MM-DD) text. Without this, SheetJS's default
  // stringification renders dates as locale-ambiguous short-form (e.g.
  // "4/3/26"), which for a SIer design-document audience (EffectiveFrom /
  // ExpiresAt columns are a recurring pattern -- see the Phase 9 benchmark
  // pack) can misread as either April 3 or March 4, 2026. Text cells that
  // merely look like dates, and non-date numeric cells, are unaffected --
  // this only touches cells Excel itself has typed and formatted as dates.
  const workbook = XLSX.readFile(absolutePath, { dense: true, cellDates: true, dateNF: 'yyyy-mm-dd' });
  const sheets = Object.fromEntries(
    workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        raw: false,
        blankrows: false,
      });

      return [
        sheetName,
        rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
      ];
    }),
  );

  return { sheets };
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
