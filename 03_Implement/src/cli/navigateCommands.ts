/**
 * `mmi select` and `mmi find`: choose a table, columns and rows by name and
 * print the reference that selects them (docs: 02_Architecture/table-navigation.md).
 * Read-only: neither command writes to a workbook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { checkExpectedSourceDigestOfBytes, createSourceIdentityFromBytes, sourceIdentityRefOf } from '../core/sourceIdentity.js';
import { loadWorkbookFromBytes, type WorkbookData } from '../core/workbookLoader.js';
import { toRelativeSuggestion } from '../dx/vscodeAdapters.js';
import { analyzeBook } from '../navigate/catalog.js';
import { SELECTION_SCHEMA, selectFromBook, type RowSelection, type SelectionResult } from '../navigate/select.js';
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
  /** `sha256:...` from inspect's locator.sourceDigest; select is refused when the source no longer has it. */
  'expected-source-digest'?: string;
}

/** Returns an exit code: 0 ok, 1 not satisfiable, 2 usage error. */
export function runSelect(args: readonly string[], options: NavigateOptions, io: NavigateIo): number {
  const [file] = args;
  if (!file || (!options.table && !options.candidate)) return usage(io, 'select needs a workbook and --table or --candidate');
  if (options.table && options.candidate) return usage(io, '--table and --candidate cannot be combined');
  if (options.contains !== undefined && options.first !== undefined) return usage(io, '--contains and --first cannot be combined');
  // `--first` is a row count, same range as the MCP `first` argument (integer >= 0). NaN or a
  // fraction would otherwise reach the range arithmetic and build a reference with a broken end row.
  if (options.first !== undefined && !/^\d+$/.test(options.first.trim())) {
    return usage(io, `--first must be a non-negative integer, got "${options.first}"`);
  }
  const rows: RowSelection | undefined = options.contains !== undefined
    ? { contains: options.contains, ...(options.in ? { column: options.in } : {}) }
    : options.first !== undefined ? { first: Number(options.first) } : undefined;
  const bookPath = path.resolve(io.cwd, file);
  const referencePath = options.from ? toRelativeSuggestion(path.resolve(io.cwd, options.from), bookPath) : `./${path.basename(bookPath)}`;
  // One read: the digest, the pin check and the workbook all come from these bytes (#744).
  const sourceBytes = fs.readFileSync(bookPath);
  const sourceIdentity = createSourceIdentityFromBytes(sourceBytes);
  const sourceDigest = sourceIdentity.digest;
  const sourceIdentityRef = sourceIdentityRefOf(sourceIdentity);
  const expected = options['expected-source-digest'];
  if (expected !== undefined) {
    let check;
    try {
      check = checkExpectedSourceDigestOfBytes(sourceBytes, expected);
    } catch (error) {
      return usage(io, (error as Error).message);
    }
    if (!check.ok) {
      const result: SelectionResult = {
        schema: SELECTION_SCHEMA,
        ok: false,
        errors: [{ code: 'SOURCE_DIGEST_MISMATCH', message: check.message }],
        warnings: [],
      };
      if (options.json) io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'select', result, sourceDigest, sourceIdentity: sourceIdentityRef }, null, 2));
      else io.err(`mmi: ${check.message}`);
      return 1;
    }
  }
  const workbook = loadWorkbookFromBytes(bookPath, sourceBytes);
  let table = options.table;
  if (options.candidate) {
    const found = findCandidate(workbook, sourceDigest, referencePath, options.candidate);
    if (typeof found === 'string') {
      io.err('mmi: ' + found);
      return 1;
    }
    table = found.locator.sheet + '!' + found.locator.range;
  }
  const result = selectFromBook(analyzeBook(bookPath, referencePath, { workbook, bytes: sourceBytes }), referencePath, {
    table: table!,
    ...(options.sheet ? { sheet: options.sheet } : {}),
    ...(options.columns ? { columns: options.columns.split(',').map((column) => column.trim()).filter(Boolean) } : {}),
    ...(rows ? { rows } : {}),
  });
  if (options.json) {
    const candidate = result.table ? candidateAt(workbook, sourceDigest, referencePath, result.table.sheet, result.table.range) : undefined;
    io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'select', result, sourceDigest, sourceIdentity: sourceIdentityRef, ...(candidate ? { candidate: candidateRef(candidate) } : {}) }, null, 2));
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
  // The digest of the bytes each workbook was last parsed from. A candidate's sourceDigest and
  // identity are offered only while the file still has that digest (#744).
  const parsedDigests = new Map<string, string>();
  const index = new WorkspaceRegionIndex({
    loadWorkbook: (file) => {
      const bytes = fs.readFileSync(file);
      const workbook = loadWorkbookFromBytes(file, bytes);
      parsedDigests.set(file, createSourceIdentityFromBytes(bytes).digest);
      return workbook;
    },
    statFile: (file) => {
      const stat = fs.statSync(file);
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    },
  });
  const listed = listWorkbooks(root);
  const refreshed = await index.refresh(listed);
  const docPath = options.from ? path.resolve(io.cwd, options.from) : path.join(root, 'x.md');
  // Ask for one more than the cap, so a cut-off list can be told from a complete one (#808).
  const found = index.query(text, (bookPath) => toRelativeSuggestion(docPath, bookPath), FIND_MAX_CANDIDATES + 1);
  const candidatesTruncated = found.candidates.length > FIND_MAX_CANDIDATES;
  const result = candidatesTruncated ? { ...found, candidates: found.candidates.slice(0, FIND_MAX_CANDIDATES) } : found;
  const coverage = describeFindCoverage(refreshed, root, listed.length, candidatesTruncated);
  const candidates = result.candidates.map((candidate) => {
    const bookPath = candidate.region.bookPath;
    let ref: ReturnType<typeof candidateRef> | undefined;
    let sourceDigest: string | undefined;
    let identityRef: ReturnType<typeof sourceIdentityRefOf> | undefined;
    try {
      // One read per candidate: the digest and the identity come from the same bytes.
      const bytes = fs.readFileSync(bookPath);
      const identity = createSourceIdentityFromBytes(bytes);
      const digest = identity.digest;
      if (digest === parsedDigests.get(bookPath)) {
        sourceDigest = digest;
        identityRef = sourceIdentityRefOf(identity);
        const found = candidateAt(loadWorkbookFromBytes(bookPath, bytes), digest, toRelativeSuggestion(docPath, bookPath), candidate.region.sheet, candidate.region.a1);
        ref = found ? candidateRef(found) : undefined;
      }
    } catch {
      sourceDigest = undefined;
      identityRef = undefined;
      ref = undefined; // the book changed or became unreadable since indexing: no identity to offer
    }
    return { reference: candidate.markdown, explanation: candidate.explanation, notes: candidate.notes, ...(sourceDigest ? { sourceDigest } : {}), ...(identityRef ? { sourceIdentity: identityRef } : {}), ...(candidate.fit !== undefined ? { fit: candidate.fit } : {}), ...(ref ? { candidate: ref } : {}) };
  });
  if (options.json) {
    io.out(JSON.stringify({ schema: NAVIGATE_SCHEMA, command: 'find', status: result.status, reasons: result.reasons, candidates, requiresSelection: true, coverage }, null, 2));
  } else {
    io.out([...candidates.map((c, i) => `${i + 1}. ${c.reference}\n   ${c.explanation}${c.fit !== undefined ? ` （${fitLabel(c.fit)}）` : ''}`), ...result.reasons.map((reason) => `理由: ${reason}`), ...coverageNotes(coverage)].join('\n') ||'候補はありません。');
  }
  return result.status === 'candidates' ? 0 : 1;
}

/** Candidates `find` returns at most. */
export const FIND_MAX_CANDIDATES = 5;

/** Why a workbook could not be read, as a value that carries no host path or file text. */
export type FindUnreadableReason = 'password-protected' | 'empty' | 'not-a-workbook' | 'unreadable';

export interface FindCoverage {
  /** Workbook files found under the root. */
  booksListed: number;
  /** Of those, the ones that went into the index. */
  booksIndexed: number;
  /** Workbooks that could not be read, relative to the root. A `no-match` does not cover them. */
  unreadable: { path: string; reason: FindUnreadableReason }[];
  /** The index hit its region limit and stopped before the remaining workbooks. */
  indexCapped: boolean;
  /** The refresh was cancelled before every workbook was read. */
  cancelled: boolean;
  /** More candidates matched than were returned. */
  candidatesTruncated: boolean;
  maxCandidates: number;
}

const UNREADABLE_REASONS: Record<string, FindUnreadableReason> = {
  workbookPasswordProtected: 'password-protected',
  workbookEmpty: 'empty',
  workbookNotWorkbook: 'not-a-workbook',
};

/** What `find` searched, so "no match" can be told from "could not read" or "stopped early" (#808). Paths are relative to `root`. */
export function describeFindCoverage(
  refreshed: { updated: readonly string[]; unchanged: readonly string[]; failed: readonly { path: string; messageId?: string }[]; capped: boolean; cancelled: boolean },
  root: string,
  booksListed: number,
  candidatesTruncated: boolean,
): FindCoverage {
  return {
    booksListed,
    booksIndexed: refreshed.updated.length + refreshed.unchanged.length,
    unreadable: refreshed.failed.map((failure) => ({
      path: path.relative(root, failure.path).split(path.sep).join('/'),
      reason: (failure.messageId && UNREADABLE_REASONS[failure.messageId]) || 'unreadable',
    })),
    indexCapped: refreshed.capped,
    cancelled: refreshed.cancelled,
    candidatesTruncated,
    maxCandidates: FIND_MAX_CANDIDATES,
  };
}

function coverageNotes(coverage: FindCoverage): string[] {
  const notes: string[] = [];
  for (const failure of coverage.unreadable) notes.push(`注意: ${failure.path} は読めませんでした（${failure.reason}）。この結果はそのブックを含みません。`);
  if (coverage.indexCapped) notes.push(`注意: 索引の上限で打ち切りました。${coverage.booksIndexed}/${coverage.booksListed}ブックだけを探しました。`);
  if (coverage.candidatesTruncated) notes.push(`注意: 候補は${coverage.maxCandidates}件までに切り詰めました。ほかにも該当があります。`);
  return notes;
}

/** The identity the Candidate contract, ledger and review use for a table (ADR-0019 D8), so a selection can be traced to it. */
function candidateRef(candidate: Candidate): { fingerprint: string; sheet?: string; range?: string; status: string } {
  return { fingerprint: candidate.fingerprint.digest, ...(candidate.locator.sheet ? { sheet: candidate.locator.sheet } : {}), ...(candidate.locator.range ? { range: candidate.locator.range } : {}), status: candidate.status };
}

function candidatesOf(workbook: WorkbookData, sourceDigest: string, source: string): Candidate[] {
  return Object.entries(workbook.sheets).flatMap(([sheetName, sheet]) => tableCandidates({ source, sourceDigest, sheetName, sheet }));
}

function candidateAt(workbook: WorkbookData, sourceDigest: string, source: string, sheet: string, range: string): Candidate | undefined {
  return candidatesOf(workbook, sourceDigest, source).find((candidate) => candidate.locator.sheet === sheet && candidate.locator.range === range);
}

/** A string is the reason the fingerprint selects nothing usable. */
function findCandidate(workbook: WorkbookData, sourceDigest: string, source: string, fingerprint: string): Candidate | string {
  const matches = candidatesOf(workbook, sourceDigest, source).filter((candidate) => candidate.fingerprint.digest === fingerprint);
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
