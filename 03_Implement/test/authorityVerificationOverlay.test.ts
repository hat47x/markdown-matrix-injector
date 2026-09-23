import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import {
  createCognitiveReviewEnvelope,
  type AuthorityRevalidationCheck,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  createCognitiveReviewPresentation,
  type CognitiveReviewPresentationV1,
} from '../src/experimental/cognitiveReviewPresentation.js';
import {
  AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
  type AuthorityRevalidationCheckResult,
  type AuthorityRevalidationReceiptV1,
} from '../src/experimental/authorityRevalidationReceipt.js';
import {
  AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
  VERIFIED_COGNITIVE_REVIEW_SURFACE_SCHEMA_VERSION,
  createVerifiedCognitiveReviewSurface,
} from '../src/experimental/authorityVerificationOverlay.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  formatProfileToWorksheetPrototype,
} from '../src/experimental/formatProfile.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
} from '../src/experimental/flyWorksheetFormatPerceptionProvider.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const sourceDigest = 'sha256:authority-overlay-source';

function snapshot(): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      { row: 1, column: 0, text: 'ID', fillTone: 'dark' },
      { row: 1, column: 1, text: 'State', fillTone: 'dark' },
      { row: 2, column: 0, text: '1' },
      { row: 2, column: 1, text: 'ready' },
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    }],
  };
}

function artifacts() {
  const prototype = createWorksheetFormatPrototype(
    'release-table',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Authority overlay fixture',
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline-release-table',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );
  const match = matchWorksheetFormatSnapshot(
    snapshot(),
    [
      formatProfileToWorksheetPrototype(
        profile,
        SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      ),
    ],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const observation: CognitiveObservation<{ kind: string }> = {
    id: 'perception',
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    payload: { kind: 'worksheet-format' },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
  };

  const envelope = createCognitiveReviewEnvelope({
    perception: adaptWorksheetFormatMatchToCognitiveOutcome(
      observation,
      match,
    ),
    approvedProfiles: [profile],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  });
  const presentation = createCognitiveReviewPresentation(envelope);

  return { envelope, presentation };
}

function receipt(
  overrides: Partial<Record<
    AuthorityRevalidationCheck,
    AuthorityRevalidationCheckResult['status']
  >> = {},
): AuthorityRevalidationReceiptV1 {
  const { envelope } = artifacts();
  return {
    schemaVersion: AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
    envelopeSchemaVersion: envelope.schemaVersion,
    sourceDigest,
    scope: 'review-evidence',
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.authority.test-harness',
      componentVersion: '1',
      runId: 'run-overlay',
    },
    checks: envelope.authorityRevalidation.map((requirement) => {
      const defaultStatus: AuthorityRevalidationCheckResult['status'] =
        requirement.appliesTo === 'always'
          ? 'passed'
          : 'not-applicable';
      const status = overrides[requirement.check] ?? defaultStatus;
      return {
        check: requirement.check,
        status,
        evidenceCode: status === 'not-applicable'
          ? 'NO_EXECUTABLE_PROPOSAL'
          : `${requirement.check.toUpperCase().replaceAll('-', '_')}_${status.toUpperCase()}`,
        ...(status === 'failed' ? { detail: 'fixture failure' } : {}),
      };
    }),
  };
}

test('composes satisfied Authority verification beside an unchanged cognitive review', () => {
  const { envelope, presentation } = artifacts();
  const envelopeBefore = structuredClone(envelope);
  const presentationBefore = structuredClone(presentation);

  const surface = createVerifiedCognitiveReviewSurface(
    envelope,
    presentation,
    receipt(),
  );

  assert.equal(
    surface.schemaVersion,
    VERIFIED_COGNITIVE_REVIEW_SURFACE_SCHEMA_VERSION,
  );
  assert.equal(surface.audience, 'human-review');
  assert.equal(
    surface.authorityVerification.schemaVersion,
    AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
  );
  assert.equal(
    surface.authorityVerification.role,
    'authority-verification',
  );
  assert.equal(
    surface.authorityVerification.verificationStatus,
    'satisfied',
  );
  assert.equal(surface.review.authority.disposition, 'review-only');
  assert.equal(surface.review.authority.writeAuthority, 'none');
  assert.equal(surface.review.authority.applyStatus, 'not-authorized');
  assert.deepEqual(envelope, envelopeBefore);
  assert.deepEqual(presentation, presentationBefore);
});

test('projects blocked Authority evidence without changing cognitive classification', () => {
  const { envelope, presentation } = artifacts();
  const classification = presentation.perception.classification;

  const surface = createVerifiedCognitiveReviewSurface(
    envelope,
    presentation,
    receipt({ 'profile-compatibility': 'failed' }),
  );

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'blocked',
  );
  assert.deepEqual(
    surface.authorityVerification.failedChecks,
    ['profile-compatibility'],
  );
  assert.equal(
    surface.authorityVerification.checks
      .find((entry) => entry.check === 'profile-compatibility')
      ?.detail,
    'fixture failure',
  );
  assert.equal(surface.review.perception.classification, classification);
});

test('keeps Authority issuer and evidence codes but no cognitive metrics in the overlay', () => {
  const { envelope, presentation } = artifacts();
  const surface = createVerifiedCognitiveReviewSurface(
    envelope,
    presentation,
    receipt(),
  );

  assert.equal(
    surface.authorityVerification.issuer.componentId,
    'mmi.authority.test-harness',
  );
  assert.ok(
    surface.authorityVerification.checks.every(
      (entry) => entry.evidenceCode.trim().length > 0,
    ),
  );

  const serializedOverlay = JSON.stringify(surface.authorityVerification);
  assert.equal(serializedOverlay.includes('confidence'), false);
  assert.equal(serializedOverlay.includes('noveltyScore'), false);
  assert.equal(serializedOverlay.includes('overallScore'), false);
});

test('rejects receipt source mismatch through the receipt binding boundary', () => {
  const { envelope, presentation } = artifacts();
  assert.throws(
    () => createVerifiedCognitiveReviewSurface(
      envelope,
      presentation,
      {
        ...receipt(),
        sourceDigest: 'sha256:other-source',
      },
    ),
    /source digest does not match/,
  );
});

test('rejects a presentation whose source identity was tampered', () => {
  const { envelope, presentation } = artifacts();
  const tampered = {
    ...presentation,
    authority: {
      ...presentation.authority,
      sourceDigest: 'sha256:other-source',
    },
  } as CognitiveReviewPresentationV1;

  assert.throws(
    () => createVerifiedCognitiveReviewSurface(
      envelope,
      tampered,
      receipt(),
    ),
    /Presentation source digest does not match/,
  );
});

test('rejects a presentation that pretends Authority requirements are completed', () => {
  const { envelope, presentation } = artifacts();
  const tampered = {
    ...presentation,
    authority: {
      ...presentation.authority,
      revalidation: presentation.authority.revalidation.map(
        (requirement, index) => index === 0
          ? { ...requirement, state: 'completed' as never }
          : requirement,
      ),
    },
  } as CognitiveReviewPresentationV1;

  assert.throws(
    () => createVerifiedCognitiveReviewSurface(
      envelope,
      tampered,
      receipt(),
    ),
    /Authority requirement mismatch/,
  );
});

test('surface serialization adds no write/apply authority or raw worksheet payload', () => {
  const { envelope, presentation } = artifacts();
  const surface = createVerifiedCognitiveReviewSurface(
    envelope,
    presentation,
    receipt(),
  );
  const serialized = JSON.stringify(surface);

  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('combinedScore'), false);
  assert.equal(serialized.includes('"apply":'), false);
  assert.equal(serialized.includes('writeAuthority":"none"'), true);
});

test('Authority satisfaction does not create a Cognitive approval field', () => {
  const { envelope, presentation } = artifacts();
  const surface = createVerifiedCognitiveReviewSurface(
    envelope,
    presentation,
    receipt(),
  );
  const serializedReview = JSON.stringify(surface.review);

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'satisfied',
  );
  assert.equal(serializedReview.includes('approved'), false);
  assert.equal(serializedReview.includes('accepted'), false);
  assert.equal(serializedReview.includes('auto-apply'), false);
});
