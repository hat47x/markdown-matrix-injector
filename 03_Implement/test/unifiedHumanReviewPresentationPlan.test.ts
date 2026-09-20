import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
} from '../src/experimental/authorityVerificationOverlay.js';
import {
  DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
} from '../src/experimental/deterministicReviewEvidence.js';
import {
  UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  type UnifiedHumanReviewViewModelV1,
} from '../src/experimental/unifiedHumanReviewViewModel.js';
import {
  UNIFIED_HUMAN_REVIEW_PRESENTATION_PLAN_SCHEMA_VERSION,
  createUnifiedHumanReviewPresentationPlan,
} from '../src/experimental/unifiedHumanReviewPresentationPlan.js';
import {
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const SOURCE = 'sha256:' + 'a'.repeat(64);
const PROPOSAL = 'sha256:' + 'b'.repeat(64);

function model(): UnifiedHumanReviewViewModelV1<'inspect' | 'routine'> {
  return {
    schemaVersion: UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
    audience: 'human-review',
    proposalIdentity: {
      role: 'proposal-identity',
      sourceDigest: SOURCE,
      algorithm: 'sha256',
      representation: 'mmi-notation-trimmed-utf8-v1',
      digest: PROPOSAL,
    },
    authority: {
      role: 'authority',
      boundary: {
        disposition: 'review-only',
        writeAuthority: 'none',
        applyStatus: 'not-authorized',
        revalidation: [],
      },
      verification: {
        schemaVersion: AUTHORITY_VERIFICATION_OVERLAY_SCHEMA_VERSION,
        role: 'authority-verification',
        verificationStatus: 'satisfied',
        sourceDigest: SOURCE,
        scope: 'review-evidence',
        issuer: {
          kind: 'authority-plane',
          componentId: 'mmi.authority.presentation-plan-test',
          componentVersion: '1',
          runId: 'run-presentation-plan',
        },
        checks: [],
        failedChecks: [],
      },
    },
    cognitive: {
      role: 'cognitive',
      perception: {
        role: 'cognitive-perception',
        provider: {
          id: 'mmi.fly-worksheet-format',
          version: 'worksheet-format-v6',
          category: 'perception',
          executionBoundary: 'local',
        },
        signalKind: 'format-novelty',
        classification: 'matched',
        winnerPrototypeId: 'profile-a',
        noveltyScore: 0.2,
        candidates: [{
          rank: 1,
          prototypeId: 'profile-a',
          profileLabel: 'Profile A',
          approvalReference: 'review:profile-a',
          confidence: 0.8,
          deviationScore: 0.2,
          sparseSimilarity: 0.75,
          featureSimilarity: 0.82,
        }],
        metrics: [],
      },
      judgment: {
        role: 'cognitive-judgment',
        state: 'not-requested',
      },
      provenance: {
        role: 'provenance',
        sourceDigest: SOURCE,
        providers: [],
        profiles: [],
      },
    },
    deterministic: {
      role: 'deterministic',
      evidence: {
        schemaVersion: DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
        role: 'deterministic-review-evidence',
        sourceDigest: SOURCE,
        featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
        sourceProfileId: 'test-profile',
        sourceEvidence: ['structure', 'fill'],
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
            status: 'matched',
            winnerPrototypeId: 'profile-a',
            topPrototypeId: 'profile-a',
            topConfidence: 0.8,
            noveltyScore: 0.2,
          },
          control: {
            sourceProfileId: 'structure-only-test',
            status: 'matched',
            winnerPrototypeId: 'profile-a',
            topPrototypeId: 'profile-a',
            topConfidence: 0.78,
            noveltyScore: 0.22,
          },
        },
      },
    },
  };
}

function disclosure(
  plan: ReturnType<typeof createUnifiedHumanReviewPresentationPlan>,
  id: 'authority' | 'cognitive' | 'deterministic' | 'proposal-identity',
) {
  const section = plan.sections.find((entry) => entry.id === id);
  assert.ok(section);
  return section.defaultDisclosure;
}

test('uses a fixed four-section order and collapses stable details by default', () => {
  const plan = createUnifiedHumanReviewPresentationPlan(model());

  assert.equal(
    plan.schemaVersion,
    UNIFIED_HUMAN_REVIEW_PRESENTATION_PLAN_SCHEMA_VERSION,
  );
  assert.deepEqual(plan.sectionOrder, [
    'authority',
    'cognitive',
    'deterministic',
    'proposal-identity',
  ]);
  assert.deepEqual(
    plan.sections.map((section) => [section.order, section.id]),
    [
      [1, 'authority'],
      [2, 'cognitive'],
      [3, 'deterministic'],
      [4, 'proposal-identity'],
    ],
  );
  assert.equal(disclosure(plan, 'authority'), 'collapsed');
  assert.equal(disclosure(plan, 'cognitive'), 'collapsed');
  assert.equal(disclosure(plan, 'deterministic'), 'collapsed');
  assert.equal(disclosure(plan, 'proposal-identity'), 'collapsed');
});

test('expands blocked Authority without changing other section disclosure', () => {
  const input = model();
  input.authority.verification.verificationStatus = 'blocked';
  input.authority.verification.failedChecks = ['source-identity'];

  const plan = createUnifiedHumanReviewPresentationPlan(input);

  assert.equal(disclosure(plan, 'authority'), 'expanded');
  assert.equal(disclosure(plan, 'cognitive'), 'collapsed');
  assert.equal(disclosure(plan, 'deterministic'), 'collapsed');

  const authority = plan.sections[0];
  assert.equal(authority.id, 'authority');
  assert.deepEqual(authority.summary, {
    verificationStatus: 'blocked',
    failedCheckCount: 1,
    writeAuthority: 'none',
    applyStatus: 'not-authorized',
  });
});

test('expands Cognitive for ambiguous or novel Perception only within that section', () => {
  for (const classification of ['ambiguous', 'novel'] as const) {
    const input = model();
    input.cognitive.perception.classification = classification;
    delete input.cognitive.perception.winnerPrototypeId;

    const plan = createUnifiedHumanReviewPresentationPlan(input);

    assert.equal(disclosure(plan, 'authority'), 'collapsed');
    assert.equal(disclosure(plan, 'cognitive'), 'expanded');
    assert.equal(disclosure(plan, 'deterministic'), 'collapsed');
  }
});

test('expands Cognitive when Judgment is a proposal or non-decision', () => {
  const proposalInput = model();
  proposalInput.cognitive.judgment = {
    role: 'cognitive-judgment',
    state: 'proposal',
    provider: {
      id: 'mmi.local.choice',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
    },
    signalKind: 'closed-choice-judgment',
    disposition: 'proposal-only',
    questionId: 'review-route',
    choice: 'inspect',
    probability: 0.7,
    metrics: [],
  };

  const proposalPlan =
    createUnifiedHumanReviewPresentationPlan(proposalInput);
  assert.equal(disclosure(proposalPlan, 'cognitive'), 'expanded');

  const nonDecisionInput = model();
  nonDecisionInput.cognitive.judgment = {
    role: 'cognitive-judgment',
    state: 'non-decision',
    provider: {
      id: 'mmi.local.choice',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
    },
    status: 'abstained',
    reasonCode: 'LOW_MARGIN',
    metrics: [],
  };

  const nonDecisionPlan =
    createUnifiedHumanReviewPresentationPlan(nonDecisionInput);
  assert.equal(disclosure(nonDecisionPlan, 'cognitive'), 'expanded');

  const cognitive = nonDecisionPlan.sections[1];
  assert.equal(cognitive.id, 'cognitive');
  assert.equal(cognitive.summary.judgmentState, 'non-decision');
  assert.equal(cognitive.summary.judgmentStatus, 'abstained');
});

test('expands Deterministic only for review-relevant reasons', () => {
  const reviewRelevant = model();
  reviewRelevant.deterministic.evidence.reasons = [{
    code: 'fill-supported-acceptance',
    category: 'decision-impact',
    reviewRole: 'review-relevant',
  }];
  reviewRelevant.deterministic.evidence.reviewRelevantReasonCount = 1;

  const reviewPlan =
    createUnifiedHumanReviewPresentationPlan(reviewRelevant);
  assert.equal(disclosure(reviewPlan, 'deterministic'), 'expanded');

  const diagnosticOnly = model();
  diagnosticOnly.deterministic.evidence.reasons = [{
    code: 'fill-tone-disagreement',
    category: 'diagnostic',
    reviewRole: 'diagnostic-only',
  }];
  diagnosticOnly.deterministic.evidence.diagnosticReasonCount = 1;

  const diagnosticPlan =
    createUnifiedHumanReviewPresentationPlan(diagnosticOnly);
  assert.equal(disclosure(diagnosticPlan, 'deterministic'), 'collapsed');

  const deterministic = diagnosticPlan.sections[2];
  assert.equal(deterministic.id, 'deterministic');
  assert.deepEqual(deterministic.summary, {
    reviewRelevantReasonCount: 0,
    diagnosticReasonCount: 1,
  });
});

test('proposal identity remains metadata-like and collapsed regardless of other sections', () => {
  const input = model();
  input.authority.verification.verificationStatus = 'blocked';
  input.authority.verification.failedChecks = ['source-identity'];
  input.cognitive.perception.classification = 'novel';
  delete input.cognitive.perception.winnerPrototypeId;
  input.deterministic.evidence.reasons = [{
    code: 'fill-induced-rejection',
    category: 'decision-impact',
    reviewRole: 'review-relevant',
  }];
  input.deterministic.evidence.reviewRelevantReasonCount = 1;

  const plan = createUnifiedHumanReviewPresentationPlan(input);

  assert.equal(disclosure(plan, 'proposal-identity'), 'collapsed');
  assert.equal(disclosure(plan, 'authority'), 'expanded');
  assert.equal(disclosure(plan, 'cognitive'), 'expanded');
  assert.equal(disclosure(plan, 'deterministic'), 'expanded');
});

test('does not mutate the unified review model', () => {
  const input = model();
  const before = structuredClone(input);

  createUnifiedHumanReviewPresentationPlan(input);

  assert.deepEqual(input, before);
});

test('serialization contains no overall verdict, score, recommendation or apply action', () => {
  const serialized = JSON.stringify(
    createUnifiedHumanReviewPresentationPlan(model()),
  );

  assert.equal(serialized.includes('overallStatus'), false);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('combinedScore'), false);
  assert.equal(serialized.includes('recommendation'), false);
  assert.equal(serialized.includes('"approved"'), false);
  assert.equal(serialized.includes('"accepted"'), false);
  assert.equal(serialized.includes('"canApply"'), false);
  assert.equal(serialized.includes('"apply":'), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
});

test('rejects incompatible schema, role, boundary and reason counts', () => {
  const wrongSchema = model();
  wrongSchema.schemaVersion = 'other-schema' as never;
  assert.throws(
    () => createUnifiedHumanReviewPresentationPlan(wrongSchema),
    /requires the v1 human-review view model/,
  );

  const wrongRole = model();
  wrongRole.cognitive.role = 'other' as never;
  assert.throws(
    () => createUnifiedHumanReviewPresentationPlan(wrongRole),
    /requires all four trust domains/,
  );

  const wrongBoundary = model();
  wrongBoundary.authority.boundary.applyStatus = 'authorized' as never;
  assert.throws(
    () => createUnifiedHumanReviewPresentationPlan(wrongBoundary),
    /review-only\/no-write boundary/,
  );

  const wrongCounts = model();
  wrongCounts.deterministic.evidence.reviewRelevantReasonCount = 1;
  assert.throws(
    () => createUnifiedHumanReviewPresentationPlan(wrongCounts),
    /reason counts are inconsistent/,
  );
});
