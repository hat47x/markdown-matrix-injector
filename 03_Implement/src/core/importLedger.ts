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
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Candidate, CandidateKind, Claim, Fingerprint } from './candidate.js';

export const LEDGER_SCHEMA = 'mmi.ledger/v1';
export const DEFAULT_LEDGER_FILE = 'mmi-ledger.json';

export interface ClaimBasis {
  /** Claim order is part of the deterministic Candidate contract. */
  index: number;
  aspect: string;
  /** Digest of claim/evidence + method provenance, excluding whole-source inputDigest. */
  digest: string;
}

export interface LedgerClaimBasis {
  aspect: string;
  /** 0-based among claims with the same aspect. */
  ordinal: number;
  /** Digest of the local claim evidence + method/runtime identity, excluding whole-source digest. */
  evidenceDigest: string;
}

export interface LedgerLineageHints {
  objectName?: string;
  sourceObject?: string;
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
  /**
   * Optional for backward-compatible reading of early v1 ledgers. New entries
   * retain local review basis so unrelated source changes do not stale every
   * claim (ADR-0021 D2/D4).
   */
  claimBasis?: readonly LedgerClaimBasis[];
  /** Non-authoritative clues used only to propose lineage after source edits/moves. */
  lineageHints?: LedgerLineageHints;
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


function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function runIdentity(candidate: Candidate): unknown {
  const run = candidate.provenance.run;
  return run.execution === 'deterministic'
    ? {
        execution: run.execution,
        config: run.config,
        implementationVersion: run.implementationVersion,
      }
    : {
        execution: run.execution,
        provider: run.provider,
        model: run.model,
        artifactVersion: run.artifactVersion,
        parameters: run.parameters,
      };
}

/**
 * Local review basis deliberately excludes sourceDigest/inputDigest. A change
 * elsewhere in the workbook must not stale an unchanged claim. Claim value,
 * evidence, method and algorithm/runtime identity are still bound.
 */
export function claimBasisOf(candidate: Candidate): LedgerClaimBasis[] {
  const ordinalByAspect = new Map<string, number>();
  return candidate.claims.map((claim) => {
    const ordinal = ordinalByAspect.get(claim.aspect) ?? 0;
    ordinalByAspect.set(claim.aspect, ordinal + 1);
    return {
      aspect: claim.aspect,
      ordinal,
      evidenceDigest: claimEvidenceDigest(candidate, claim),
    };
  });
}

function claimEvidenceDigest(candidate: Candidate, claim: Claim): string {
  return sha256Json({
    aspect: claim.aspect,
    value: claim.value ?? null,
    status: claim.status,
    execution: claim.execution,
    method: claim.method,
    reasonCode: claim.reasonCode,
    evidence: claim.evidence ?? [],
    algorithm: candidate.provenance.algorithm,
    run: runIdentity(candidate),
  });
}

export function lineageHintsOf(candidate: Candidate): LedgerLineageHints {
  const stringClaim = (aspect: string): string | undefined => {
    const value = candidate.claims.find((claim) => claim.aspect === aspect)?.value;
    return typeof value === 'string' ? value : undefined;
  };
  return {
    ...(stringClaim('name') ? { objectName: stringClaim('name') } : {}),
    ...(stringClaim('media') ? { sourceObject: stringClaim('media') } : {}),
    ...(stringClaim('nearby-table') ? { nearbyTable: stringClaim('nearby-table') } : {}),
  };
}

function sameOccurrence(entry: LedgerEntry, kind: CandidateKind, source: string, sheet: string | undefined, place: string): boolean {
  return entry.kind === kind && entry.source === source && (entry.sheet ?? '') === (sheet ?? '') && entry.place === place;
}


function occurrenceEntry(
  ledger: Ledger,
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
): LedgerEntry | undefined {
  const source = sourceKey(ledgerPath, absoluteSource);
  return ledger.entries.find((entry) =>
    sameOccurrence(entry, candidate.kind, source, candidate.locator.sheet, placeOf(candidate)));
}

export function reviewFreshness(
  ledger: Ledger,
  ledgerPath: string,
  absoluteSource: string,
  candidate: Candidate,
): ReviewFreshness {
  const entry = occurrenceEntry(ledger, ledgerPath, absoluteSource, candidate);
  if (!entry?.claimBasis) return { state: 'unknown', claims: [] };

  const recorded = new Map(entry.claimBasis.map((basis) => [`${basis.aspect}\u0000${basis.ordinal}`, basis]));
  const currentList = claimBasisOf(candidate);
  const current = new Map(currentList.map((basis) => [`${basis.aspect}\u0000${basis.ordinal}`, basis]));
  const claims: ClaimFreshness[] = [];

  for (const basis of entry.claimBasis) {
    const now = current.get(`${basis.aspect}\u0000${basis.ordinal}`);
    claims.push({
      aspect: basis.aspect,
      ordinal: basis.ordinal,
      state: !now ? 'missing' : now.evidenceDigest === basis.evidenceDigest ? 'fresh' : 'stale',
    });
  }
  for (const basis of currentList) {
    if (!recorded.has(`${basis.aspect}\u0000${basis.ordinal}`)) {
      claims.push({ aspect: basis.aspect, ordinal: basis.ordinal, state: 'new' });
    }
  }

  const changed = claims.filter((claim) => claim.state !== 'fresh').length;
  const fresh = claims.length - changed;
  return {
    state: changed === 0 ? 'fresh' : fresh === 0 ? 'stale' : 'partially-stale',
    claims,
  };
}

/**
 * Suggest old occurrences that may be the lineage predecessor of the current
 * Candidate. These are evidence-only proposals: no review state is inherited.
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
    .sort((a, b) => b.reasons.length - a.reasons.length
      || `${a.entry.sheet ?? ''}\u0000${a.entry.place}`.localeCompare(`${b.entry.sheet ?? ''}\u0000${b.entry.place}`))
    .map(({ entry, reasons }) => ({
      source: entry.source,
      ...(entry.sheet ? { sheet: entry.sheet } : {}),
      place: entry.place,
      output: entry.output,
      reasons,
    }));
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
  for (const before of previous) {
    // Review basis is intentionally a subset: claims discovered later do not
    // retroactively invalidate the original decision. Current Candidate kinds
    // use one claim per aspect; index is retained for readable audit/debugging.
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
    claimBasis: claimBasisOf(candidate),
    lineageHints: lineageHintsOf(candidate),
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
