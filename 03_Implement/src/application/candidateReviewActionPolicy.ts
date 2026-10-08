import type {
  CandidateReviewInventoryItem,
} from './candidateReviewInventory.js';

export type CandidateReviewExtractionMode =
  | 'deterministic-extract'
  | 'review-only';

export interface CandidateReviewActionPolicy {
  extraction: CandidateReviewExtractionMode;
  reason?: string;
}

/**
 * Decide whether the current review item can use the existing deterministic
 * extraction paths.
 *
 * Provider-dependent Candidates are proposals. The current extractors
 * rediscover deterministic source Candidates and compare their review basis;
 * there is no authority-binding contract yet that proves a provider proposal
 * is the same extractable source entity. Until such a binding exists, showing
 * "extract" would be a false affordance and would either fail stale or risk
 * conflating provider inference with source authority.
 */
export function candidateReviewActionPolicy(
  item: CandidateReviewInventoryItem,
): CandidateReviewActionPolicy {
  if (item.kind === 'choice-list') {
    return {
      extraction: 'review-only',
      reason:
        '選択肢CandidateはまだExtracted資産へ変換しません。',
    };
  }
  if (item.kind === 'shape') {
    return {
      extraction: 'review-only',
      reason:
        'Shape Candidate自体はまだExtracted資産へ変換しません。',
    };
  }
  if (item.candidate.execution === 'provider-dependent') {
    return {
      extraction: 'review-only',
      reason:
        'provider依存Candidateは、原本のdeterministic Candidateへ同一性を再検証する契約が未接続のため、現時点では確認・却下・保留のみ利用できます。',
    };
  }
  return { extraction: 'deterministic-extract' };
}
