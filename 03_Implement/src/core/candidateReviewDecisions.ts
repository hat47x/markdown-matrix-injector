import fs from 'node:fs';
import path from 'node:path';

import type { Candidate, CandidateKind, Fingerprint } from './candidate.js';
import {
  claimBasisOf,
  placeOf,
  sourceKey,
  type ClaimBasis,
} from './importLedger.js';

export const REVIEW_DECISIONS_SCHEMA = 'mmi.review-decisions/v1';
export const DEFAULT_REVIEW_DECISIONS_FILE = 'mmi-review-decisions.json';

export interface CandidateReviewDecisionEntry {
  kind: CandidateKind;
  /** Source path relative to the decision file. */
  source: string;
  sheet?: string;
  place: string;
  fingerprint: Pick<Fingerprint, 'representation' | 'digest'>;
  claimBasis: ClaimBasis[];
  decision: 'rejected';
  basis: string;
  reviewedAt: string;
}

export interface CandidateReviewDecisions {
  schema: typeof REVIEW_DECISIONS_SCHEMA;
  entries: CandidateReviewDecisionEntry[];
}

export function emptyReviewDecisions(): CandidateReviewDecisions {
  return { schema: REVIEW_DECISIONS_SCHEMA, entries: [] };
}

export function readReviewDecisions(
  decisionPath: string,
): CandidateReviewDecisions {
  if (!fs.existsSync(decisionPath)) return emptyReviewDecisions();
  const parsed = JSON.parse(
    fs.readFileSync(decisionPath, 'utf8'),
  ) as Partial<CandidateReviewDecisions>;
  if (
    parsed.schema !== REVIEW_DECISIONS_SCHEMA
    || !Array.isArray(parsed.entries)
  ) {
    throw new Error(
      `${decisionPath} is not an ${REVIEW_DECISIONS_SCHEMA} file`,
    );
  }
  return {
    schema: REVIEW_DECISIONS_SCHEMA,
    entries: parsed.entries,
  };
}

function sameOccurrence(
  entry: CandidateReviewDecisionEntry,
  source: string,
  candidate: Candidate,
): boolean {
  return entry.kind === candidate.kind
    && entry.source === source
    && (entry.sheet ?? '') === (candidate.locator.sheet ?? '')
    && entry.place === placeOf(candidate);
}

function sameClaimBasis(
  previous: readonly ClaimBasis[],
  current: readonly ClaimBasis[],
): boolean {
  return previous.length === current.length
    && previous.every((before, index) => {
      const after = current[index];
      return Boolean(
        after
        && before.index === after.index
        && before.aspect === after.aspect
        && before.digest === after.digest,
      );
    });
}

/**
 * A rejection is valid only for the exact reviewed occurrence/content/basis.
 * Unrelated source-file changes do not resurrect it because sourceDigest is
 * intentionally not identity; changed content or changed inference evidence
 * does resurrect the Candidate for review.
 */
export function rejectedDecisionForCandidate(
  decisions: CandidateReviewDecisions,
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
): CandidateReviewDecisionEntry | undefined {
  const source = sourceKey(decisionPath, absoluteSource);
  const currentBasis = claimBasisOf(candidate);
  return decisions.entries.find(
    (entry) =>
      entry.decision === 'rejected'
      && sameOccurrence(entry, source, candidate)
      && entry.fingerprint.representation
        === candidate.fingerprint.representation
      && entry.fingerprint.digest === candidate.fingerprint.digest
      && sameClaimBasis(entry.claimBasis, currentBasis),
  );
}

export function recordRejectedDecision(
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
  basis: string,
): CandidateReviewDecisions {
  const decisions = readReviewDecisions(decisionPath);
  const source = sourceKey(decisionPath, absoluteSource);
  const entry: CandidateReviewDecisionEntry = {
    kind: candidate.kind,
    source,
    ...(candidate.locator.sheet
      ? { sheet: candidate.locator.sheet }
      : {}),
    place: placeOf(candidate),
    fingerprint: {
      representation: candidate.fingerprint.representation,
      digest: candidate.fingerprint.digest,
    },
    claimBasis: claimBasisOf(candidate),
    decision: 'rejected',
    basis,
    reviewedAt: new Date().toISOString(),
  };
  const index = decisions.entries.findIndex(
    (existing) => sameOccurrence(existing, source, candidate),
  );
  if (index >= 0) decisions.entries[index] = entry;
  else decisions.entries.push(entry);
  decisions.entries.sort((a, b) =>
    `${a.source}\u0000${a.sheet ?? ''}\u0000${a.place}`
      .localeCompare(
        `${b.source}\u0000${b.sheet ?? ''}\u0000${b.place}`,
      ));
  writeReviewDecisions(decisionPath, decisions);
  return decisions;
}

export function clearReviewDecisionForCandidate(
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
): CandidateReviewDecisions {
  const existed = fs.existsSync(decisionPath);
  const decisions = readReviewDecisions(decisionPath);
  const source = sourceKey(decisionPath, absoluteSource);
  const before = decisions.entries.length;
  decisions.entries = decisions.entries.filter(
    (entry) => !sameOccurrence(entry, source, candidate),
  );
  if (existed && decisions.entries.length !== before) {
    writeReviewDecisions(decisionPath, decisions);
  }
  return decisions;
}

function writeReviewDecisions(
  decisionPath: string,
  decisions: CandidateReviewDecisions,
): void {
  fs.mkdirSync(path.dirname(path.resolve(decisionPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    decisionPath,
    `${JSON.stringify(decisions, null, 2)}\n`,
    'utf8',
  );
}
