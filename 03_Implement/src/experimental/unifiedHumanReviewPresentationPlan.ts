import {
  UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  type UnifiedHumanReviewViewModelV1,
} from './unifiedHumanReviewViewModel.js';

export const UNIFIED_HUMAN_REVIEW_PRESENTATION_PLAN_SCHEMA_VERSION =
  'mmi-unified-human-review-presentation-plan-v1' as const;

export type UnifiedHumanReviewSectionId =
  | 'authority'
  | 'cognitive'
  | 'deterministic'
  | 'proposal-identity';

export type UnifiedHumanReviewDefaultDisclosure =
  | 'expanded'
  | 'collapsed';

export interface UnifiedHumanReviewAuthoritySummaryV1 {
  verificationStatus: 'satisfied' | 'blocked';
  failedCheckCount: number;
  writeAuthority: 'none';
  applyStatus: 'not-authorized';
}

export interface UnifiedHumanReviewCognitiveSummaryV1 {
  classification: 'matched' | 'ambiguous' | 'novel';
  candidateCount: number;
  hasWinner: boolean;
  judgmentState: 'not-requested' | 'proposal' | 'non-decision';
  judgmentStatus?: 'abstained' | 'unsupported' | 'unavailable';
}

export interface UnifiedHumanReviewDeterministicSummaryV1 {
  reviewRelevantReasonCount: number;
  diagnosticReasonCount: number;
}

export interface UnifiedHumanReviewProposalIdentitySummaryV1 {
  algorithm: 'sha256';
  representation: 'mmi-notation-trimmed-utf8-v1';
}

export interface UnifiedHumanReviewAuthoritySectionPlanV1 {
  id: 'authority';
  order: 1;
  defaultDisclosure: UnifiedHumanReviewDefaultDisclosure;
  summary: UnifiedHumanReviewAuthoritySummaryV1;
}

export interface UnifiedHumanReviewCognitiveSectionPlanV1 {
  id: 'cognitive';
  order: 2;
  defaultDisclosure: UnifiedHumanReviewDefaultDisclosure;
  summary: UnifiedHumanReviewCognitiveSummaryV1;
}

export interface UnifiedHumanReviewDeterministicSectionPlanV1 {
  id: 'deterministic';
  order: 3;
  defaultDisclosure: UnifiedHumanReviewDefaultDisclosure;
  summary: UnifiedHumanReviewDeterministicSummaryV1;
}

export interface UnifiedHumanReviewProposalIdentitySectionPlanV1 {
  id: 'proposal-identity';
  order: 4;
  defaultDisclosure: 'collapsed';
  summary: UnifiedHumanReviewProposalIdentitySummaryV1;
}

export type UnifiedHumanReviewSectionPlanV1 =
  | UnifiedHumanReviewAuthoritySectionPlanV1
  | UnifiedHumanReviewCognitiveSectionPlanV1
  | UnifiedHumanReviewDeterministicSectionPlanV1
  | UnifiedHumanReviewProposalIdentitySectionPlanV1;

export interface UnifiedHumanReviewPresentationPlanV1 {
  schemaVersion:
    typeof UNIFIED_HUMAN_REVIEW_PRESENTATION_PLAN_SCHEMA_VERSION;
  audience: 'human-review';
  sourceViewModelSchemaVersion:
    typeof UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION;
  sectionOrder: readonly [
    'authority',
    'cognitive',
    'deterministic',
    'proposal-identity',
  ];
  sections: readonly [
    UnifiedHumanReviewAuthoritySectionPlanV1,
    UnifiedHumanReviewCognitiveSectionPlanV1,
    UnifiedHumanReviewDeterministicSectionPlanV1,
    UnifiedHumanReviewProposalIdentitySectionPlanV1,
  ];
}

/**
 * Produces UI-neutral ordering and default disclosure metadata.
 *
 * This function does not alter the underlying review model and deliberately
 * avoids an overall status, score, recommendation, approval or apply action.
 */
export function createUnifiedHumanReviewPresentationPlan<
  TChoice extends string,
>(
  model: UnifiedHumanReviewViewModelV1<TChoice>,
): UnifiedHumanReviewPresentationPlanV1 {
  assertUnifiedHumanReviewModel(model);

  const authorityDisclosure: UnifiedHumanReviewDefaultDisclosure =
    model.authority.verification.verificationStatus === 'blocked'
      ? 'expanded'
      : 'collapsed';

  const judgment = model.cognitive.judgment;
  const cognitiveDisclosure: UnifiedHumanReviewDefaultDisclosure =
    model.cognitive.perception.classification !== 'matched'
      || judgment.state !== 'not-requested'
      ? 'expanded'
      : 'collapsed';

  const deterministicDisclosure: UnifiedHumanReviewDefaultDisclosure =
    model.deterministic.evidence.reviewRelevantReasonCount > 0
      ? 'expanded'
      : 'collapsed';

  return {
    schemaVersion: UNIFIED_HUMAN_REVIEW_PRESENTATION_PLAN_SCHEMA_VERSION,
    audience: 'human-review',
    sourceViewModelSchemaVersion:
      UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
    sectionOrder: [
      'authority',
      'cognitive',
      'deterministic',
      'proposal-identity',
    ],
    sections: [
      {
        id: 'authority',
        order: 1,
        defaultDisclosure: authorityDisclosure,
        summary: {
          verificationStatus:
            model.authority.verification.verificationStatus,
          failedCheckCount:
            model.authority.verification.failedChecks.length,
          writeAuthority: model.authority.boundary.writeAuthority,
          applyStatus: model.authority.boundary.applyStatus,
        },
      },
      {
        id: 'cognitive',
        order: 2,
        defaultDisclosure: cognitiveDisclosure,
        summary: {
          classification:
            model.cognitive.perception.classification,
          candidateCount:
            model.cognitive.perception.candidates.length,
          hasWinner:
            model.cognitive.perception.winnerPrototypeId !== undefined,
          judgmentState: judgment.state,
          ...(judgment.state === 'non-decision'
            ? { judgmentStatus: judgment.status }
            : {}),
        },
      },
      {
        id: 'deterministic',
        order: 3,
        defaultDisclosure: deterministicDisclosure,
        summary: {
          reviewRelevantReasonCount:
            model.deterministic.evidence.reviewRelevantReasonCount,
          diagnosticReasonCount:
            model.deterministic.evidence.diagnosticReasonCount,
        },
      },
      {
        id: 'proposal-identity',
        order: 4,
        defaultDisclosure: 'collapsed',
        summary: {
          algorithm: model.proposalIdentity.algorithm,
          representation: model.proposalIdentity.representation,
        },
      },
    ],
  };
}

function assertUnifiedHumanReviewModel<TChoice extends string>(
  model: UnifiedHumanReviewViewModelV1<TChoice>,
): void {
  if (
    model.schemaVersion !==
      UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION
    || model.audience !== 'human-review'
  ) {
    throw new Error(
      'Unified human review presentation plan requires the v1 human-review view model.',
    );
  }

  if (
    model.proposalIdentity.role !== 'proposal-identity'
    || model.authority.role !== 'authority'
    || model.cognitive.role !== 'cognitive'
    || model.deterministic.role !== 'deterministic'
  ) {
    throw new Error(
      'Unified human review presentation plan requires all four trust domains.',
    );
  }

  if (
    model.authority.boundary.disposition !== 'review-only'
    || model.authority.boundary.writeAuthority !== 'none'
    || model.authority.boundary.applyStatus !== 'not-authorized'
  ) {
    throw new Error(
      'Unified human review presentation plan requires the review-only/no-write boundary.',
    );
  }

  const deterministic = model.deterministic.evidence;
  if (
    !Number.isInteger(deterministic.reviewRelevantReasonCount)
    || deterministic.reviewRelevantReasonCount < 0
    || !Number.isInteger(deterministic.diagnosticReasonCount)
    || deterministic.diagnosticReasonCount < 0
    || deterministic.reviewRelevantReasonCount
      + deterministic.diagnosticReasonCount
      !== deterministic.reasons.length
  ) {
    throw new Error(
      'Unified human review deterministic reason counts are inconsistent.',
    );
  }
}
