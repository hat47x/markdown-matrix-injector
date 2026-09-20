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
  createWorksheetReviewRouteEvaluationPlan,
  runWorksheetReviewRouteEvaluationPlan,
  type WorksheetReviewRouteEvaluationPlanV1,
  type WorksheetReviewRoutePlannedRunResultV1,
} from '../src/experimental/worksheetReviewRouteEvaluationPlan.js';
import {
  assertWorksheetReviewRouteEvaluationRecord,
  createWorksheetReviewRouteEvaluationRecord,
  reevaluateWorksheetReviewRouteEvaluationRecord,
} from '../src/experimental/worksheetReviewRouteEvaluationRecord.js';

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
      facts: [`Sensitive label fact for ${id}`],
    },
    projectionState: {
      classification,
      candidateCount,
      hasWinner,
      noveltyScore,
    },
    annotations: [
      {
        annotatorRef: `${id}:annotator-a`,
        route,
        rationaleCodes: ['R1'],
        annotationReference:
          `annotation:${id}:a`,
      },
      {
        annotatorRef: `${id}:annotator-b`,
        route,
        rationaleCodes: ['R2'],
        annotationReference:
          `annotation:${id}:b`,
      },
    ],
    adjudication: {
      adjudicatorRef: `${id}:adjudicator`,
      route,
      rationaleCodes: ['FINAL'],
      adjudicationReference:
        `adjudication:${id}`,
    },
  };
}

function provider(
  seen: string[] = [],
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id: 'mmi.route-record.local-stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: [
        'closed-choice',
        'fixture',
      ],
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

async function completedRun(
  source: WorksheetReviewRouteLabelCorpusV1,
  runtimeProvider =
    provider(),
): Promise<{
  plan: WorksheetReviewRouteEvaluationPlanV1;
  completed: Extract<
    WorksheetReviewRoutePlannedRunResultV1,
    { status: 'completed' }
  >;
}> {
  const plan =
    createWorksheetReviewRouteEvaluationPlan(
      source,
      policy,
      runtimeProvider.descriptor,
    );
  const result =
    await runWorksheetReviewRouteEvaluationPlan(
      source,
      plan,
      runtimeProvider,
    );
  assert.equal(result.status, 'completed');
  if (result.status !== 'completed') {
    throw new Error('expected completed planned run');
  }
  return {
    plan,
    completed: result,
  };
}

test('creates a deterministic linked record without raw label-corpus provenance', async () => {
  const source = corpus();
  const { plan, completed } =
    await completedRun(source);

  const first =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );
  const second =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteEvaluationRecord(
      first,
    ),
  );
  assert.equal(first.planDigest, plan.planDigest);
  assert.equal(
    first.packetDigest,
    completed.run.report.packetDigest,
  );
  assert.equal(
    first.groundTruthDigest,
    completed.run.report.groundTruthDigest,
  );
  assert.equal(
    first.recordDigest,
    second.recordDigest,
  );
  assert.match(
    first.recordDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );

  const serialized = JSON.stringify(first);
  for (const forbidden of [
    'Sensitive label fact',
    'annotatorRef',
    'adjudicatorRef',
    'annotationReference',
    'adjudicationReference',
    'caseFamily',
    'sourceClass',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `record leaked ${forbidden}`,
    );
  }
});

test('rejects unknown fields, tampered digests, provider linkage, and observation misbinding', async () => {
  const source = corpus();
  const { plan, completed } =
    await completedRun(source);
  const record =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationRecord({
      ...record,
      trusted: true,
    }),
    /Unknown worksheet review-route evaluation record field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationRecord({
      ...record,
      recordDigest:
        `sha256:${'0'.repeat(64)}`,
    }),
    /digest does not match/,
  );

  const providerMismatch =
    structuredClone(record);
  providerMismatch.report.provider.version = '2';
  assert.throws(
    () => assertWorksheetReviewRouteEvaluationRecord(
      providerMismatch,
    ),
    /report provider does not match/,
  );

  const observationMismatch =
    structuredClone(record);
  observationMismatch.response.outcomes[0]!
    .outcome.observation.sourceDigest =
      `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () => assertWorksheetReviewRouteEvaluationRecord(
      observationMismatch,
    ),
    /observation linkage mismatch/,
  );
});

test('rejects response case reordering instead of normalizing a completed record silently', async () => {
  const source = corpus();
  const { plan, completed } =
    await completedRun(source);
  const record =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );

  const reordered = structuredClone(record);
  reordered.response.outcomes = [
    ...reordered.response.outcomes,
  ].reverse();

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationRecord(
      reordered,
    ),
    /canonical sorted order/,
  );
});

test('offline label-only correction reuses the stored provider response and changes only ground-truth-derived identities', async () => {
  const source = corpus();
  const seen: string[] = [];
  const runtimeProvider = provider(seen);
  const { plan, completed } =
    await completedRun(source, runtimeProvider);
  const record =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );
  assert.equal(seen.length, 4);

  const corrected = structuredClone(source);
  corrected.cases[0]!.adjudication = {
    ...corrected.cases[0]!.adjudication!,
    route: 'routine',
    rationaleCodes: ['CORRECTED_FINAL_ROUTE'],
  };

  const replayed =
    reevaluateWorksheetReviewRouteEvaluationRecord(
      corrected,
      record,
    );

  assert.equal(seen.length, 4);
  assert.equal(
    replayed.planDigest,
    record.planDigest,
  );
  assert.equal(
    replayed.packetDigest,
    record.packetDigest,
  );
  assert.deepEqual(
    replayed.response,
    record.response,
  );
  assert.notEqual(
    replayed.groundTruthDigest,
    record.groundTruthDigest,
  );
  assert.notEqual(
    replayed.recordDigest,
    record.recordDigest,
  );
  assert.equal(
    replayed.report.summary.decisionAccuracy,
    0.75,
  );
});

test('offline re-evaluation rejects projection changes and readiness regressions', async () => {
  const source = corpus();
  const { plan, completed } =
    await completedRun(source);
  const record =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );

  const projectionChanged =
    structuredClone(source);
  projectionChanged.cases[0]!.projectionState = {
    ...projectionChanged.cases[0]!.projectionState!,
    noveltyScore: 0.25,
  };
  assert.throws(
    () => reevaluateWorksheetReviewRouteEvaluationRecord(
      projectionChanged,
      record,
    ),
    /stale for the current projection packet/,
  );

  const readinessRegressed =
    structuredClone(source);
  readinessRegressed.cases[0]!.adjudication = undefined;
  assert.throws(
    () => reevaluateWorksheetReviewRouteEvaluationRecord(
      readinessRegressed,
      record,
    ),
    /no longer satisfies the predeclared readiness policy/,
  );
});

test('record creation and offline re-evaluation do not mutate source inputs', async () => {
  const source = corpus();
  const { plan, completed } =
    await completedRun(source);
  const beforeSource = structuredClone(source);
  const beforePlan = structuredClone(plan);
  const beforeCompleted =
    structuredClone(completed);

  const record =
    createWorksheetReviewRouteEvaluationRecord(
      plan,
      completed,
    );
  const beforeRecord = structuredClone(record);

  reevaluateWorksheetReviewRouteEvaluationRecord(
    source,
    record,
  );

  assert.deepEqual(source, beforeSource);
  assert.deepEqual(plan, beforePlan);
  assert.deepEqual(completed, beforeCompleted);
  assert.deepEqual(record, beforeRecord);
});
