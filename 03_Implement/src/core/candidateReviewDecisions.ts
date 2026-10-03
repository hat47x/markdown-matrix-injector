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

const REVIEW_DECISION_KINDS = new Set<CandidateKind>([
  'table-range',
  'image',
  'region-snapshot',
  'shape',
  'diagram',
  'tree',
  'choice-list',
  'note',
  'link',
  'section',
]);
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

export interface CandidateReviewDecisionEntry {
  kind: CandidateKind;
  /** Source path relative to the decision file. */
  source: string;
  sheet?: string;
  place: string;
  fingerprint: Pick<Fingerprint, 'representation' | 'digest'>;
  claimBasis: ClaimBasis[];
  decision: 'rejected' | 'deferred';
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
  parsed.entries.forEach((entry, index) => {
    const problem = reviewDecisionEntryProblem(entry);
    if (problem) {
      throw new Error(
        `${decisionPath} has invalid ${REVIEW_DECISIONS_SCHEMA} entry ${index}: ${problem}`,
      );
    }
  });
  return {
    schema: REVIEW_DECISIONS_SCHEMA,
    entries: parsed.entries,
  };
}

function reviewDecisionEntryProblem(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'entry must be an object';
  }
  const entry = value as Partial<CandidateReviewDecisionEntry>;
  if (!entry.kind || !REVIEW_DECISION_KINDS.has(entry.kind)) return 'kind is invalid';
  if (typeof entry.source !== 'string' || !entry.source) return 'source is required';
  if (entry.sheet !== undefined && typeof entry.sheet !== 'string') return 'sheet must be a string';
  if (typeof entry.place !== 'string' || !entry.place) return 'place is required';
  if (!entry.fingerprint || typeof entry.fingerprint !== 'object') {
    return 'fingerprint must be an object';
  }
  if (typeof entry.fingerprint.representation !== 'string'
    || !entry.fingerprint.representation) {
    return 'fingerprint representation is required';
  }
  if (typeof entry.fingerprint.digest !== 'string'
    || !SHA256_DIGEST.test(entry.fingerprint.digest)) {
    return 'fingerprint digest must be sha256';
  }
  if (!Array.isArray(entry.claimBasis)) return 'claimBasis must be an array';
  for (const [index, item] of entry.claimBasis.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return `claimBasis[${index}] must be an object`;
    }
    if (!Number.isInteger(item.index) || item.index < 0) {
      return `claimBasis[${index}].index must be a non-negative integer`;
    }
    if (typeof item.aspect !== 'string' || !item.aspect) {
      return `claimBasis[${index}].aspect is required`;
    }
    if (typeof item.digest !== 'string' || !SHA256_DIGEST.test(item.digest)) {
      return `claimBasis[${index}].digest must be sha256`;
    }
  }
  if (entry.decision !== 'rejected' && entry.decision !== 'deferred') {
    return 'decision must be rejected or deferred';
  }
  if (typeof entry.basis !== 'string' || !entry.basis) return 'basis is required';
  if (typeof entry.reviewedAt !== 'string' || !entry.reviewedAt) return 'reviewedAt is required';
  return undefined;
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
function reviewDecisionForCandidate(
  decisions: CandidateReviewDecisions,
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
  decision: CandidateReviewDecisionEntry['decision'],
): CandidateReviewDecisionEntry | undefined {
  const source = sourceKey(decisionPath, absoluteSource);
  const currentBasis = claimBasisOf(candidate);
  return decisions.entries.find(
    (entry) =>
      entry.decision === decision
      && sameOccurrence(entry, source, candidate)
      && entry.fingerprint.representation
        === candidate.fingerprint.representation
      && entry.fingerprint.digest === candidate.fingerprint.digest
      && sameClaimBasis(entry.claimBasis, currentBasis),
  );
}

export function rejectedDecisionForCandidate(
  decisions: CandidateReviewDecisions,
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
): CandidateReviewDecisionEntry | undefined {
  return reviewDecisionForCandidate(
    decisions,
    decisionPath,
    absoluteSource,
    candidate,
    'rejected',
  );
}

export function deferredDecisionForCandidate(
  decisions: CandidateReviewDecisions,
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
): CandidateReviewDecisionEntry | undefined {
  return reviewDecisionForCandidate(
    decisions,
    decisionPath,
    absoluteSource,
    candidate,
    'deferred',
  );
}

function recordReviewDecision(
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
  decision: CandidateReviewDecisionEntry['decision'],
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
    decision,
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

export function recordRejectedDecision(
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
  basis: string,
): CandidateReviewDecisions {
  return recordReviewDecision(
    decisionPath,
    absoluteSource,
    candidate,
    'rejected',
    basis,
  );
}

export function recordDeferredDecision(
  decisionPath: string,
  absoluteSource: string,
  candidate: Candidate,
  basis: string,
): CandidateReviewDecisions {
  return recordReviewDecision(
    decisionPath,
    absoluteSource,
    candidate,
    'deferred',
    basis,
  );
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
