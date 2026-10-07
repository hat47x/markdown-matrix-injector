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
  const parts = [
    candidate.kind,
    candidate.locator.source,
    candidate.locator.sheet ?? '',
    placeOf(candidate),
    candidate.fingerprint.representation,
    candidate.fingerprint.digest,
  ];
  if (
    candidate.execution === 'provider-dependent'
    && candidate.provenance.run.execution === 'provider-dependent'
  ) {
    parts.push(
      candidate.provenance.run.provider,
      candidate.provenance.run.model,
      candidate.provenance.run.artifactVersion,
    );
  }
  return parts.join('\u0000');
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
