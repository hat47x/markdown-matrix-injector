/**
 * `mmi select` and `mmi find`: choose a table, columns and rows by name and
 * print the reference that selects them (docs: 02_Architecture/table-navigation.md).
 * Read-only: neither command writes to a workbook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { toRelativeSuggestion } from '../dx/vscodeAdapters.js';
import { analyzeBook } from '../navigate/catalog.js';
import { selectFromBook, type RowSelection, type SelectionResult } from '../navigate/select.js';
import { fitLabel } from '../search/fitLabel.js';
import { WorkspaceRegionIndex } from '../search/workspaceRegionIndex.js';

export const NAVIGATE_SCHEMA = 'mmi.cli/v0';
const WORKBOOK = /\.(xlsx|xlsm|xlsb|xls|csv|xml)$/i;

export interface NavigateIo {
  out(text: string): void;
  err(text: string): void;
  cwd: string;
}

export interface NavigateOptions {
  table?: string;
  candidate?: string;
  sheet?: string;
  columns?: string;
  contains?: string;
  in?: string;
  first?: string;
  from?: string;
  root?: string;
  json?: boolean;
}

/** Returns an exit code: 0 ok, 1 not satisfiable, 2 usage error. */
export function runSelect(args: readonly string[], options: NavigateOptions, io: NavigateIo): number {
  const [file] = args;
  if (!file || (!options.table && !options.candidate)) return usage(io, 'select needs a workbook and --table or --candidate');
  if (options.table && options.candidate) return usage(io, '--table and --candidate cannot be combined');
  if (options.contains !== undefined && options.first !== undefined) return usage(io, '--contains and --first cannot be combined');
  const rows: RowSelection | undefined = options.contains !== undefined
    ? { contains: options.contains, ...(options.in ? { column: options.in } : {}) }
    : options.first !== undefined ? { first: Number(options.first) } : undefined;
  const bookPath = path.resolve(io.cwd, file);
  const referencePath = options.from ? toRelativeSuggestion(path.resolve(io.cwd, options.from), bookPath) : `./${path.basename(bookPath)}`;
  const workbook = loadWorkbook({ absolutePath: bookPath });
  let table = options.table;
  if (options.candidate) {
    const found = findCandidate(bookPath, workbook, referencePath, options.candidate);
    if (typeof found === 'string') {
      io.err('mmi: ' + found);
      return 1;
    }
    table = found.locator.sheet + '!' + found.locator.range;
  }
  const result = selectFromBook(analyzeBook(bookPath, referencePath, { workbook }), referencePath, {
    table: table!,
    ...(options.sheet ? { sheet: options.sheet } : {}),
    ...(options.columns ? { columns: options.columns.split(',').map((column) => column.trim()).filter(Boolean) } : {}),
    ...(rows ? { rows } : {}),
  });
  if (options.json) {
    const candidate = result.table ? candidateAt(bookPath, workbook, referencePath, result.table.sheet, result.table.range) : undefined;
    io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'select', result, ...(candidate ? { candidate: candidateRef(candidate) } : {}) }, null, 2));
  } else {
    // stdout carries the reference alone so it can be pasted or piped; notes go to stderr.
    if (result.reference) io.out(result.reference);
    const notes = describeSelection(result);
    if (notes) io.err(notes);
  }
  return result.ok ? 0 : 1;
}

export async function runFind(args: readonly string[], options: NavigateOptions, io: NavigateIo): Promise<number> {
  const text = args.join(' ').trim();
  if (!text) return usage(io, 'find needs a description');
  const root = path.resolve(io.cwd, options.root ?? '.');
  const index = new WorkspaceRegionIndex({
    loadWorkbook: (file) => loadWorkbook({ absolutePath: file }),
    statFile: (file) => {
      const stat = fs.statSync(file);
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    },
  });
  await index.refresh(listWorkbooks(root));
  const docPath = options.from ? path.resolve(io.cwd, options.from) : path.join(root, 'x.md');
  const result = index.query(text, (bookPath) => toRelativeSuggestion(docPath, bookPath));
  const candidates = result.candidates.map((candidate) => {
    const bookPath = candidate.region.bookPath;
    let ref: ReturnType<typeof candidateRef> | undefined;
    try {
      const found = candidateAt(bookPath, loadWorkbook({ absolutePath: bookPath }), toRelativeSuggestion(docPath, bookPath), candidate.region.sheet, candidate.region.a1);
      ref = found ? candidateRef(found) : undefined;
    } catch {
      ref = undefined; // the book changed or became unreadable since indexing: no identity to offer
    }
    return { reference: candidate.markdown, explanation: candidate.explanation, notes: candidate.notes, ...(candidate.fit !== undefined ? { fit: candidate.fit } : {}), ...(ref ? { candidate: ref } : {}) };
  });
  if (options.json) {
    io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'find', status: result.status, reasons: result.reasons, candidates, requiresSelection: true }, null, 2));
  } else {
    io.out([...candidates.map((c, i) => `${i + 1}. ${c.reference}\n   ${c.explanation}${c.fit !== undefined ? ` （${fitLabel(c.fit)}）` : ''}`), ...result.reasons.map((reason) => `理由: ${reason}`)].join('\n') || '候補はありません。');
  }
  return result.status === 'candidates' ? 0 : 1;
}

/** The identity the Candidate contract, ledger and review use for a table (ADR-0019 D8), so a selection can be traced to it. */
function candidateRef(candidate: Candidate): { fingerprint: string; sheet?: string; range?: string; status: string } {
  return { fingerprint: candidate.fingerprint.digest, ...(candidate.locator.sheet ? { sheet: candidate.locator.sheet } : {}), ...(candidate.locator.range ? { range: candidate.locator.range } : {}), status: candidate.status };
}

function candidatesOf(bookPath: string, workbook: WorkbookData, source: string): Candidate[] {
  const sourceDigest = readSourceFileIdentity(bookPath).digest;
  return Object.entries(workbook.sheets).flatMap(([sheetName, sheet]) => tableCandidates({ source, sourceDigest, sheetName, sheet }));
}

function candidateAt(bookPath: string, workbook: WorkbookData, source: string, sheet: string, range: string): Candidate | undefined {
  return candidatesOf(bookPath, workbook, source).find((candidate) => candidate.locator.sheet === sheet && candidate.locator.range === range);
}

/** A string is the reason the fingerprint selects nothing usable. */
function findCandidate(bookPath: string, workbook: WorkbookData, source: string, fingerprint: string): Candidate | string {
  const matches = candidatesOf(bookPath, workbook, source).filter((candidate) => candidate.fingerprint.digest === fingerprint);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return 'no table Candidate with fingerprint ' + fingerprint + '; the source may have changed -- run mmi inspect --json again';
  return matches.length + ' table Candidates have identical content (' + matches.map((m) => m.locator.sheet + '!' + m.locator.range).join(', ') + '); use --sheet and --table';
}

function describeSelection(result: SelectionResult): string {
  const lines: string[] = [];
  for (const error of result.errors) lines.push(`エラー: ${error.message}${error.suggestions?.length ? `（候補: ${error.suggestions.join('、')}）` : ''}`);
  for (const warning of result.warnings) lines.push(`注意: ${warning.message}`);
  if (result.rows) lines.push(`行: ${result.rows.shown}/${result.rows.ofTotal}${result.rows.exact ? '' : '（指定した列だけの絞り込みと一致しません）'}${result.renderMode === 'card' ? '・別紙として表示' : ''}`);
  return lines.join('\n');
}

function listWorkbooks(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.startsWith('~$')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (WORKBOOK.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function usage(io: NavigateIo, message: string): number {
  io.err(`mmi: ${message}`);
  return 2;
}
