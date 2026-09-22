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
  type WorksheetReviewRouteEvaluationPlanV1,
} from '../src/experimental/worksheetReviewRouteEvaluationPlan.js';
import {
  createWorksheetReviewRouteEvaluationRecord,
  reevaluateWorksheetReviewRouteEvaluationRecord,
  type WorksheetReviewRouteEvaluationRecordV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecord.js';
import {
  assertWorksheetReviewRouteEvaluationRecordComparison,
  compareWorksheetReviewRouteEvaluationRecords,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparison.js';

const policy = {
  minimumAdjudicatedCases: 4,
  minimumAdjudicatedCaseFamilies: 4,
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
        'inspect-a',
        'family-a',
        'inspect',
        'ambiguous',
        2,
        false,
        0.2,
      ),
      adjudicated(
        'inspect-c',
        'family-c',
        'inspect',
        'novel',
        1,
        false,
        0.6,
      ),
      adjudicated(
        'routine-b',
        'family-b',
        'routine',
        'matched',
        1,
        true,
        0.05,
      ),
      adjudicated(
        'routine-d',
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
      facts: [`Sensitive comparison fact for ${id}`],
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
  mode: 'normal' | 'flip-inspect-a' = 'normal',
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id: 'mmi.route-comparison.local-stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: [
        'fixture',
        'closed-choice',
      ],
    },
    async decide({ observation }): Promise<
      ClosedChoiceProviderResponse<WorksheetReviewRouteChoice>
    > {
      const payload =
        observation.payload as {
          classification: string;
        };

      const normalChoice: WorksheetReviewRouteChoice =
        payload.classification === 'matched'
          ? 'routine'
          : 'inspect';

      const choice: WorksheetReviewRouteChoice =
        mode === 'flip-inspect-a'
        && observation.id === 'inspect-a'
          ? 'routine'
          : normalChoice;

      const probability = 0.9;
      return {
        status: 'decision',
        choice,
        probability,
        confidence: 0.8,
        distribution: choice === 'inspect'
          ? {
              inspect: probability,
              routine: 1 - probability,
            }
          : {
              inspect: 1 - probability,
              routine: probability,
            },
      };
    },
  };
}

async function record(
  source: WorksheetReviewRouteLabelCorpusV1,
  runtimeProvider = provider(),
  readinessPolicy = policy,
): Promise<{
  plan: WorksheetReviewRouteEvaluationPlanV1;
  record: WorksheetReviewRouteEvaluationRecordV1;
}> {
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
    throw new Error('expected completed planned run');
  }

  return {
    plan,
    record:
      createWorksheetReviewRouteEvaluationRecord(
        source,
        plan,
        completed,
      ),
  };
}

test('identical records remain identical without creating an overall verdict', async () => {
  const source = corpus();
  const { record: first } =
    await record(source);
  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      first,
      structuredClone(first),
    );

  assert.equal(
    comparison.recordIdentity.sameRecord,
    true,
  );
  assert.deepEqual(comparison.plan, {
    samePlanDigest: true,
    samePacketDigest: true,
    sameReadinessPolicy: true,
    sameProvider: true,
  });
  assert.deepEqual(comparison.response, {
    sameResponse: true,
    changedCaseIds: [],
  });
  assert.deepEqual(comparison.groundTruth, {
    sameGroundTruthDigest: true,
    changedExpectedRouteCaseIds: [],
    labelOnlyReevaluation: false,
  });
  assert.deepEqual(comparison.report, {
    sameSummary: true,
    sameProjectionSeparability: true,
    sameProvider: true,
  });

  const serialized = JSON.stringify(comparison);
  for (const forbidden of [
    'winner',
    'better',
    'worse',
    'recommendation',
    'expectedRoute',
    'providerConfidence',
    'selectedProbability',
    'annotatorRef',
    'adjudicatorRef',
    'Sensitive comparison fact',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `comparison leaked or introduced ${forbidden}`,
    );
  }
});

test('detects issue-0177 label-only offline re-evaluation independently from provider response', async () => {
  const source = corpus();
  const { record: before } =
    await record(source);

  const corrected = structuredClone(source);
  corrected.cases[0]!.adjudication = {
    ...corrected.cases[0]!.adjudication!,
    route: 'routine',
    rationaleCodes: ['CORRECTED'],
  };

  const after =
    reevaluateWorksheetReviewRouteEvaluationRecord(
      corrected,
      before,
    );

  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      before,
      after,
    );

  assert.equal(
    comparison.recordIdentity.sameRecord,
    false,
  );
  assert.equal(
    comparison.plan.samePlanDigest,
    true,
  );
  assert.equal(
    comparison.plan.samePacketDigest,
    true,
  );
  assert.equal(
    comparison.response.sameResponse,
    true,
  );
  assert.deepEqual(
    comparison.response.changedCaseIds,
    [],
  );
  assert.equal(
    comparison.groundTruth.sameGroundTruthDigest,
    false,
  );
  assert.deepEqual(
    comparison.groundTruth
      .changedExpectedRouteCaseIds,
    ['inspect-a'],
  );
  assert.equal(
    comparison.groundTruth.labelOnlyReevaluation,
    true,
  );
  assert.equal(
    comparison.report.sameSummary,
    false,
  );
  assert.equal(
    comparison.report.sameProjectionSeparability,
    false,
  );
});

test('separates a same-plan provider outcome rerun from label-only change', async () => {
  const source = corpus();
  const normal = await record(
    source,
    provider('normal'),
  );
  const changed = await record(
    source,
    provider('flip-inspect-a'),
  );

  assert.equal(
    normal.plan.planDigest,
    changed.plan.planDigest,
  );

  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      normal.record,
      changed.record,
    );

  assert.equal(
    comparison.plan.samePlanDigest,
    true,
  );
  assert.equal(
    comparison.plan.samePacketDigest,
    true,
  );
  assert.equal(
    comparison.response.sameResponse,
    false,
  );
  assert.deepEqual(
    comparison.response.changedCaseIds,
    ['inspect-a'],
  );
  assert.equal(
    comparison.groundTruth.sameGroundTruthDigest,
    true,
  );
  assert.deepEqual(
    comparison.groundTruth
      .changedExpectedRouteCaseIds,
    [],
  );
  assert.equal(
    comparison.groundTruth.labelOnlyReevaluation,
    false,
  );
  assert.equal(
    comparison.report.sameSummary,
    false,
  );
});

test('separates readiness-policy plan change even when packet/provider/response are unchanged', async () => {
  const source = corpus();
  const original = await record(
    source,
    provider(),
    policy,
  );
  const changedPolicy = {
    ...policy,
    minimumAdjudicatedCases: 3,
  } as const;
  const changed = await record(
    source,
    provider(),
    changedPolicy,
  );

  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      original.record,
      changed.record,
    );

  assert.equal(
    comparison.plan.samePlanDigest,
    false,
  );
  assert.equal(
    comparison.plan.samePacketDigest,
    true,
  );
  assert.equal(
    comparison.plan.sameReadinessPolicy,
    false,
  );
  assert.equal(
    comparison.plan.sameProvider,
    true,
  );
  assert.equal(
    comparison.response.sameResponse,
    true,
  );
  assert.equal(
    comparison.groundTruth.sameGroundTruthDigest,
    true,
  );
  assert.equal(
    comparison.groundTruth.labelOnlyReevaluation,
    false,
  );
});

test('detects provider-visible packet change without inventing a ground-truth route change', async () => {
  const source = corpus();
  const original = await record(source);

  const changedSource = structuredClone(source);
  changedSource.cases[0]!.projectionState = {
    ...changedSource.cases[0]!.projectionState!,
    noveltyScore: 0.25,
  };
  const changed = await record(changedSource);

  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      original.record,
      changed.record,
    );

  assert.equal(
    comparison.plan.samePlanDigest,
    false,
  );
  assert.equal(
    comparison.plan.samePacketDigest,
    false,
  );
  assert.equal(
    comparison.response.sameResponse,
    false,
  );
  assert.deepEqual(
    comparison.response.changedCaseIds,
    ['inspect-a'],
  );
  assert.equal(
    comparison.groundTruth.sameGroundTruthDigest,
    false,
  );
  assert.deepEqual(
    comparison.groundTruth
      .changedExpectedRouteCaseIds,
    [],
  );
  assert.equal(
    comparison.groundTruth.labelOnlyReevaluation,
    false,
  );
});

test('provider capability order does not create a provider difference', async () => {
  const source = corpus();
  const { record: first } =
    await record(source);
  const reordered = structuredClone(first);

  reordered.plan.provider.capabilities = [
    ...reordered.plan.provider.capabilities,
  ].reverse();
  reordered.report.provider.capabilities = [
    ...reordered.report.provider.capabilities,
  ].reverse();
  for (const outcome of reordered.response.outcomes) {
    outcome.outcome.provider.capabilities = [
      ...outcome.outcome.provider.capabilities,
    ].reverse();
  }

  // A record with noncanonical plan capabilities is invalid, so compare
  // semantically equivalent valid records by restoring canonical record
  // validation and varying only comparison helper inputs is not allowed.
  // The record validator is the stronger boundary.
  assert.throws(
    () =>
      compareWorksheetReviewRouteEvaluationRecords(
        first,
        reordered,
      ),
    /canonical capability order/,
  );
});

test('strict comparison validation rejects unknown fields, unsorted ids, and logical invariant mismatches', async () => {
  const source = corpus();
  const { record: first } =
    await record(source);
  const correctedSource = structuredClone(source);
  correctedSource.cases[0]!.adjudication = {
    ...correctedSource.cases[0]!.adjudication!,
    route: 'routine',
  };
  const corrected =
    reevaluateWorksheetReviewRouteEvaluationRecord(
      correctedSource,
      first,
    );
  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      first,
      corrected,
    );

  assert.doesNotThrow(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparison(
        comparison,
      ),
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparison({
        ...comparison,
        score: 1,
      }),
    /Unknown worksheet review-route evaluation record comparison field/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparison({
        ...comparison,
        recordIdentity: {
          sameRecord: true,
        },
      }),
    /sameRecord invariant/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparison({
        ...comparison,
        groundTruth: {
          ...comparison.groundTruth,
          labelOnlyReevaluation: false,
        },
      }),
    /labelOnlyReevaluation invariant/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparison({
        ...comparison,
        response: {
          ...comparison.response,
          changedCaseIds: ['z', 'a'],
        },
      }),
    /canonical sorted order/,
  );
});

test('comparison does not mutate either source record', async () => {
  const source = corpus();
  const { record: left } =
    await record(source);
  const changedSource = structuredClone(source);
  changedSource.cases[0]!.adjudication = {
    ...changedSource.cases[0]!.adjudication!,
    route: 'routine',
  };
  const right =
    reevaluateWorksheetReviewRouteEvaluationRecord(
      changedSource,
      left,
    );

  const beforeLeft = structuredClone(left);
  const beforeRight = structuredClone(right);

  compareWorksheetReviewRouteEvaluationRecords(
    left,
    right,
  );

  assert.deepEqual(left, beforeLeft);
  assert.deepEqual(right, beforeRight);
});
