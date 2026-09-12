import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  sheetJsWorksheetToFormatSnapshot,
  type SheetJsWorksheetLike,
} from './sheetJsWorksheetFormatBridge.js';
import type { WorksheetFormatSnapshot } from './worksheetFormatFeatureAdapter.js';

export interface XlsxFormatSnapshotReadOptions {
  absolutePath: string;
  sheetName?: string;
}

export interface XlsxFormatSnapshotResult {
  sheetName: string;
  snapshot: WorksheetFormatSnapshot;
}

export interface SheetJsWorkbookLike {
  SheetNames: readonly string[];
  Sheets: Record<string, SheetJsWorksheetLike | undefined>;
}

export interface SheetJsWorkbookReader {
  read(data: Uint8Array, options: Record<string, unknown>): SheetJsWorkbookLike;
}

const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.xlsb']);

export function readXlsxFormatSnapshot(options: XlsxFormatSnapshotReadOptions): XlsxFormatSnapshotResult {
  const extension = path.extname(options.absolutePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported format snapshot source: ${extension || '(no extension)'}.`);
  }
  const bytes = fs.readFileSync(options.absolutePath);
  return parseXlsxFormatSnapshot(bytes, options.sheetName, XLSX as unknown as SheetJsWorkbookReader);
}

export function parseXlsxFormatSnapshot(
  bytes: Uint8Array,
  requestedSheetName: string | undefined,
  reader: SheetJsWorkbookReader,
): XlsxFormatSnapshotResult {
  const workbook = reader.read(bytes, {
    type: 'buffer',
    dense: false,
    cellStyles: true,
    cellText: true,
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  });

  if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error('Workbook does not contain any worksheets.');
  }

  const sheetName = requestedSheetName ?? workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error(`Worksheet not found: ${sheetName}. Available: ${workbook.SheetNames.join(', ')}.`);
  }
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Worksheet data is missing: ${sheetName}.`);

  return { sheetName, snapshot: sheetJsWorksheetToFormatSnapshot(worksheet) };
}
