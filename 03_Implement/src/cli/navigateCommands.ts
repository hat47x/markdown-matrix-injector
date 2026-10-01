/**
 * `mmi select` and `mmi find`: choose a table, columns and rows by name and
 * print the reference that selects them (docs: 02_Architecture/table-navigation.md).
 * Read-only: neither command writes to a workbook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkbook } from '../core/workbookLoader.js';
import { toRelativeSuggestion } from '../dx/vscodeAdapters.js';
import { analyzeBook } from '../navigate/catalog.js';
import { selectFromBook, type RowSelection, type SelectionResult } from '../navigate/select.js';
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
  if (!file || !options.table) return usage(io, 'select needs a workbook and --table');
  if (options.contains !== undefined && options.first !== undefined) return usage(io, '--contains and --first cannot be combined');
  const rows: RowSelection | undefined = options.contains !== undefined
    ? { contains: options.contains, ...(options.in ? { column: options.in } : {}) }
    : options.first !== undefined ? { first: Number(options.first) } : undefined;
  const bookPath = path.resolve(io.cwd, file);
  const referencePath = options.from ? toRelativeSuggestion(path.resolve(io.cwd, options.from), bookPath) : `./${path.basename(bookPath)}`;
  const result = selectFromBook(analyzeBook(bookPath, referencePath), referencePath, {
    table: options.table,
    ...(options.sheet ? { sheet: options.sheet } : {}),
    ...(options.columns ? { columns: options.columns.split(',').map((column) => column.trim()).filter(Boolean) } : {}),
    ...(rows ? { rows } : {}),
  });
  if (options.json) {
    io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'select', result }, null, 2));
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
  const candidates = result.candidates.map((candidate) => ({ reference: candidate.markdown, explanation: candidate.explanation, notes: candidate.notes }));
  if (options.json) {
    io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'find', status: result.status, reasons: result.reasons, candidates, requiresSelection: true }, null, 2));
  } else {
    io.out([...candidates.map((c, i) => `${i + 1}. ${c.reference}\n   ${c.explanation}`), ...result.reasons.map((reason) => `理由: ${reason}`)].join('\n') || '候補はありません。');
  }
  return result.status === 'candidates' ? 0 : 1;
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
