/**
 * Import ledger (issue-0195): a plain JSON file in the project that records
 * which Candidates were imported, so later inspections can show only what is
 * not yet imported, and say when an imported source has changed.
 *
 * Deliberately readable without MMI: every entry carries the source, where in
 * it, what was hashed, and where the output went. The ledger never changes a
 * source workbook. Candidates with the same content are separate occurrences:
 * nothing here copies a role or a review decision from one to another.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Candidate, CandidateKind, Fingerprint } from './candidate.js';

export const LEDGER_SCHEMA = 'mmi.ledger/v1';
export const DEFAULT_LEDGER_FILE = 'mmi-ledger.json';

export interface ClaimBasis {
  /** Claim order is part of the deterministic Candidate contract. */
  index: number;
  aspect: string;
  /** Digest of claim/evidence + method provenance, excluding whole-source inputDigest. */
  digest: string;
}

export interface LedgerEntry {
  kind: CandidateKind;
  /** Source workbook, relative to the ledger file with forward slashes. */
  source: string;
  sheet?: string;
  /** A1 range, or `name:<object name>` for an object without a cell anchor. */
  place: string;
  fingerprint: Pick<Fingerprint, 'representation' | 'digest'>;
  /** Source bytes on which this review/import was based; freshness evidence, not occurrence identity. */
  sourceDigest: string;
  /** Per-claim review basis. Optional so existing mmi.ledger/v1 files remain readable. */
  claimBasis?: ClaimBasis[];
  /** Where the imported asset was written, relative to the ledger file. */
  output: string;
  /** Conversion/extraction conditions that produced the output. */
  conversion: Readonly<Record<string, string | number | boolean>>;
  /** The decision recorded: a person ran the import command. */
  reviewState: 'confirmed';
  basis: string;
  reviewedAt: string;
}

export interface Ledger {
  schema: typeof LEDGER_SCHEMA;
  entries: LedgerEntry[];
}

/**
 * - `imported`: this occurrence was imported with the same content.
 * - `changed`: this occurrence was imported, but its content fingerprint differs now.
 * - `stale`: content identity still matches, but one or more reviewed Claim/evidence bases changed.
 * - `duplicate`: the same content was imported from a different occurrence (not treated as imported).
 * - `unimported`: nothing like it is recorded.
 */
export type LedgerState = 'imported' | 'changed' | 'stale' | 'duplicate' | 'unimported';

export interface LedgerAssessment {
  state: LedgerState;
  entry?: LedgerEntry;
  /** Claim aspects whose review basis changed; present only for stale. */
  staleClaims?: string[];
}

export function emptyLedger(): Ledger {
  return { schema: LEDGER_SCHEMA, entries: [] };
}

export function readLedger(ledgerPath: string): Ledger {
  if (!fs.existsSync(ledgerPath)) return emptyLedger();
  const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as Partial<Ledger>;
  if (parsed.schema !== LEDGER_SCHEMA || !Array.isArray(parsed.entries)) {
    throw new Error(`${ledgerPath} is not an ${LEDGER_SCHEMA} ledger`);
  }
  return { schema: LEDGER_SCHEMA, entries: parsed.entries };
}

/** Where a candidate sits: its cell range, else its object name (anchor-less pictures). */
export function placeOf(candidate: Candidate): string {
  if (candidate.locator.range) return candidate.locator.range;
  const name = candidate.claims.find((claim) => claim.aspect === 'name')?.value;
  return `name:${typeof name === 'string' ? name : ''}`;
}

export function sourceKey(ledgerPath: string, absoluteSource: string): string {
  const relative = path.relative(path.dirname(path.resolve(ledgerPath)), path.resolve(absoluteSource)).split(path.sep).join('/');
  return relative;
}

function sameOccurrence(entry: LedgerEntry, kind: CandidateKind, source: string, sheet: string | undefined, place: string): boolean {
  return entry.kind === kind && entry.source === source && (entry.sheet ?? '') === (sheet ?? '') && entry.place === place;
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function provenanceBasis(candidate: Candidate): unknown {
  const run = candidate.provenance.run;
  return run.execution === 'deterministic'
    ? {
        algorithm: candidate.provenance.algorithm,
        execution: run.execution,
        config: run.config,
        implementationVersion: run.implementationVersion,
      }
    : {
        algorithm: candidate.provenance.algorithm,
        execution: run.execution,
        provider: run.provider,
        model: run.model,
        artifactVersion: run.artifactVersion,
        parameters: run.parameters,
      };
}

/**
 * Claim-level basis deliberately excludes locator.sourceDigest / run.inputDigest.
 * A change elsewhere in the workbook therefore does not stale an unchanged
 * local claim; changes to the claim, evidence, method config or implementation
 * do. This is the D4 freshness boundary from ADR-0021.
 */
export function claimBasisOf(candidate: Candidate): ClaimBasis[] {
  const provenance = provenanceBasis(candidate);
  return candidate.claims.map((claim, index) => ({
    index,
    aspect: claim.aspect,
    digest: sha256Json({
      claim: {
        aspect: claim.aspect,
        ...(claim.value !== undefined ? { value: claim.value } : {}),
        status: claim.status,
        execution: claim.execution,
        method: claim.method,
        reasonCode: claim.reasonCode,
        ...(claim.evidence ? { evidence: claim.evidence } : {}),
      },
      provenance,
    }),
  }));
}

function staleClaimAspects(previous: readonly ClaimBasis[], current: readonly ClaimBasis[]): string[] {
  const changed = new Set<string>();
  const count = Math.max(previous.length, current.length);
  for (let index = 0; index < count; index += 1) {
    const before = previous[index];
    const after = current[index];
    if (!before || !after || before.index !== after.index || before.aspect !== after.aspect || before.digest !== after.digest) {
      changed.add(after?.aspect ?? before?.aspect ?? `claim-${index}`);
    }
  }
  return [...changed];
}

export function assessLedger(
  ledger: Ledger,
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
): LedgerAssessment {
  const source = sourceKey(ledgerPath, absoluteSource);
  const place = placeOf(candidate);
  const here = ledger.entries.find((entry) => sameOccurrence(entry, candidate.kind, source, candidate.locator.sheet, place));
  if (here) {
    if (
      here.fingerprint.representation !== candidate.fingerprint.representation
      || here.fingerprint.digest !== candidate.fingerprint.digest
    ) {
      return { state: 'changed', entry: here };
    }
    if (here.claimBasis) {
      const staleClaims = staleClaimAspects(here.claimBasis, claimBasisOf(candidate));
      if (staleClaims.length > 0) return { state: 'stale', entry: here, staleClaims };
    }
    // Legacy v1 entries without claimBasis remain fingerprint-compatible.
    return { state: 'imported', entry: here };
  }
  const elsewhere = ledger.entries.find(
    (entry) => entry.kind === candidate.kind
      && entry.fingerprint.representation === candidate.fingerprint.representation
      && entry.fingerprint.digest === candidate.fingerprint.digest,
  );
  return elsewhere ? { state: 'duplicate', entry: elsewhere } : { state: 'unimported' };
}

export function classify(ledger: Ledger, ledgerPath: string, absoluteSource: string, candidate: Candidate): LedgerState {
  return assessLedger(ledger, ledgerPath, absoluteSource, candidate).state;
}

export function entryFor(
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
  outputFile: string,
  basis: string,
  conversion: Readonly<Record<string, string | number | boolean>> = {},
): LedgerEntry {
  return {
    kind: candidate.kind,
    source: sourceKey(ledgerPath, absoluteSource),
    ...(candidate.locator.sheet ? { sheet: candidate.locator.sheet } : {}),
    place: placeOf(candidate),
    fingerprint: { representation: candidate.fingerprint.representation, digest: candidate.fingerprint.digest },
    sourceDigest: candidate.locator.sourceDigest,
    claimBasis: claimBasisOf(candidate),
    output: path.relative(path.dirname(path.resolve(ledgerPath)), path.resolve(outputFile)).split(path.sep).join('/'),
    conversion,
    reviewState: 'confirmed',
    basis,
    reviewedAt: new Date().toISOString(),
  };
}

/** Adds or replaces entries by occurrence, keeps the file order stable, and writes the ledger. Returns the ledger. */
export function recordEntries(ledgerPath: string, entries: readonly LedgerEntry[]): Ledger {
  const ledger = readLedger(ledgerPath);
  for (const entry of entries) {
    const index = ledger.entries.findIndex((existing) => sameOccurrence(existing, entry.kind, entry.source, entry.sheet, entry.place));
    if (index >= 0) ledger.entries[index] = entry;
    else ledger.entries.push(entry);
  }
  ledger.entries.sort((a, b) => `${a.source}\u0000${a.sheet ?? ''}\u0000${a.place}`.localeCompare(`${b.source}\u0000${b.sheet ?? ''}\u0000${b.place}`));
  fs.mkdirSync(path.dirname(path.resolve(ledgerPath)), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}
