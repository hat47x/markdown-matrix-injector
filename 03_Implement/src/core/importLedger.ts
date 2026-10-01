import fs from 'node:fs';
import path from 'node:path';

import type { Candidate, CandidateKind, Fingerprint, SourceLocator } from './candidate.js';

export const IMPORT_LEDGER_VERSION = 1 as const;
export const DEFAULT_IMPORT_LEDGER = '.mmi/import-ledger.json';

export type ConfirmationState = 'confirmed' | 'unconfirmed';

export interface ImportLedgerEntry {
  locator: SourceLocator;
  fingerprint: Fingerprint;
  kind: CandidateKind;
  output: string;
  conversion: Readonly<Record<string, string | number | boolean>>;
  confirmation: ConfirmationState;
  importedAt: string;
}

export interface ImportLedger {
  version: typeof IMPORT_LEDGER_VERSION;
  entries: ImportLedgerEntry[];
}

export type LedgerMatch =
  | { state: 'unimported' }
  | { state: 'exact'; entry: ImportLedgerEntry }
  | { state: 'changed'; entry: ImportLedgerEntry };

export function emptyImportLedger(): ImportLedger {
  return { version: IMPORT_LEDGER_VERSION, entries: [] };
}

export function readImportLedger(file: string): ImportLedger {
  if (!fs.existsSync(file)) return emptyImportLedger();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ImportLedger>;
  if (parsed.version !== IMPORT_LEDGER_VERSION || !Array.isArray(parsed.entries)) {
    throw new Error(`unsupported import ledger: ${file}`);
  }
  return { version: IMPORT_LEDGER_VERSION, entries: parsed.entries };
}

export function writeImportLedger(file: string, ledger: ImportLedger): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

/**
 * Exact identity is content identity. Locator identity deliberately ignores
 * sourceDigest so a changed source at the same logical place can be reported
 * as changed instead of silently becoming a new candidate.
 */
export function matchLedger(candidate: Pick<Candidate, 'kind' | 'locator' | 'fingerprint'>, ledger: ImportLedger): LedgerMatch {
  const exact = ledger.entries.find((entry) =>
    entry.kind === candidate.kind
    && entry.fingerprint.algorithm === candidate.fingerprint.algorithm
    && entry.fingerprint.representation === candidate.fingerprint.representation
    && entry.fingerprint.digest === candidate.fingerprint.digest,
  );
  if (exact) return { state: 'exact', entry: exact };

  const changed = ledger.entries.find((entry) => entry.kind === candidate.kind && sameLogicalLocator(entry.locator, candidate.locator));
  return changed ? { state: 'changed', entry: changed } : { state: 'unimported' };
}

export function recordImport(ledger: ImportLedger, entry: ImportLedgerEntry): ImportLedger {
  const entries = ledger.entries.filter((existing) => !(
    existing.kind === entry.kind
    && existing.fingerprint.algorithm === entry.fingerprint.algorithm
    && existing.fingerprint.representation === entry.fingerprint.representation
    && existing.fingerprint.digest === entry.fingerprint.digest
    && existing.output === entry.output
  ));
  entries.push(entry);
  return { version: IMPORT_LEDGER_VERSION, entries };
}

function sameLogicalLocator(a: SourceLocator, b: SourceLocator): boolean {
  return a.source === b.source && a.sheet === b.sheet && a.range === b.range;
}
