import type { Candidate, ReviewState } from './candidate.js';
import {
  candidateLedgerView,
  type CandidateLedgerFilter,
  type CandidateLedgerViewItem,
  type CandidateSimilarityEvidenceSource,
} from './candidateLedgerView.js';
import {
  rejectedDecisionForCandidate,
  type CandidateReviewDecisions,
} from './candidateReviewDecisions.js';
import type { Ledger } from './importLedger.js';

export interface CandidateReviewViewItem
  extends CandidateLedgerViewItem {
  reviewState: Extract<
    ReviewState,
    'unreviewed' | 'accepted' | 'rejected'
  >;
  rejected: boolean;
}

/**
 * Product-facing review projection.
 *
 * Import state and explicit review decisions remain separate records, but
 * consumers receive one deterministic view. Exact rejected Candidates are
 * hidden from active work queues and remain visible under the all-filter so a
 * person can restore them. Once content or reviewed Claim basis changes, the
 * stored rejection no longer matches and the Candidate naturally returns.
 */
export function candidateReviewView(
  candidates: readonly Candidate[],
  ledger: Ledger,
  decisions: CandidateReviewDecisions,
  ledgerPath: string,
  decisionPath: string,
  absoluteSource: string,
  filter: CandidateLedgerFilter = 'all',
  similarity?: CandidateSimilarityEvidenceSource,
): CandidateReviewViewItem[] {
  const ledgerView = candidateLedgerView(
    candidates,
    ledger,
    ledgerPath,
    absoluteSource,
    filter,
    similarity,
  );

  return ledgerView.flatMap((item) => {
    const rejected = item.ledgerState === 'imported'
      ? undefined
      : rejectedDecisionForCandidate(
          decisions,
          decisionPath,
          absoluteSource,
          item.candidate,
        );
    if (rejected && filter !== 'all') return [];
    const reviewState: CandidateReviewViewItem['reviewState'] =
      item.ledgerState === 'imported'
        ? 'accepted'
        : rejected
          ? 'rejected'
          : 'unreviewed';
    return [{ ...item, reviewState, rejected: Boolean(rejected) }];
  });
}
