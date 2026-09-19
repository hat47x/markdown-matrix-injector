import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type CognitiveReviewEnvelope,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION,
  type CognitiveReviewPresentationV1,
} from '../src/experimental/cognitiveReviewPresentation.js';
import {
  AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
  type AuthorityVerificationOverlayV1,
} from '../src/experimental/authorityVerificationOverlay.js';
import {
  DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
  DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION,
  type DeterministicReviewEvidenceV1,
} from '../src/experimental/deterministicReviewEvidence.js';
import {
  EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION,
  type ExecutableProposalVerifiedReviewSurfaceV1,
} from '../src/experimental/executableProposalVerifiedReviewSurface.js';
import {
  UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  createUnifiedHumanReviewViewModel,
  type ExecutableDeterministicReviewSurfaceV1,
} from '../src/experimental/unifiedHumanReviewViewModel.js';
import {
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const SOURCE = 'sha256:' + 'a'.repeat(64);
const PROPOSAL = 'sha256:' + 'b'.repeat(64);

function envelope(): CognitiveReviewEnvelope {
  return {
    schemaVersion: 'mmi-cognitive-review-envelope-v1',
    disposition: 'review-only',
    writeAuthority: 'none',
    sourceDigest: SOURCE,
    perception: {
      status: 'signal',
      provider: {
        id: 'mmi.fly-worksheet-format',
        version: 'worksheet-format-v6',
        category: 'perception',
        executionBoundary: 'local',
        capabilities: ['format-novelty'],
      },
      observation: {
        id: 'obs',
        kind: 'worksheet-format',
        schemaVersion: 'worksheet-format-observation-v1',
        sourceDigest: SOURCE,
      },
      signal: {
        kind: 'format-novelty',
        payload: {
          classification: 'novel',
          candidates: [],
          noveltyScore: 1,
          featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
          sourceProfileId: 'test-profile',
          sourceEvidence: ['structure'],
        },
        scores: [],
        evidence: [{ code: 'FORMAT_NOVEL' }],
      },
    },
    profiles: [],
    authorityRevalidation: [
      {
        check: 'source-identity',
        appliesTo: 'always',
        state: 'pending',
      },
      {
        check: 'profile-compatibility',
        appliesTo: 'always',
        state: 'pending',
      },
    ],
  };
}

function reviewPresentation(): CognitiveReviewPresentationV1 {
  return {
    schemaVersion: COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION,
    audience: 'human-review',
    authority: {
      role: 'authority-boundary',
      disposition: 'review-only',
      writeAuthority: 'none',
      applyStatus: 'not-authorized',
      sourceDigest: SOURCE,
      revalidation: envelope().authorityRevalidation,
    },
    perception: {
      role: 'cognitive-perception',
      provider: {
        id: 'mmi.fly-worksheet-format',
        version: 'worksheet-format-v6',
        category: 'perception',
        executionBoundary: 'local',
      },
      signalKind: 'format-novelty',
      classification: 'novel',
      noveltyScore: 1,
      candidates: [],
      metrics: [],
    },
    judgment: {
      role: 'cognitive-judgment',
      state: 'not-requested',
    },
    provenance: {
      role: 'provenance',
      sourceDigest: SOURCE,
      providers: [{
        id: 'mmi.fly-worksheet-format',
        version: 'worksheet-format-v6',
        category: 'perception',
        executionBoundary: 'local',
      }],
      profiles: [],
    },
  };
}

function authority(
  status: 'satisfied' | 'blocked' = 'satisfied',
): AuthorityVerificationOverlayV1 {
  return {
    schemaVersion: AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
    role: 'authority-verification',
    verificationStatus: status,
    sourceDigest: SOURCE,
    scope: 'review-evidence',
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.authority.test',
      componentVersion: '1',
      runId: 'run-unified-view',
    },
    checks: [
      {
        check: 'source-identity',
        status: status === 'blocked' ? 'failed' : 'passed',
        evidenceCode:
          status === 'blocked'
            ? 'SOURCE_IDENTITY_FAILED'
            : 'SOURCE_IDENTITY_PASSED',
      },
      {
        check: 'profile-compatibility',
        status: 'passed',
        evidenceCode: 'PROFILE_COMPATIBILITY_PASSED',
      },
    ],
    failedChecks:
      status === 'blocked' ? ['source-identity'] : [],
  };
}

function deterministicEvidence(): DeterministicReviewEvidenceV1 {
  return {
    schemaVersion: DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
    role: 'deterministic-review-evidence',
    sourceDigest: SOURCE,
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: 'test-profile',
    sourceEvidence: ['structure'],
    producer: {
      kind: 'deterministic-analysis',
      componentId: 'mmi.experimental.worksheet-format-fill-review',
      componentVersion: '1',
      executionBoundary: 'local',
    },
    reasons: [],
    reviewRelevantReasonCount: 0,
    diagnosticReasonCount: 0,
    comparison: {
      kind: 'worksheet-format-fill-vs-structure-only',
      primary: {
        sourceProfileId: 'test-profile',
        status: 'novel',
        noveltyScore: 1,
      },
      control: {
        sourceProfileId: 'structure-only-test',
        status: 'novel',
        noveltyScore: 1,
      },
    },
  };
}

function input(
  status: 'satisfied' | 'blocked' = 'satisfied',
): ExecutableDeterministicReviewSurfaceV1 {
  const proposalSurface: ExecutableProposalVerifiedReviewSurfaceV1 = {
    schemaVersion:
      EXECUTABLE_PROPOSAL_VERIFIED_REVIEW_SURFACE_SCHEMA_VERSION,
    audience: 'human-review',
    proposal: {
      role: 'executable-proposal-identity',
      sourceDigest: SOURCE,
      algorithm: 'sha256',
      representation: 'mmi-notation-trimmed-utf8-v1',
      digest: PROPOSAL,
    },
    review: reviewPresentation(),
    authorityVerification: authority(status),
  };

  return {
    schemaVersion: DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION,
    audience: 'human-review',
    surface: proposalSurface,
    deterministicReviewEvidence: deterministicEvidence(),
  };
}

test('projects the four trust domains without an overall verdict', () => {
  const model = createUnifiedHumanReviewViewModel(
    envelope(),
    input(),
  );

  assert.equal(
    model.schemaVersion,
    UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  );
  assert.equal(model.proposalIdentity.role, 'proposal-identity');
  assert.equal(model.authority.role, 'authority');
  assert.equal(model.cognitive.role, 'cognitive');
  assert.equal(model.deterministic.role, 'deterministic');
  assert.equal(model.authority.verification.verificationStatus, 'satisfied');
  assert.equal(model.authority.boundary.writeAuthority, 'none');
  assert.equal(model.authority.boundary.applyStatus, 'not-authorized');
  assert.equal(model.cognitive.perception.classification, 'novel');
  assert.equal(model.deterministic.evidence.producer.kind, 'deterministic-analysis');

  assert.equal('overallStatus' in model, false);
  assert.equal('overallScore' in model, false);
  assert.equal('approved' in model, false);
});

test('blocked Authority remains a reviewable separate section', () => {
  const model = createUnifiedHumanReviewViewModel(
    envelope(),
    input('blocked'),
  );

  assert.equal(model.authority.verification.verificationStatus, 'blocked');
  assert.deepEqual(
    model.authority.verification.failedChecks,
    ['source-identity'],
  );
  assert.equal(model.cognitive.perception.classification, 'novel');
  assert.equal(model.authority.boundary.applyStatus, 'not-authorized');
});

test('rejects proposal source identity tampering', () => {
  const artifact = input();
  artifact.surface.proposal.sourceDigest = 'sha256:' + 'c'.repeat(64);

  assert.throws(
    () => createUnifiedHumanReviewViewModel(envelope(), artifact),
    /source identity does not match/,
  );
});

test('rejects deterministic evidence source identity tampering', () => {
  const artifact = input();
  artifact.deterministicReviewEvidence.sourceDigest =
    'sha256:' + 'c'.repeat(64);

  assert.throws(
    () => createUnifiedHumanReviewViewModel(envelope(), artifact),
    /source digest does not match/,
  );
});

test('rejects review boundary tampering', () => {
  const artifact = input();
  artifact.surface.review.authority.applyStatus = 'authorized' as never;

  assert.throws(
    () => createUnifiedHumanReviewViewModel(envelope(), artifact),
    /review-only\/no-write boundary/,
  );
});

test('does not mutate input artifacts', () => {
  const env = envelope();
  const artifact = input();
  const envBefore = structuredClone(env);
  const artifactBefore = structuredClone(artifact);

  createUnifiedHumanReviewViewModel(env, artifact);

  assert.deepEqual(env, envBefore);
  assert.deepEqual(artifact, artifactBefore);
});

test('serialization excludes raw data, apply authority, and combined verdicts', () => {
  const model = createUnifiedHumanReviewViewModel(
    envelope(),
    input(),
  );
  const serialized = JSON.stringify(model);

  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('mode=table'), false);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('combinedScore'), false);
  assert.equal(serialized.includes('"accepted"'), false);
  assert.equal(serialized.includes('"approved"'), false);
  assert.equal(serialized.includes('"apply":'), false);
  assert.equal(serialized.includes('"canApply"'), false);
});
