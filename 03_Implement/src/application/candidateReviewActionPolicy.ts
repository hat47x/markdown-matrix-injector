import { formatMessage } from '../core/messages/index.js';
import type {
  CandidateReviewInventoryItem,
} from './candidateReviewInventory.js';

export type CandidateReviewExtractionMode =
  | 'deterministic-extract'
  | 'review-only';

export interface CandidateReviewActionPolicy {
  extraction: CandidateReviewExtractionMode;
  /** Why the item is review-only, in the language the caller asked for (default English). */
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
  language?: string,
): CandidateReviewActionPolicy {
  if (item.candidate.execution === 'provider-dependent') {
    return {
      extraction: 'review-only',
      reason: formatMessage('reviewOnlyProvider', {}, language),
    };
  }
  switch (item.kind) {
    case 'table':
    case 'image':
    case 'tree':
      return { extraction: 'deterministic-extract' };
    case 'choice-list':
      return {
        extraction: 'review-only',
        reason: formatMessage('reviewOnlyChoiceList', {}, language),
      };
    case 'shape':
      return {
        extraction: 'review-only',
        reason: formatMessage('reviewOnlyShape', {}, language),
      };
    case 'note':
      return {
        extraction: 'review-only',
        reason: formatMessage('reviewOnlyNote', {}, language),
      };
  }
}
