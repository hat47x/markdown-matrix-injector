import {
  UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  type UnifiedHumanReviewViewModelV1,
} from './unifiedHumanReviewViewModel.js';

export const UNIFIED_HUMAN_REVIEW_PRESENTATION_POLICY_SCHEMA_VERSION =
  'mmi-unified-human-review-presentation-policy-v1' as const;

export type UnifiedHumanReviewPresentationSectionId =
  | 'proposal-identity'
  | 'authority'
  | 'perception'
  | 'judgment'
  | 'deterministic'
  | 'provenance';

export type UnifiedHumanReviewPresentationDisclosure =
  | 'expanded'
  | 'collapsed';

export type UnifiedHumanReviewPresentationEmphasis =
  | 'standard'
  | 'attention'
  | 'reference';

export type UnifiedHumanReviewPresentationAttentionReason =
  | 'authority-blocked'
  | 'perception-ambiguous'
  | 'perception-novel'
  | 'judgment-non-decision'
  | 'deterministic-review-relevant';

export interface UnifiedHumanReviewPresentationSectionPlanV1 {
  id: UnifiedHumanReviewPresentationSectionId;
  order: number;
  source:
    | 'proposalIdentity'
    | 'authority'
    | 'cognitive.perception'
    | 'cognitive.judgment'
    | 'deterministic.evidence'
    | 'cognitive.provenance';
  defaultDisclosure: UnifiedHumanReviewPresentationDisclosure;
  emphasis: UnifiedHumanReviewPresentationEmphasis;
  attentionReasons: readonly UnifiedHumanReviewPresentationAttentionReason[];
  alwaysReachable: true;
}

export interface UnifiedHumanReviewPresentationPolicyV1 {
  schemaVersion:
    typeof UNIFIED_HUMAN_REVIEW_PRESENTATION_POLICY_SCHEMA_VERSION;
  audience: 'human-review';
  ordering: 'fixed';
  sections: readonly UnifiedHumanReviewPresentationSectionPlanV1[];
  invariants: {
    dynamicReordering: false;
    allSectionsReachable: true;
    overallVerdict: 'none';
    combinedScore: 'none';
    automaticDecision: 'none';
    applyAuthority: 'none';
  };
}

/**
 * Produces display-order and progressive-disclosure guidance without copying
 * review payloads or introducing a cross-domain verdict.
 */
export function createUnifiedHumanReviewPresentationPolicy<
  TChoice extends string,
>(
  model: UnifiedHumanReviewViewModelV1<TChoice>,
): UnifiedHumanReviewPresentationPolicyV1 {
  assertModelBoundary(model);

  const authorityAttention =
    model.authority.verification.verificationStatus === 'blocked'
      ? ['authority-blocked'] as const
      : [];

  const perceptionAttention =
    model.cognitive.perception.classification === 'ambiguous'
      ? ['perception-ambiguous'] as const
      : model.cognitive.perception.classification === 'novel'
        ? ['perception-novel'] as const
        : [];

  const judgmentAttention =
    model.cognitive.judgment.state === 'non-decision'
      ? ['judgment-non-decision'] as const
      : [];

  const deterministicAttention =
    model.deterministic.evidence.reviewRelevantReasonCount > 0
      ? ['deterministic-review-relevant'] as const
      : [];

  return {
    schemaVersion:
      UNIFIED_HUMAN_REVIEW_PRESENTATION_POLICY_SCHEMA_VERSION,
    audience: 'human-review',
    ordering: 'fixed',
    sections: [
      section(
        'proposal-identity',
        1,
        'proposalIdentity',
        'expanded',
        'standard',
        [],
      ),
      section(
        'authority',
        2,
        'authority',
        'expanded',
        authorityAttention.length > 0 ? 'attention' : 'standard',
        authorityAttention,
      ),
      section(
        'perception',
        3,
        'cognitive.perception',
        'expanded',
        perceptionAttention.length > 0 ? 'attention' : 'standard',
        perceptionAttention,
      ),
      section(
        'judgment',
        4,
        'cognitive.judgment',
        model.cognitive.judgment.state === 'not-requested'
          ? 'collapsed'
          : 'expanded',
        judgmentAttention.length > 0
          ? 'attention'
          : model.cognitive.judgment.state === 'not-requested'
            ? 'reference'
            : 'standard',
        judgmentAttention,
      ),
      section(
        'deterministic',
        5,
        'deterministic.evidence',
        deterministicAttention.length > 0
          ? 'expanded'
          : 'collapsed',
        deterministicAttention.length > 0
          ? 'attention'
          : 'reference',
        deterministicAttention,
      ),
      section(
        'provenance',
        6,
        'cognitive.provenance',
        'collapsed',
        'reference',
        [],
      ),
    ],
    invariants: {
      dynamicReordering: false,
      allSectionsReachable: true,
      overallVerdict: 'none',
      combinedScore: 'none',
      automaticDecision: 'none',
      applyAuthority: 'none',
    },
  };
}

function section(
  id: UnifiedHumanReviewPresentationSectionId,
  order: number,
  source: UnifiedHumanReviewPresentationSectionPlanV1['source'],
  defaultDisclosure: UnifiedHumanReviewPresentationDisclosure,
  emphasis: UnifiedHumanReviewPresentationEmphasis,
  attentionReasons:
    readonly UnifiedHumanReviewPresentationAttentionReason[],
): UnifiedHumanReviewPresentationSectionPlanV1 {
  return {
    id,
    order,
    source,
    defaultDisclosure,
    emphasis,
    attentionReasons: [...attentionReasons],
    alwaysReachable: true,
  };
}

function assertModelBoundary<TChoice extends string>(
  model: UnifiedHumanReviewViewModelV1<TChoice>,
): void {
  if (
    model.schemaVersion !==
    UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported Unified Human Review View Model schema: ${String(model.schemaVersion)}.`,
    );
  }
  if (model.audience !== 'human-review') {
    throw new Error(
      'Unified human-review presentation policy requires a human-review model.',
    );
  }
  if (
    model.authority.boundary.disposition !== 'review-only'
    || model.authority.boundary.writeAuthority !== 'none'
    || model.authority.boundary.applyStatus !== 'not-authorized'
  ) {
    throw new Error(
      'Unified human-review presentation policy requires the unchanged review-only/no-write boundary.',
    );
  }
  if (model.deterministic.evidence.reviewRelevantReasonCount < 0) {
    throw new Error(
      'Unified human-review presentation policy requires a non-negative review-relevant reason count.',
    );
  }
}
