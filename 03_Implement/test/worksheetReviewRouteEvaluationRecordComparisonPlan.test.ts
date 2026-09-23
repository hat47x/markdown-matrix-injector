import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import type {
  ClosedChoiceProviderResponse,
} from '../src/experimental/closedChoiceJudgment.js';
import type {
  WorksheetReviewRouteChoice,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  createWorksheetReviewRouteEvaluationPlan,
  runWorksheetReviewRouteEvaluationPlan,
} from '../src/experimental/worksheetReviewRouteEvaluationPlan.js';
import {
  createWorksheetReviewRouteEvaluationRecord,
  reevaluateWorksheetReviewRouteEvaluationRecord,
  type WorksheetReviewRouteEvaluationRecordV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecord.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan,
  createWorksheetReviewRouteEvaluationRecordComparisonPlan,
  runWorksheetReviewRouteEvaluationRecordComparisonPlan,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPlan.js';

const readinessPolicy = {
  minimumAdjudicatedCases: 4,
  minimumAdjudicatedCaseFamilies: 4,
  requireBothExpectedRoutes: true,
  requireProjectionForAllAdjudicated: true,
  requireAllCasesAdjudicated: true,
} as const;

function comparisonPolicy(
  groundTruth = true,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
    purpose: 'explicit-comparison-change-policy',
    allowedChanges: {
      recordIdentity: true,
      planDigest: false,
      packetDigest: false,
      readinessPolicy: false,
      planProvider: false,
      response: false,
      groundTruth,
      summary: groundTruth,
      projectionSeparability: groundTruth,
      reportProvider: false,
    },
    labelOnlyReevaluation: groundTruth
      ? 'required'
      : 'forbidden',
  };
}

function corpus(): WorksheetReviewRouteLabelCorpusV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    purpose: 'independent-ground-truth',
    blinding: {
      providerOutputHidden: true,
      providerIdentityHidden: true,
      modelIdentityHidden: true,
      probabilityHidden: true,
      confidenceHidden: true,
    },
    cases: [
      adjudicated('inspect-a','family-a','inspect','ambiguous',2,false,0.2),
      adjudicated('inspect-c','family-c','inspect','novel',1,false,0.6),
      adjudicated('routine-b','family-b','routine','matched',1,true,0.05),
      adjudicated('routine-d','family-d','routine','matched',1,true,0.02),
    ],
  };
}

function adjudicated(
  id: string,
  caseFamily: string,
  route: WorksheetReviewRouteChoice,
  classification: 'matched' | 'ambiguous' | 'novel',
  candidateCount: number,
  hasWinner: boolean,
  noveltyScore: number,
): WorksheetReviewRouteLabelCorpusV1['cases'][number] {
  return {
    id,
    evidence: {
      sourceClass: 'replay',
      caseFamily,
      reference: `evidence:${id}`,
      facts: [`Fact ${id}`],
    },
    projectionState: {
      classification,
      candidateCount,
      hasWinner,
      noveltyScore,
    },
    annotations: [
      {
        annotatorRef: `${id}:a`,
        route,
        rationaleCodes: ['R1'],
        annotationReference: `annotation:${id}:a`,
      },
      {
        annotatorRef: `${id}:b`,
        route,
        rationaleCodes: ['R2'],
        annotationReference: `annotation:${id}:b`,
      },
    ],
    adjudication: {
      adjudicatorRef: `${id}:adj`,
      route,
      rationaleCodes: ['FINAL'],
      adjudicationReference: `adjudication:${id}`,
    },
  };
}

function provider(): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id: 'mmi.comparison-plan.stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice','fixture'],
    },
    async decide({ observation }): Promise<
      ClosedChoiceProviderResponse<WorksheetReviewRouteChoice>
    > {
      const payload =
        observation.payload as {
          classification: string;
        };
      const choice: WorksheetReviewRouteChoice =
        payload.classification === 'matched'
          ? 'routine'
          : 'inspect';
      return {
        status: 'decision',
        choice,
        probability: 0.9,
        confidence: 0.8,
        distribution: choice === 'inspect'
          ? { inspect: 0.9, routine: 0.1 }
          : { inspect: 0.1, routine: 0.9 },
      };
    },
  };
}

async function record(
  source: WorksheetReviewRouteLabelCorpusV1,
): Promise<WorksheetReviewRouteEvaluationRecordV1> {
  const runtimeProvider = provider();
  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      readinessPolicy,
      runtimeProvider.descriptor,
    );
  const completed =
    await runWorksheetReviewRouteEvaluationPlan(
      source,
      plan,
      runtimeProvider,
    );
  assert.equal(completed.status, 'completed');
  if (completed.status !== 'completed') {
    throw new Error('expected completed run');
  }
  return createWorksheetReviewRouteEvaluationRecord(
    source,
    plan,
    completed,
  );
}

async function labelOnlyPair(): Promise<{
  left: WorksheetReviewRouteEvaluationRecordV1;
  right: WorksheetReviewRouteEvaluationRecordV1;
}> {
  const source = corpus();
  const left = await record(source);
  const corrected = structuredClone(source);
  corrected.cases[0]!.adjudication = {
    ...corrected.cases[0]!.adjudication!,
    route: 'routine',
    rationaleCodes: ['CORRECTED'],
  };
  return {
    left,
    right:
      reevaluateWorksheetReviewRouteEvaluationRecord(
        corrected,
        left,
      ),
  };
}

test('creates a deterministic directional plan and snapshots the policy', async () => {
  const { left, right } = await labelOnlyPair();
  const policy = comparisonPolicy(true);
  const beforePolicy = structuredClone(policy);

  const first =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      policy,
    );
  const second =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      policy,
    );
  const reversed =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      right,
      left,
      policy,
    );

  assert.equal(first.planDigest, second.planDigest);
  assert.notEqual(first.planDigest, reversed.planDigest);
  assert.equal(first.leftRecordDigest, left.recordDigest);
  assert.equal(first.rightRecordDigest, right.recordDigest);
  assert.deepEqual(first.policy, policy);
  assert.notEqual(first.policy, policy);
  assert.deepEqual(policy, beforePolicy);
  assert.match(first.planDigest, /^sha256:[0-9a-f]{64}$/u);
});

test('policy change produces a different plan identity', async () => {
  const { left, right } = await labelOnlyPair();

  const allowed =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      comparisonPolicy(true),
    );
  const forbidden =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      comparisonPolicy(false),
    );

  assert.notEqual(
    allowed.planDigest,
    forbidden.planDigest,
  );
});

test('strict plan validation rejects unknown fields and digest tamper', async () => {
  const { left, right } = await labelOnlyPair();
  const plan =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      comparisonPolicy(true),
    );

  assert.doesNotThrow(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPlan(
        plan,
      ),
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPlan({
        ...plan,
        score: 1,
      }),
    /Unknown worksheet review-route evaluation record comparison plan field/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPlan({
        ...plan,
        planDigest:
          `sha256:${'0'.repeat(64)}`,
      }),
    /digest does not match/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPlan({
        ...plan,
        leftRecordDigest: 'not-a-digest',
      }),
    /left digest must use/,
  );
});

test('rejects runtime record substitution before comparison execution', async () => {
  const { left, right } = await labelOnlyPair();
  const plan =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      comparisonPolicy(true),
    );

  assert.throws(
    () =>
      runWorksheetReviewRouteEvaluationRecordComparisonPlan(
        right,
        right,
        plan,
      ),
    /left record does not match/,
  );

  assert.throws(
    () =>
      runWorksheetReviewRouteEvaluationRecordComparisonPlan(
        left,
        left,
        plan,
      ),
    /right record does not match/,
  );
});

test('planned comparison returns a compliant policy result without adding an overall verdict', async () => {
  const { left, right } = await labelOnlyPair();
  const plan =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      comparisonPolicy(true),
    );

  const executed =
    runWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      plan,
    );

  assert.equal(executed.status, 'completed');
  assert.equal(executed.planDigest, plan.planDigest);
  assert.equal(executed.result.compliant, true);
  assert.deepEqual(executed.result.violations, []);
  assert.equal(
    executed.result.comparison.groundTruth
      .labelOnlyReevaluation,
    true,
  );

  const serialized = JSON.stringify(executed);
  for (const forbidden of [
    '"winner"',
    '"better"',
    '"worse"',
    '"recommendation"',
    '"score"',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('policy noncompliance is a typed result rather than execution failure', async () => {
  const { left, right } = await labelOnlyPair();
  const plan =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      comparisonPolicy(false),
    );

  const executed =
    runWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      plan,
    );

  assert.equal(executed.status, 'completed');
  assert.equal(executed.result.compliant, false);
  assert.equal(
    executed.result.violations.length > 0,
    true,
  );
  assert.equal(
    executed.result.violations.some(
      (entry) =>
        entry.code === 'GROUND_TRUTH_CHANGED',
    ),
    true,
  );
  assert.equal(
    executed.result.violations.some(
      (entry) =>
        entry.code ===
          'LABEL_ONLY_REEVALUATION_FORBIDDEN',
    ),
    true,
  );
});

test('plan creation and execution do not mutate records, policy, or plan', async () => {
  const { left, right } = await labelOnlyPair();
  const policy = comparisonPolicy(true);
  const beforeLeft = structuredClone(left);
  const beforeRight = structuredClone(right);
  const beforePolicy = structuredClone(policy);

  const plan =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left,
      right,
      policy,
    );
  const beforePlan = structuredClone(plan);

  runWorksheetReviewRouteEvaluationRecordComparisonPlan(
    left,
    right,
    plan,
  );

  assert.deepEqual(left, beforeLeft);
  assert.deepEqual(right, beforeRight);
  assert.deepEqual(policy, beforePolicy);
  assert.deepEqual(plan, beforePlan);
});
