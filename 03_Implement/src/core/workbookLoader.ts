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

  const workbook = XLSX.readFile(absolutePath, { dense: true });
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

function parseCsv(contents: string): SheetMatrix {
  return contents
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map((cell) => cell.trim()));
}
