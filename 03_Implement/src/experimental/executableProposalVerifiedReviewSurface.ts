import type {
  AuthorityVerificationOverlayV1,
  VerifiedCognitiveReviewSurfaceV1,
} from './authorityVerificationOverlay.js';
import {
  createVerifiedCognitiveReviewSurface,
} from './authorityVerificationOverlay.js';
import type {
  CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';
import type {
  CognitiveReviewPresentationV1,
} from './cognitiveReviewPresentation.js';
import {
  bindExecutableProposalAuthorityEvidence,
  type ExecutableProposalAuthorityEvidenceV1,
  type ExecutableProposalIdentityV1,
} from './executableProposalAuthorityEvidence.js';

export const EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION =
  'mmi-executable-proposal-verified-review-surface-v1' as const;

export interface ExecutableProposalIdentityPresentationV1
  extends ExecutableProposalIdentityV1 {
  role: 'executable-proposal-identity';
  sourceDigest: string;
}

export interface ExecutableProposalVerifiedReviewSurfaceV1<
  TChoice extends string = string,
> {
  schemaVersion:
    typeof EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION;
  audience: 'human-review';
  proposal: ExecutableProposalIdentityPresentationV1;
  review: CognitiveReviewPresentationV1<TChoice>;
  authorityVerification: AuthorityVerificationOverlayV1;
}

export function createExecutableProposalVerifiedReviewSurface<
  TChoice extends string,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  presentation: CognitiveReviewPresentationV1<TChoice>,
  rawNotation: string,
  evidence: ExecutableProposalAuthorityEvidenceV1,
): ExecutableProposalVerifiedReviewSurfaceV1<TChoice> {
  const proposalBinding = bindExecutableProposalAuthorityEvidence(
    envelope,
    rawNotation,
    evidence,
  );

  const verified: VerifiedCognitiveReviewSurfaceV1<TChoice> =
    createVerifiedCognitiveReviewSurface(
      envelope,
      presentation,
      evidence.receipt,
    );

  assertCompositionConsistency(proposalBinding, verified);

  return {
    schemaVersion:
      EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION,
    audience: 'human-review',
    proposal: {
      role: 'executable-proposal-identity',
      sourceDigest: proposalBinding.sourceDigest,
      ...proposalBinding.proposal,
    },
    review: verified.review,
    authorityVerification: verified.authorityVerification,
  };
}

function assertCompositionConsistency(
  proposalBinding: ReturnType<
    typeof bindExecutableProposalAuthorityEvidence
  >,
  verified: VerifiedCognitiveReviewSurfaceV1,
): void {
  if (
    proposalBinding.sourceDigest !==
      verified.authorityVerification.sourceDigest
    || proposalBinding.sourceDigest !== verified.review.authority.sourceDigest
    || proposalBinding.sourceDigest !== verified.review.provenance.sourceDigest
  ) {
    throw new Error(
      'Executable proposal verified review surface source digest mismatch.',
    );
  }

  if (
    proposalBinding.authorityStatus !==
    verified.authorityVerification.verificationStatus
  ) {
    throw new Error(
      'Executable proposal Authority status does not match the verification overlay.',
    );
  }
}
