import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import type {
  ClosedChoiceProviderResponse,
} from '../src/experimental/closedChoiceJudgment.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import type {
  WorksheetReviewRouteChoice,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';
import {
  assertWorksheetReviewRouteEvaluationPlan,
  createWorksheetReviewRouteEvaluationPlan,
  runWorksheetReviewRouteEvaluationPlan,
} from '../src/experimental/worksheetReviewRouteEvaluationPlan.js';

const policy = {
  minimumAdjudicatedCases: 2,
  minimumAdjudicatedCaseFamilies: 2,
  requireBothExpectedRoutes: true,
  requireProjectionForAllAdjudicated: true,
  requireAllCasesAdjudicated: true,
} as const;

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
      adjudicated(
        'inspect-case',
        'family-a',
        'inspect',
        'ambiguous',
        2,
        false,
        0.2,
      ),
      adjudicated(
        'routine-case',
        'family-b',
        'routine',
        'matched',
        1,
        true,
        0.05,
      ),
      adjudicated(
        'inspect-case-2',
        'family-c',
        'inspect',
        'novel',
        1,
        false,
        0.6,
      ),
      adjudicated(
        'routine-case-2',
        'family-d',
        'routine',
        'matched',
        1,
        true,
        0.02,
      ),
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

function provider(
  id = 'mmi.route-eval.stub',
  version = '1',
  capabilities:
    readonly string[] = ['closed-choice', 'fixture'],
  seen: string[] = [],
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id,
      version,
      category: 'judgment',
      executionBoundary: 'local',
      capabilities,
    },
    async decide({ observation }): Promise<
      ClosedChoiceProviderResponse<WorksheetReviewRouteChoice>
    > {
      seen.push(observation.id);
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
          ? {
              inspect: 0.9,
              routine: 0.1,
            }
          : {
              inspect: 0.1,
              routine: 0.9,
            },
      };
    },
  };
}

test('creates a deterministic plan with canonical provider capabilities', () => {
  const first =
    createWorksheetReviewRouteEvaluationPlan(
      corpus(),
      policy,
      provider(
        'mmi.route-eval.stub',
        '1',
        ['fixture', 'closed-choice'],
      ).descriptor,
    );
  const second =
    createWorksheetReviewRouteEvaluationPlan(
      corpus(),
      policy,
      provider().descriptor,
    );

  assert.deepEqual(
    first.provider.capabilities,
    ['closed-choice', 'fixture'],
  );
  assert.equal(first.planDigest, second.planDigest);
  assert.match(
    first.planDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test('plan identity changes for policy, provider, or projection changes but not label-only correction while readiness remains satisfied', () => {
  const source = corpus();
  const base =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      policy,
      provider().descriptor,
    );

  const changedPolicy =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      {
        ...policy,
        minimumAdjudicatedCases: 1,
      },
      provider().descriptor,
    );
  assert.notEqual(
    changedPolicy.planDigest,
    base.planDigest,
  );

  const changedProvider =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      policy,
      provider(
        'mmi.route-eval.stub',
        '2',
      ).descriptor,
    );
  assert.notEqual(
    changedProvider.planDigest,
    base.planDigest,
  );

  const changedProjection = structuredClone(source);
  changedProjection.cases[0]!.projectionState = {
    ...changedProjection.cases[0]!.projectionState!,
    noveltyScore: 0.25,
  };
  const projectionPlan =
    createWorksheetReviewRouteEvaluationPlan(
      changedProjection,
      policy,
      provider().descriptor,
    );
  assert.notEqual(
    projectionPlan.planDigest,
    base.planDigest,
  );

  const correctedLabel = structuredClone(source);
  correctedLabel.cases[0]!.adjudication = {
    ...correctedLabel.cases[0]!.adjudication!,
    route: 'routine',
  };
  const correctedPlan =
    createWorksheetReviewRouteEvaluationPlan(
      correctedLabel,
      policy,
      provider().descriptor,
    );
  assert.equal(
    correctedPlan.planDigest,
    base.planDigest,
  );
});

test('strictly validates plan fields and digest', () => {
  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      corpus(),
      policy,
      provider().descriptor,
    );

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteEvaluationPlan(
      plan,
    ),
  );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationPlan({
      ...plan,
      model: 'not-allowed',
    }),
    /Unknown worksheet review-route evaluation plan field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationPlan({
      ...plan,
      planDigest:
        `sha256:${'0'.repeat(64)}`,
    }),
    /digest does not match/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationPlan({
      ...plan,
      provider: {
        ...plan.provider,
        capabilities: [
          'fixture',
          'closed-choice',
        ],
      },
    }),
    /canonical capability order/,
  );
});

test('rejects runtime provider mismatch and stale packet before provider calls', async () => {
  const source = corpus();
  const plannedProvider = provider();
  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      policy,
      plannedProvider.descriptor,
    );

  const mismatchSeen: string[] = [];
  await assert.rejects(
    () => runWorksheetReviewRouteEvaluationPlan(
      source,
      plan,
      provider(
        'mmi.route-eval.stub',
        '2',
        ['closed-choice', 'fixture'],
        mismatchSeen,
      ),
    ),
    /does not match the predeclared plan/,
  );
  assert.equal(mismatchSeen.length, 0);

  const changed = structuredClone(source);
  changed.cases[0]!.projectionState = {
    ...changed.cases[0]!.projectionState!,
    noveltyScore: 0.3,
  };
  const staleSeen: string[] = [];
  await assert.rejects(
    () => runWorksheetReviewRouteEvaluationPlan(
      changed,
      plan,
      provider(
        'mmi.route-eval.stub',
        '1',
        ['closed-choice', 'fixture'],
        staleSeen,
      ),
    ),
    /plan is stale/,
  );
  assert.equal(staleSeen.length, 0);
});

test('readiness regression blocks without provider execution and ready plan completes with plan digest', async () => {
  const source = corpus();
  const seen: string[] = [];
  const runtimeProvider = provider(
    'mmi.route-eval.stub',
    '1',
    ['closed-choice', 'fixture'],
    seen,
  );
  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      policy,
      runtimeProvider.descriptor,
    );

  const regressed = structuredClone(source);
  regressed.cases[0]!.adjudication = undefined;
  const blocked =
    await runWorksheetReviewRouteEvaluationPlan(
      regressed,
      plan,
      runtimeProvider,
    );
  assert.equal(blocked.status, 'blocked');
  assert.equal(seen.length, 0);

  const completed =
    await runWorksheetReviewRouteEvaluationPlan(
      source,
      plan,
      runtimeProvider,
    );
  assert.equal(completed.status, 'completed');
  assert.equal(completed.planDigest, plan.planDigest);
  assert.equal(seen.length, 4);
});

test('plan creation and execution do not mutate corpus, policy, or descriptor', async () => {
  const source = corpus();
  const mutablePolicy = { ...policy };
  const runtimeProvider = provider();
  const beforeSource = structuredClone(source);
  const beforePolicy = structuredClone(mutablePolicy);
  const beforeDescriptor =
    structuredClone(runtimeProvider.descriptor);

  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      mutablePolicy,
      runtimeProvider.descriptor,
    );
  await runWorksheetReviewRouteEvaluationPlan(
    source,
    plan,
    runtimeProvider,
  );

  assert.deepEqual(source, beforeSource);
  assert.deepEqual(mutablePolicy, beforePolicy);
  assert.deepEqual(
    runtimeProvider.descriptor,
    beforeDescriptor,
  );
});
