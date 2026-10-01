import fs from 'node:fs';
import path from 'node:path';

import type { Candidate, CandidateKind, Fingerprint, SourceLocator } from './candidate.js';

export const IMPORT_LEDGER_VERSION = 1 as const;
export const DEFAULT_IMPORT_LEDGER = '.mmi/import-ledger.json';

export type ReviewState = 'confirmed' | 'unreviewed' | 'stale';

export interface ImportLedgerEntry {
  /** Occurrence identity: where this particular candidate was reviewed/imported. */
  locator: SourceLocator;
  /** Content identity: location-independent bytes/representation identity. */
  fingerprint: Fingerprint;
  kind: CandidateKind;
  output: string;
  conversion: Readonly<Record<string, string | number | boolean>>;
  reviewState: ReviewState;
  reviewBasis: string;
  importedAt: string;
}

export interface ImportLedger { version: typeof IMPORT_LEDGER_VERSION; entries: ImportLedgerEntry[] }

export type LedgerMatch =
  | { state: 'unimported' }
  | { state: 'exact-occurrence'; entry: ImportLedgerEntry }
  | { state: 'same-content'; entry: ImportLedgerEntry }
  | { state: 'changed-occurrence'; entry: ImportLedgerEntry };

export function emptyImportLedger(): ImportLedger { return { version: IMPORT_LEDGER_VERSION, entries: [] }; }

export function readImportLedger(file: string): ImportLedger {
  if (!fs.existsSync(file)) return emptyImportLedger();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ImportLedger>;
  if (parsed.version !== IMPORT_LEDGER_VERSION || !Array.isArray(parsed.entries)) throw new Error(`unsupported import ledger: ${file}`);
  return { version: IMPORT_LEDGER_VERSION, entries: parsed.entries };
}

export function writeImportLedger(file: string, ledger: ImportLedger): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

/**
 * Occurrence and content identity are deliberately independent (ADR-0021).
 * A duplicate image at another location is useful evidence (`same-content`),
 * but it is not an already-reviewed occurrence and must not inherit review
 * state or semantic role automatically.
 */
export function matchLedger(candidate: Pick<Candidate, 'kind' | 'locator' | 'fingerprint'>, ledger: ImportLedger): LedgerMatch {
  const occurrence = ledger.entries.find((entry) => entry.kind === candidate.kind && sameLogicalLocator(entry.locator, candidate.locator));
  if (occurrence && sameFingerprint(occurrence.fingerprint, candidate.fingerprint)) return { state: 'exact-occurrence', entry: occurrence };
  if (occurrence) return { state: 'changed-occurrence', entry: occurrence };

  const sameContent = ledger.entries.find((entry) => entry.kind === candidate.kind && sameFingerprint(entry.fingerprint, candidate.fingerprint));
  return sameContent ? { state: 'same-content', entry: sameContent } : { state: 'unimported' };
}

export function recordImport(ledger: ImportLedger, entry: ImportLedgerEntry): ImportLedger {
  // Replace only the same occurrence. Equal content at another occurrence is
  // retained independently so review/semantic state never propagates by hash.
  const entries = ledger.entries.filter((existing) => !(existing.kind === entry.kind && sameLogicalLocator(existing.locator, entry.locator)));
  entries.push(entry);
  return { version: IMPORT_LEDGER_VERSION, entries };
}

function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  return a.algorithm === b.algorithm && a.representation === b.representation && a.digest === b.digest;
}

function sameLogicalLocator(a: SourceLocator, b: SourceLocator): boolean {
  // sourceDigest is freshness evidence, not occurrence identity.
  return a.source === b.source && a.sheet === b.sheet && a.range === b.range;
}
