import {
  bindAuthorityRevalidationReceipt,
  type AuthorityRevalidationCheckResult,
  type AuthorityRevalidationIssuer,
  type AuthorityRevalidationReceiptV1,
  type AuthorityRevalidationScope,
} from './authorityRevalidationReceipt.js';
import type {
  AuthorityRevalidationCheck,
  CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';
import {
  COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION,
  type CognitiveReviewPresentationV1,
} from './cognitiveReviewPresentation.js';

export const AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION =
  'mmi-authority-verification-overlay-v1' as const;

export const VERIFIED_COGNITIVE_REVIEW_SURFACE_SCHEMA_VERSION =
  'mmi-verified-cognitive-review-surface-v1' as const;

export interface AuthorityVerificationOverlayCheck {
  check: AuthorityRevalidationCheck;
  status: AuthorityRevalidationCheckResult['status'];
  evidenceCode: string;
  detail?: string;
}

export interface AuthorityVerificationOverlayV1 {
  schemaVersion: typeof AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION;
  role: 'authority-verification';
  verificationStatus: 'satisfied' | 'blocked';
  sourceDigest: string;
  scope: AuthorityRevalidationScope;
  issuer: AuthorityRevalidationIssuer;
  checks: readonly AuthorityVerificationOverlayCheck[];
  failedChecks: readonly AuthorityRevalidationCheck[];
}

export interface VerifiedCognitiveReviewSurfaceV1<
  TChoice extends string = string,
> {
  schemaVersion: typeof VERIFIED_COGNITIVE_REVIEW_SURFACE_SCHEMA_VERSION;
  audience: 'human-review';
  review: CognitiveReviewPresentationV1<TChoice>;
  authorityVerification: AuthorityVerificationOverlayV1;
}

export function createVerifiedCognitiveReviewSurface<
  TChoice extends string,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  presentation: CognitiveReviewPresentationV1<TChoice>,
  receipt: AuthorityRevalidationReceiptV1,
): VerifiedCognitiveReviewSurfaceV1<TChoice> {
  assertPresentationBoundary(envelope, presentation);

  const binding = bindAuthorityRevalidationReceipt(envelope, receipt);
  if (binding.sourceDigest !== presentation.authority.sourceDigest) {
    throw new Error(
      'Authority verification binding source digest does not match review presentation.',
    );
  }

  return {
    schemaVersion: VERIFIED_COGNITIVE_REVIEW_SURFACE_SCHEMA_VERSION,
    audience: 'human-review',
    review: presentation,
    authorityVerification: {
      schemaVersion: AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
      role: 'authority-verification',
      verificationStatus: binding.status,
      sourceDigest: binding.sourceDigest,
      scope: binding.scope,
      issuer: { ...binding.issuer },
      checks: binding.checks.map((result) => ({
        check: result.check,
        status: result.status,
        evidenceCode: result.evidenceCode,
        ...(result.detail === undefined ? {} : { detail: result.detail }),
      })),
      failedChecks: [...binding.failedChecks],
    },
  };
}

function assertPresentationBoundary<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  presentation: CognitiveReviewPresentationV1<TChoice>,
): void {
  if (
    presentation.schemaVersion !==
    COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported Cognitive Review Presentation schema: ${String(presentation.schemaVersion)}.`,
    );
  }
  if (presentation.audience !== 'human-review') {
    throw new Error(
      'Authority verification overlay requires human-review presentation.',
    );
  }
  if (
    presentation.authority.disposition !== 'review-only'
    || presentation.authority.writeAuthority !== 'none'
    || presentation.authority.applyStatus !== 'not-authorized'
  ) {
    throw new Error(
      'Authority verification overlay requires an unchanged review-only/no-write presentation boundary.',
    );
  }

  const digest = envelope.sourceDigest;
  if (
    digest.trim().length === 0
    || presentation.authority.sourceDigest !== digest
    || presentation.provenance.sourceDigest !== digest
  ) {
    throw new Error(
      'Cognitive Review Presentation source digest does not match the Envelope.',
    );
  }

  if (
    presentation.authority.revalidation.length !==
    envelope.authorityRevalidation.length
  ) {
    throw new Error(
      'Cognitive Review Presentation Authority requirement count does not match the Envelope.',
    );
  }

  presentation.authority.revalidation.forEach((requirement, index) => {
    const expected = envelope.authorityRevalidation[index];
    if (
      expected === undefined
      || requirement.check !== expected.check
      || requirement.appliesTo !== expected.appliesTo
      || requirement.state !== 'pending'
      || expected.state !== 'pending'
    ) {
      throw new Error(
        `Cognitive Review Presentation Authority requirement mismatch at index ${index}.`,
      );
    }
  });
}
