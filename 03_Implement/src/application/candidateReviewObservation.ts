import fs from 'node:fs';
import path from 'node:path';

import type { CandidateLedgerFilter, LedgerState } from '../core/candidateLedgerView.js';
import type { ReviewState } from '../core/candidate.js';
import type { CandidateReviewViewItem } from '../core/candidateReviewView.js';
import { matchesCandidateReviewFacets, type CandidateReviewFacetFilter } from './candidateReviewFilter.js';
import { candidateReviewSessionKey } from './candidateReviewSession.js';

export const CANDIDATE_REVIEW_OBSERVATION_SCHEMA =
  'mmi.candidate-review-observation/v1' as const;

export const DEFAULT_CANDIDATE_REVIEW_OBSERVATION_FILE =
  '.mmi/candidate-review-observations.jsonl';

type ReviewProjectionState = Extract<
  ReviewState,
  'unreviewed' | 'accepted' | 'modified' | 'rejected' | 'deferred'
>;

export interface CandidateReviewObservationSnapshotItem {
  key: string;
  ledgerState: LedgerState;
  reviewState: ReviewProjectionState;
}

export interface CandidateReviewObservationSnapshot {
  total: number;
  items: CandidateReviewObservationSnapshotItem[];
}

export interface CandidateReviewObservation {
  schema: typeof CANDIDATE_REVIEW_OBSERVATION_SCHEMA;
  source: {
    label: string;
    digest: string;
  };
  startedAtUtc: string;
  endedAtUtc: string;
  durationMs: number;
  /** One session started while a Markdown editor was active. A proxy, not a claim about cognitive interruption. */
  editingInterruptionProxy: 0 | 1;
  ui: {
    ledgerFilter: CandidateLedgerFilter;
    facets: CandidateReviewFacetFilter;
    selectedCount: number;
  };
  initial: {
    total: number;
    ledgerStates: Record<LedgerState, number>;
    reviewStates: Record<ReviewProjectionState, number>;
  };
  final: {
    total: number;
    ledgerStates: Record<LedgerState, number>;
    reviewStates: Record<ReviewProjectionState, number>;
  };
  transitions: {
    reviewStateChanged: number;
    toAccepted: number;
    toModified: number;
    toRejected: number;
    toDeferred: number;
    toUnreviewed: number;
    newlyImported: number;
  };
}

export function candidateReviewObservationSnapshot(
  view: readonly CandidateReviewViewItem[],
  facetFilter: CandidateReviewFacetFilter,
): CandidateReviewObservationSnapshot {
  const items = view
    .filter((item) => matchesCandidateReviewFacets(item.candidate, facetFilter))
    .map((item) => ({
      key: candidateReviewSessionKey(item.candidate),
      ledgerState: item.ledgerState,
      reviewState: item.reviewState,
    }));

  return {
    total: items.length,
    items,
  };
}

export function createCandidateReviewObservation(input: {
  sourceLabel: string;
  sourceDigest: string;
  startedAtUtc: string;
  endedAtUtc: string;
  interruptedMarkdownEditing: boolean;
  ledgerFilter: CandidateLedgerFilter;
  facetFilter: CandidateReviewFacetFilter;
  selectedCount: number;
  initial: CandidateReviewObservationSnapshot;
  final: CandidateReviewObservationSnapshot;
}): CandidateReviewObservation {
  const started = Date.parse(input.startedAtUtc);
  const ended = Date.parse(input.endedAtUtc);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    throw new Error('candidate review observation needs valid ordered timestamps');
  }
  if (!input.sourceLabel.trim()) {
    throw new Error('candidate review observation needs a source label');
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.sourceDigest)) {
    throw new Error('candidate review observation source digest must be sha256');
  }
  if (!Number.isInteger(input.selectedCount) || input.selectedCount < 0) {
    throw new Error('candidate review observation selectedCount must be a non-negative integer');
  }

  const initialByKey = new Map(
    input.initial.items.map((item) => [item.key, item] as const),
  );
  const finalByKey = new Map(
    input.final.items.map((item) => [item.key, item] as const),
  );
  const finalCohortItems = input.initial.items.flatMap((before) => {
    const after = finalByKey.get(before.key);
    return after ? [after] : [];
  });
  const finalCohort: CandidateReviewObservationSnapshot = {
    total: finalCohortItems.length,
    items: finalCohortItems,
  };

  const transitions = {
    reviewStateChanged: 0,
    toAccepted: 0,
    toModified: 0,
    toRejected: 0,
    toDeferred: 0,
    toUnreviewed: 0,
    newlyImported: 0,
  };

  for (const [key, before] of initialByKey) {
    const after = finalByKey.get(key);
    if (!after) continue;

    if (before.reviewState !== after.reviewState) {
      transitions.reviewStateChanged += 1;
      switch (after.reviewState) {
        case 'accepted':
          transitions.toAccepted += 1;
          break;
        case 'modified':
          transitions.toModified += 1;
          break;
        case 'rejected':
          transitions.toRejected += 1;
          break;
        case 'deferred':
          transitions.toDeferred += 1;
          break;
        case 'unreviewed':
          transitions.toUnreviewed += 1;
          break;
      }
    }
    if (
      before.ledgerState !== 'imported'
      && after.ledgerState === 'imported'
    ) {
      transitions.newlyImported += 1;
    }
  }

  return {
    schema: CANDIDATE_REVIEW_OBSERVATION_SCHEMA,
    source: {
      label: input.sourceLabel,
      digest: input.sourceDigest,
    },
    startedAtUtc: new Date(started).toISOString(),
    endedAtUtc: new Date(ended).toISOString(),
    durationMs: ended - started,
    editingInterruptionProxy: input.interruptedMarkdownEditing ? 1 : 0,
    ui: {
      ledgerFilter: input.ledgerFilter,
      facets: {
        kinds: [...input.facetFilter.kinds],
        statuses: [...input.facetFilter.statuses],
        executions: [...input.facetFilter.executions],
      },
      selectedCount: input.selectedCount,
    },
    initial: summarizeSnapshot(input.initial),
    final: summarizeSnapshot(finalCohort),
    transitions,
  };
}

export function appendCandidateReviewObservation(
  filePath: string,
  observation: CandidateReviewObservation,
): void {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(observation)}\n`, 'utf8');
}

function summarizeSnapshot(
  snapshot: CandidateReviewObservationSnapshot,
): CandidateReviewObservation['initial'] {
  const ledgerStates: Record<LedgerState, number> = {
    imported: 0,
    changed: 0,
    stale: 0,
    duplicate: 0,
    unimported: 0,
  };
  const reviewStates: Record<ReviewProjectionState, number> = {
    unreviewed: 0,
    accepted: 0,
    modified: 0,
    rejected: 0,
    deferred: 0,
  };

  for (const item of snapshot.items) {
    ledgerStates[item.ledgerState] += 1;
    reviewStates[item.reviewState] += 1;
  }

  return {
    total: snapshot.total,
    ledgerStates,
    reviewStates,
  };
}
