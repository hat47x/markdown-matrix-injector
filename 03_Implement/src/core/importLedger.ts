/**
 * Import ledger (issue-0195): readable project-local history of reviewed/imported
 * Candidate occurrences. Occurrence identity, content identity, Claim review
 * basis and lineage evidence remain separate (ADR-0021).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
  Candidate,
  CandidateKind,
  Fingerprint,
  ReviewState,
} from './candidate.js';

export const LEDGER_SCHEMA = 'mmi.ledger/v1';
export const DEFAULT_LEDGER_FILE = 'mmi-ledger.json';

export interface ClaimBasis {
  /** Claim order is part of the deterministic Candidate contract. */
  index: number;
  aspect: string;
  /** Digest of claim/evidence + method provenance, excluding whole-source inputDigest. */
  digest: string;
}

export interface LedgerLineageHints {
  /** Human-authored object name when the source format exposes one. */
  objectName?: string;
  /** Source-native object/media identity when available. */
  sourceObject?: string;
  /** Nearby table/range evidence used only as a reconciliation clue. */
  nearbyTable?: string;
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
  /** Optional so early mmi.ledger/v1 files remain readable. */
  claimBasis?: ClaimBasis[];
  /** Non-authoritative evidence used only to propose lineage after source edits/moves. */
  lineageHints?: LedgerLineageHints;
  /** Where the imported asset was written, relative to the ledger file. */
  output: string;
  /** Optional for legacy v1 records; new records bind the reviewed output bytes. */
  outputDigest?: string;
  /** Conversion/extraction conditions that produced the output. */
  conversion: Readonly<Record<string, string | number | boolean>>;
  /**
   * Adoption/review state, separate from Candidate epistemic status.
   * `confirmed` is accepted only for legacy mmi.ledger/v1 records.
   */
  reviewState: Extract<ReviewState, 'accepted' | 'modified'> | 'confirmed';
  basis: string;
  reviewedAt: string;
}

export interface Ledger {
  schema: typeof LEDGER_SCHEMA;
  entries: LedgerEntry[];
}

/**
 * - imported: same occurrence, same content, same reviewed Claim basis.
 * - changed: same occurrence, different content identity.
 * - stale: same occurrence/content, but one or more reviewed Claim bases changed.
 * - duplicate: same content imported at another occurrence; review does not transfer.
 * - unimported: no matching occurrence/content evidence.
 */
export type LedgerState = 'imported' | 'changed' | 'stale' | 'duplicate' | 'unimported';

export interface LedgerAssessment {
  state: LedgerState;
  entry?: LedgerEntry;
  /** Claim aspects whose previous review basis no longer matches the current Candidate. */
  staleClaims?: string[];
}

export interface LineageCandidate {
  source: string;
  sourceDigest: string;
  sheet?: string;
  place: string;
  output: string;
  /** Evidence only; never an automatic identity/review transfer. */
  reasons: readonly string[];
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
  return {
    schema: LEDGER_SCHEMA,
    entries: parsed.entries.map((entry) => ({
      ...entry,
      reviewState:
        entry.reviewState === 'confirmed'
          ? 'accepted'
          : entry.reviewState,
    })),
  };
}

/** Where a candidate sits inside its source, independent of content identity. */
export function placeOf(candidate: Candidate): string {
  if (candidate.locator.range) return candidate.locator.range;
  if (candidate.locator.structuralPath !== undefined) {
    return `path:${candidate.locator.structuralPath}`;
  }
  const name = candidate.claims.find((claim) => claim.aspect === 'name')?.value;
  return `name:${typeof name === 'string' ? name : ''}`;
}

export function sourceKey(ledgerPath: string, absoluteSource: string): string {
  return path.relative(path.dirname(path.resolve(ledgerPath)), path.resolve(absoluteSource)).split(path.sep).join('/');
}

function sameOccurrence(
  entry: LedgerEntry,
  kind: CandidateKind,
  source: string,
  sheet: string | undefined,
  place: string,
): boolean {
  return entry.kind === kind
    && entry.source === source
    && (entry.sheet ?? '') === (sheet ?? '')
    && entry.place === place;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
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
 * Claim-level basis deliberately excludes locator.sourceDigest/run.inputDigest.
 * A change elsewhere in the workbook therefore does not stale an unchanged
 * local claim; claim/evidence/method/runtime changes still do (ADR-0021 D4).
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

export function lineageHintsOf(candidate: Candidate): LedgerLineageHints {
  const stringClaim = (aspect: string): string | undefined => {
    const value = candidate.claims.find((claim) => claim.aspect === aspect)?.value;
    return typeof value === 'string' ? value : undefined;
  };
  const objectName = stringClaim('name');
  const sourceObject = stringClaim('media');
  const nearbyTable = stringClaim('nearby-table');
  return {
    ...(objectName ? { objectName } : {}),
    ...(sourceObject ? { sourceObject } : {}),
    ...(nearbyTable ? { nearbyTable } : {}),
  };
}

function staleClaimAspects(previous: readonly ClaimBasis[], current: readonly ClaimBasis[]): string[] {
  const changed = new Set<string>();
  for (const before of previous) {
    // Revalidate only the Claims that formed the recorded review basis.
    // A newly discovered Claim must not retroactively invalidate the earlier
    // decision merely because a later adapter can describe more evidence.
    const after = current.find((item) => item.aspect === before.aspect);
    if (!after || before.digest !== after.digest) changed.add(before.aspect);
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
  const here = ledger.entries.find((entry) =>
    sameOccurrence(entry, candidate.kind, source, candidate.locator.sheet, place));

  if (here) {
    const staleClaims = here.claimBasis
      ? staleClaimAspects(here.claimBasis, claimBasisOf(candidate))
      : [];
    const contentChanged = here.fingerprint.representation !== candidate.fingerprint.representation
      || here.fingerprint.digest !== candidate.fingerprint.digest;
    if (contentChanged) {
      return {
        state: 'changed',
        entry: here,
        ...(staleClaims.length > 0 ? { staleClaims } : {}),
      };
    }
    if (staleClaims.length > 0) return { state: 'stale', entry: here, staleClaims };
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

export function classify(
  ledger: Ledger,
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
): LedgerState {
  return assessLedger(ledger, ledgerPath, absoluteSource, candidate).state;
}

/**
 * Propose possible predecessors after movement/source edits. Evidence is kept
 * explicit and no review state or semantic role is inherited automatically.
 */
export function lineageCandidates(
  ledger: Ledger,
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
): LineageCandidate[] {
  const source = sourceKey(ledgerPath, absoluteSource);
  const place = placeOf(candidate);
  const hints = lineageHintsOf(candidate);
  const sameContent = (entry: LedgerEntry): boolean =>
    entry.fingerprint.representation === candidate.fingerprint.representation
    && entry.fingerprint.digest === candidate.fingerprint.digest;

  return ledger.entries
    .filter((entry) =>
      entry.kind === candidate.kind
      && entry.source === source
      && !sameOccurrence(entry, candidate.kind, source, candidate.locator.sheet, place))
    .map((entry) => {
      const reasons: string[] = [];
      if (sameContent(entry)) reasons.push('same-content');
      if ((entry.sheet ?? '') === (candidate.locator.sheet ?? '')) reasons.push('same-sheet');
      if (hints.objectName && entry.lineageHints?.objectName === hints.objectName) reasons.push('same-object-name');
      if (hints.sourceObject && entry.lineageHints?.sourceObject === hints.sourceObject) reasons.push('same-source-object');
      if (hints.nearbyTable && entry.lineageHints?.nearbyTable === hints.nearbyTable) reasons.push('same-nearby-table');
      return { entry, reasons };
    })
    .filter(({ reasons }) =>
      reasons.some((reason) =>
        reason === 'same-content'
        || reason === 'same-object-name'
        || reason === 'same-source-object'
        || reason === 'same-nearby-table'))
    .sort((a, b) =>
      b.reasons.length - a.reasons.length
      || `${a.entry.sheet ?? ''}\u0000${a.entry.place}`.localeCompare(`${b.entry.sheet ?? ''}\u0000${b.entry.place}`))
    .map(({ entry, reasons }) => ({
      source: entry.source,
      sourceDigest: entry.sourceDigest,
      ...(entry.sheet ? { sheet: entry.sheet } : {}),
      place: entry.place,
      output: entry.output,
      reasons,
    }));
}

export function entryFor(
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
  outputFile: string,
  basis: string,
  conversion: Readonly<Record<string, string | number | boolean>> = {},
  reviewState: Extract<ReviewState, 'accepted' | 'modified'> = 'accepted',
): LedgerEntry {
  return {
    kind: candidate.kind,
    source: sourceKey(ledgerPath, absoluteSource),
    ...(candidate.locator.sheet ? { sheet: candidate.locator.sheet } : {}),
    place: placeOf(candidate),
    fingerprint: {
      representation: candidate.fingerprint.representation,
      digest: candidate.fingerprint.digest,
    },
    sourceDigest: candidate.locator.sourceDigest,
    claimBasis: claimBasisOf(candidate),
    lineageHints: lineageHintsOf(candidate),
    output: path.relative(path.dirname(path.resolve(ledgerPath)), path.resolve(outputFile)).split(path.sep).join('/'),
    ...(fs.existsSync(outputFile) && fs.statSync(outputFile).isFile()
      ? { outputDigest: `sha256:${createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex')}` }
      : {}),
    conversion,
    reviewState,
    basis,
    reviewedAt: new Date().toISOString(),
  };
}

/** Adds or replaces entries by occurrence, keeps file order stable, and writes the ledger. */
export function recordEntries(ledgerPath: string, entries: readonly LedgerEntry[]): Ledger {
  const ledger = readLedger(ledgerPath);
  for (const entry of entries) {
    const index = ledger.entries.findIndex((existing) =>
      sameOccurrence(existing, entry.kind, entry.source, entry.sheet, entry.place));
    if (index >= 0) ledger.entries[index] = entry;
    else ledger.entries.push(entry);
  }
  ledger.entries.sort((a, b) =>
    `${a.source}\u0000${a.sheet ?? ''}\u0000${a.place}`
      .localeCompare(`${b.source}\u0000${b.sheet ?? ''}\u0000${b.place}`));
  fs.mkdirSync(path.dirname(path.resolve(ledgerPath)), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}
