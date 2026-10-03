import type { Candidate } from '../core/candidate.js';
import type { CandidateReviewViewItem } from '../core/candidateReviewView.js';
import { placeOf } from '../core/importLedger.js';
import {
  matchesCandidateReviewFacets,
  type CandidateReviewFacetFilter,
} from './candidateReviewFilter.js';

export function candidateReviewSessionKey(
  candidate: Candidate,
): string {
  return [
    candidate.kind,
    candidate.locator.source,
    candidate.locator.sheet ?? '',
    placeOf(candidate),
    candidate.fingerprint.representation,
    candidate.fingerprint.digest,
  ].join('\u0000');
}

export function remainingCandidateReviewItems(
  view: readonly CandidateReviewViewItem[],
  facetFilter: CandidateReviewFacetFilter,
  processedKeys: ReadonlySet<string>,
): CandidateReviewViewItem[] {
  return view.filter((item) =>
    !processedKeys.has(candidateReviewSessionKey(item.candidate))
    && matchesCandidateReviewFacets(item.candidate, facetFilter),
  );
}
