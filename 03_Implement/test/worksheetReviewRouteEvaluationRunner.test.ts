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
import {
  projectWorksheetReviewRouteEvaluationState,
} from '../src/experimental/worksheetReviewRouteEvaluationObservation.js';
import {
  runWorksheetReviewRouteEvaluation,
} from '../src/experimental/worksheetReviewRouteEvaluationRunner.js';
import type {
  WorksheetReviewRouteChoice,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';

function readyCorpus(): WorksheetReviewRouteLabelCorpusV1 {
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
        'ambiguous-family',
        'inspect',
        {
          classification: 'ambiguous',
          candidateCount: 2,
          hasWinner: false,
          noveltyScore: 0.2,
        },
      ),
      adjudicated(
        'routine-case',
        'stable-family',
        'routine',
        {
          classification: 'matched',
          candidateCount: 1,
          hasWinner: true,
          noveltyScore: 0.05,
        },
      ),
    ],
  };
}

function adjudicated(
  id: string,
  caseFamily: string,
  route: WorksheetReviewRouteChoice,
  projectionState: {
    classification: 'matched' | 'ambiguous' | 'novel';
    candidateCount: number;
    hasWinner: boolean;
    noveltyScore: number;
  },
): WorksheetReviewRouteLabelCorpusV1['cases'][number] {
  return {
    id,
    evidence: {
      sourceClass: 'replay',
      caseFamily,
      reference: `evidence:${id}`,
      facts: [`Independent fact for ${id}`],
    },
    projectionState,
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

const policy = {
  minimumAdjudicatedCases: 2,
  minimumAdjudicatedCaseFamilies: 2,
  requireBothExpectedRoutes: true,
  requireProjectionForAllAdjudicated: true,
  requireAllCasesAdjudicated: true,
} as const;

function localProvider(
  seen: unknown[],
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id: 'mmi.route-eval.local-stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice'],
    },
    async decide({ observation }): Promise<
      ClosedChoiceProviderResponse<WorksheetReviewRouteChoice>
    > {
      seen.push(structuredClone(observation));
      const state =
        projectWorksheetReviewRouteEvaluationState(
          observation,
        );
      const choice: WorksheetReviewRouteChoice =
        state.classification === 'matched'
          ? 'routine'
          : 'inspect';
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

test('requires the readiness policy to explicitly require projection completeness', async () => {
  const seen: unknown[] = [];

  await assert.rejects(
    () => runWorksheetReviewRouteEvaluation(
      readyCorpus(),
      {
        ...policy,
        requireProjectionForAllAdjudicated: false,
      },
      localProvider(seen),
    ),
    /requireProjectionForAllAdjudicated=true/,
  );

  assert.equal(seen.length, 0);
});

test('blocks before provider execution when readiness policy is not satisfied', async () => {
  const source = readyCorpus();
  source.cases = source.cases.map((entry) => ({
    ...entry,
    adjudication: undefined,
  }));
  const seen: unknown[] = [];

  const result = await runWorksheetReviewRouteEvaluation(
    source,
    policy,
    localProvider(seen),
  );

  assert.equal(result.status, 'blocked');
  assert.equal(seen.length, 0);
  assert.equal(result.readiness.ready, false);
  assert.equal(
    result.readiness.blockers.some(
      (entry) =>
        entry.code ===
        'ADJUDICATED_CASES_BELOW_MINIMUM',
    ),
    true,
  );
});

test('runs only provider-visible projection state and returns the strict issue-0172 report', async () => {
  const source = readyCorpus();
  const seen: unknown[] = [];

  const result = await runWorksheetReviewRouteEvaluation(
    source,
    policy,
    localProvider(seen),
  );

  assert.equal(result.status, 'completed');
  if (result.status !== 'completed') {
    throw new Error('expected completed result');
  }

  assert.equal(seen.length, 2);
  for (const observation of seen) {
    const serialized = JSON.stringify(observation);
    for (const forbidden of [
      'expectedRoute',
      'evidence',
      'annotations',
      'adjudication',
      'annotatorRef',
      'adjudicatorRef',
      'Independent fact',
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false,
        `provider observation leaked ${forbidden}`,
      );
    }
  }

  assert.equal(result.readiness.ready, true);
  assert.equal(result.response.outcomes.length, 2);
  assert.equal(result.report.summary.cases, 2);
  assert.equal(result.report.summary.decisionCoverage, 1);
  assert.equal(result.report.summary.decisionAccuracy, 1);
  assert.equal(
    result.report.summary.inspectBinaryBrierScore,
    0.01,
  );
  assert.equal(
    result.report.projectionSeparability
      .exactStateOracleMaxAccuracy,
    1,
  );
});

test('external providers still require explicit opt-in before their first decision', async () => {
  let calls = 0;
  const provider: ClosedChoiceJudgmentProvider<
    WorksheetReviewRouteChoice
  > = {
    descriptor: {
      id: 'mmi.route-eval.external-stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'external-opt-in',
      capabilities: ['closed-choice'],
    },
    async decide() {
      calls += 1;
      return {
        status: 'decision',
        choice: 'inspect',
        probability: 0.8,
        confidence: 0.7,
        distribution: {
          inspect: 0.8,
          routine: 0.2,
        },
      };
    },
  };

  await assert.rejects(
    () => runWorksheetReviewRouteEvaluation(
      readyCorpus(),
      policy,
      provider,
    ),
    /explicit opt-in/,
  );
  assert.equal(calls, 0);

  const allowed =
    await runWorksheetReviewRouteEvaluation(
      readyCorpus(),
      policy,
      provider,
      { allowExternal: true },
    );
  assert.equal(allowed.status, 'completed');
  assert.equal(calls, 2);
});

test('runner does not mutate corpus or readiness policy', async () => {
  const source = readyCorpus();
  const mutablePolicy = { ...policy };
  const beforeSource = structuredClone(source);
  const beforePolicy = structuredClone(mutablePolicy);

  await runWorksheetReviewRouteEvaluation(
    source,
    mutablePolicy,
    localProvider([]),
  );

  assert.deepEqual(source, beforeSource);
  assert.deepEqual(mutablePolicy, beforePolicy);
});
