import type {
  AuthorityRevalidationRequirement,
  CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';
import type {
  CognitiveReviewJudgmentPresentation,
  CognitiveReviewPerceptionPresentation,
  CognitiveReviewProvenancePresentation,
} from './cognitiveReviewPresentation.js';
import type {
  AuthorityVerificationOverlayV1,
} from './authorityVerificationOverlay.js';
import {
  createDeterministicReviewEvidenceSurface,
  DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION,
  type DeterministicReviewEvidenceSurfaceV1,
  type DeterministicReviewEvidenceV1,
} from './deterministicReviewEvidence.js';
import {
  EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION,
  type ExecutableProposalVerifiedReviewSurfaceV1,
} from './executableProposalVerifiedReviewSurface.js';

export const UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION =
  'mmi-unified-human-review-view-model-v1' as const;

export interface UnifiedProposalIdentitySectionV1 {
  role: 'proposal-identity';
  sourceDigest: string;
  algorithm: 'sha256';
  representation: 'mmi-notation-trimmed-utf8-v1';
  digest: string;
}

export interface UnifiedAuthoritySectionV1 {
  role: 'authority';
  boundary: {
    disposition: 'review-only';
    writeAuthority: 'none';
    applyStatus: 'not-authorized';
    revalidation: readonly AuthorityRevalidationRequirement[];
  };
  verification: AuthorityVerificationOverlayV1;
}

export interface UnifiedCognitiveSectionV1<
  TChoice extends string = string,
> {
  role: 'cognitive';
  perception: CognitiveReviewPerceptionPresentation;
  judgment: CognitiveReviewJudgmentPresentation<TChoice>;
  provenance: CognitiveReviewProvenancePresentation;
}

export interface UnifiedDeterministicSectionV1 {
  role: 'deterministic';
  evidence: DeterministicReviewEvidenceV1;
}

export interface UnifiedHumanReviewViewModelV1<
  TChoice extends string = string,
> {
  schemaVersion: typeof UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION;
  audience: 'human-review';
  proposalIdentity: UnifiedProposalIdentitySectionV1;
  authority: UnifiedAuthoritySectionV1;
  cognitive: UnifiedCognitiveSectionV1<TChoice>;
  deterministic: UnifiedDeterministicSectionV1;
}

export type ExecutableDeterministicReviewSurfaceV1<
  TChoice extends string = string,
> = DeterministicReviewEvidenceSurfaceV1<
  TChoice,
  ExecutableProposalVerifiedReviewSurfaceV1<TChoice>
>;

export function createUnifiedHumanReviewViewModel<
  TChoice extends string,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  input: ExecutableDeterministicReviewSurfaceV1<TChoice>,
): UnifiedHumanReviewViewModelV1<TChoice> {
  if (
    input.schemaVersion !==
    DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported deterministic review surface schema: ${String(input.schemaVersion)}.`,
    );
  }

  const rebound = createDeterministicReviewEvidenceSurface(
    envelope,
    input.surface,
    input.deterministicReviewEvidence,
  );

  const surface = rebound.surface;
  assertExecutableSurface(envelope, surface);

  return {
    schemaVersion: UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
    audience: 'human-review',
    proposalIdentity: {
      role: 'proposal-identity',
      sourceDigest: surface.proposal.sourceDigest,
      algorithm: surface.proposal.algorithm,
      representation: surface.proposal.representation,
      digest: surface.proposal.digest,
    },
    authority: {
      role: 'authority',
      boundary: {
        disposition: surface.review.authority.disposition,
        writeAuthority: surface.review.authority.writeAuthority,
        applyStatus: surface.review.authority.applyStatus,
        revalidation: surface.review.authority.revalidation.map(
          (requirement) => ({ ...requirement }),
        ),
      },
      verification: cloneAuthorityVerification(
        surface.authorityVerification,
      ),
    },
    cognitive: {
      role: 'cognitive',
      perception: structuredClone(surface.review.perception),
      judgment: structuredClone(surface.review.judgment),
      provenance: structuredClone(surface.review.provenance),
    },
    deterministic: {
      role: 'deterministic',
      evidence: structuredClone(rebound.deterministicReviewEvidence),
    },
  };
}

function assertExecutableSurface<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  surface: ExecutableProposalVerifiedReviewSurfaceV1<TChoice>,
): void {
  if (
    surface.schemaVersion !==
    EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported executable proposal review surface schema: ${String(surface.schemaVersion)}.`,
    );
  }
  if (
    surface.audience !== 'human-review'
    || surface.proposal.role !== 'executable-proposal-identity'
  ) {
    throw new Error('Invalid executable proposal review surface role.');
  }
  if (
    surface.proposal.algorithm !== 'sha256'
    || surface.proposal.representation !==
      'mmi-notation-trimmed-utf8-v1'
    || !/^sha256:[0-9a-f]{64}$/u.test(surface.proposal.digest)
  ) {
    throw new Error('Invalid executable proposal identity.');
  }

  const sourceDigest = envelope.sourceDigest;
  if (
    surface.proposal.sourceDigest !== sourceDigest
    || surface.review.authority.sourceDigest !== sourceDigest
    || surface.review.provenance.sourceDigest !== sourceDigest
    || surface.authorityVerification.sourceDigest !== sourceDigest
  ) {
    throw new Error(
      'Unified human review source identity does not match the Envelope.',
    );
  }

  if (
    surface.review.authority.disposition !== 'review-only'
    || surface.review.authority.writeAuthority !== 'none'
    || surface.review.authority.applyStatus !== 'not-authorized'
  ) {
    throw new Error(
      'Unified human review requires an unchanged review-only/no-write boundary.',
    );
  }
}

function cloneAuthorityVerification(
  overlay: AuthorityVerificationOverlayV1,
): AuthorityVerificationOverlayV1 {
  return {
    ...overlay,
    issuer: { ...overlay.issuer },
    checks: overlay.checks.map((check) => ({
      ...check,
      ...(check.detail === undefined ? {} : { detail: check.detail }),
    })),
    failedChecks: [...overlay.failedChecks],
  };
}
