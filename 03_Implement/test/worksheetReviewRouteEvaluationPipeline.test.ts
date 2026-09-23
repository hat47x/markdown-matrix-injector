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
  assertWorksheetReviewRouteEvaluationRecord,
  createWorksheetReviewRouteEvaluationRecord,
  reevaluateWorksheetReviewRouteEvaluationRecord,
} from '../src/experimental/worksheetReviewRouteEvaluationRecord.js';
import {
  parseCanonicalWorksheetReviewRouteEvaluationRecordJson,
  prepareWorksheetReviewRouteEvaluationRecordJsonArtifact,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordJsonCodec.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  createWorksheetReviewRouteEvaluationRecordComparisonPlan,
  runWorksheetReviewRouteEvaluationRecordComparisonPlan,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPlan.js';
import {
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson,
  serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPlanJsonCodec.js';
import {
  createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonExecutionRecord.js';
import {
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson,
  prepareWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifact,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonCodec.js';

const readiness = {
  minimumAdjudicatedCases: 4,
  minimumAdjudicatedCaseFamilies: 4,
  requireBothExpectedRoutes: true,
  requireProjectionForAllAdjudicated: true,
  requireAllCasesAdjudicated: true,
} as const;

function labeledCase(
  id: string,
  expected: WorksheetReviewRouteChoice,
  classification: 'matched' | 'ambiguous' | 'novel',
  count: number,
  winner: boolean,
  novelty: number,
): WorksheetReviewRouteLabelCorpusV1['cases'][number] {
  return {
    id,
    evidence: {
      sourceClass: 'replay',
      caseFamily: 'family-' + id,
      reference: 'synthetic:' + id,
      facts: ['Source-only private fact for ' + id],
    },
    projectionState: {
      classification,
      candidateCount: count,
      hasWinner: winner,
      noveltyScore: novelty,
    },
    annotations: [
      {
        annotatorRef: id + ':annotator-1',
        route: expected,
        rationaleCodes: ['R1'],
        annotationReference: id + ':annotation-1',
      },
      {
        annotatorRef: id + ':annotator-2',
        route: expected,
        rationaleCodes: ['R2'],
        annotationReference: id + ':annotation-2',
      },
    ],
    adjudication: {
      adjudicatorRef: id + ':adjudicator',
      route: expected,
      rationaleCodes: ['FINAL'],
      adjudicationReference: id + ':adjudication',
    },
  };
}

function corpus(): WorksheetReviewRouteLabelCorpusV1 {
  return {
    schemaVersion: WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
    protocolVersion: WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    purpose: 'independent-ground-truth',
    blinding: {
      providerOutputHidden: true,
      providerIdentityHidden: true,
      modelIdentityHidden: true,
      probabilityHidden: true,
      confidenceHidden: true,
    },
    cases: [
      labeledCase('inspect-a', 'inspect', 'ambiguous', 2, false, 0.2),
      labeledCase('inspect-c', 'inspect', 'novel', 1, false, 0.6),
      labeledCase('routine-b', 'routine', 'matched', 1, true, 0.05),
      labeledCase('routine-d', 'routine', 'matched', 1, true, 0.02),
    ],
  };
}

function localProvider(
  observed: unknown[],
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  return {
    descriptor: {
      id: 'mmi.integration-regression.local-stub',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice', 'fixture'],
    },
    async decide({ observation }): Promise<
      ClosedChoiceProviderResponse<WorksheetReviewRouteChoice>
    > {
      observed.push(structuredClone(observation.payload));
      const state = observation.payload as {
        classification: string;
      };
      const choice: WorksheetReviewRouteChoice =
        state.classification === 'matched' ? 'routine' : 'inspect';
      return {
        status: 'decision',
        choice,
        probability: 0.9,
        confidence: 0.8,
        distribution:
          choice === 'inspect'
            ? { inspect: 0.9, routine: 0.1 }
            : { inspect: 0.1, routine: 0.9 },
      };
    },
  };
}

function comparisonPolicy(
  allowLabelOnly: boolean,
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
      groundTruth: allowLabelOnly,
      summary: allowLabelOnly,
      projectionSeparability: allowLabelOnly,
      reportProvider: false,
    },
    labelOnlyReevaluation: allowLabelOnly ? 'required' : 'forbidden',
  };
}

async function runFixture() {
  const source = corpus();
  const beforeSource = structuredClone(source);
  const observed: unknown[] = [];
  const provider = localProvider(observed);
  const plan = createWorksheetReviewRouteEvaluationPlan(
    source,
    readiness,
    provider.descriptor,
  );
  const beforePlan = structuredClone(plan);
  const completed = await runWorksheetReviewRouteEvaluationPlan(
    source,
    plan,
    provider,
  );
  assert.equal(completed.status, 'completed');
  if (completed.status !== 'completed') {
    throw new Error('Synthetic local evaluation did not complete.');
  }
  const left = createWorksheetReviewRouteEvaluationRecord(
    source,
    plan,
    completed,
  );
  const corrected = structuredClone(source);
  corrected.cases[0]!.adjudication = {
    ...corrected.cases[0]!.adjudication!,
    route: 'routine',
    rationaleCodes: ['CORRECTED_FINAL_ROUTE'],
  };
  const beforeLeft = structuredClone(left);
  const right = reevaluateWorksheetReviewRouteEvaluationRecord(
    corrected,
    left,
  );
  assert.deepEqual(left, beforeLeft);
  assert.deepEqual(source, beforeSource);
  assert.deepEqual(plan, beforePlan);
  return { source, corrected, left, right, plan, provider, observed };
}

test('local run through evaluation record and comparison execution JSON remains linked', async () => {
  const { left, right, plan, observed } = await runFixture();

  assert.equal(observed.length, 4);
  for (const payload of observed) {
    assert.deepEqual(
      Object.keys(payload as Record<string, unknown>).sort(),
      ['candidateCount', 'classification', 'hasWinner', 'noveltyScore'],
    );
  }

  assert.equal(left.report.summary.decisionAccuracy, 1);
  assert.equal(right.report.summary.decisionAccuracy, 0.75);
  assert.equal(left.planDigest, plan.planDigest);
  assert.equal(right.planDigest, left.planDigest);
  assert.equal(right.packetDigest, left.packetDigest);
  assert.deepEqual(right.packet, left.packet);
  assert.deepEqual(right.response, left.response);
  assert.notEqual(right.groundTruthDigest, left.groundTruthDigest);
  assert.notEqual(right.recordDigest, left.recordDigest);

  for (const record of [left, right]) {
    const artifact = prepareWorksheetReviewRouteEvaluationRecordJsonArtifact(
      record,
    );
    assert.deepEqual(
      parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
        artifact.content,
      ),
      record,
    );
    assert.equal(artifact.fileName.includes(
      record.recordDigest.slice('sha256:'.length),
    ), true);
    assert.equal(artifact.content.includes('Source-only private fact'), false);
    assert.equal(artifact.content.includes('annotatorRef'), false);
  }

  const policy = comparisonPolicy(true);
  const comparisonPlan =
    createWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left, right, policy,
    );
  const frozenPlan = parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      comparisonPlan,
    ),
  );
  const completedComparison =
    runWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left, right, frozenPlan,
    );
  assert.equal(completedComparison.status, 'completed');
  assert.equal(completedComparison.result.compliant, true);
  assert.deepEqual(completedComparison.result.violations, []);
  assert.equal(
    completedComparison.result.comparison.groundTruth.labelOnlyReevaluation,
    true,
  );

  const execution =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      frozenPlan, completedComparison,
    );
  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifact(
      execution,
    );
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      artifact.content,
    ),
    execution,
  );
  assert.equal(
    artifact.fileName.includes(
      execution.executionDigest.slice('sha256:'.length),
    ), true,
  );
  assert.equal(artifact.content.includes('Source-only private fact'), false);
  assert.equal(artifact.content.includes('"winner"'), false);
});

test('disallowed label-only delta is a typed noncompliant execution, not an error', async () => {
  const { left, right } = await runFixture();
  const plan = createWorksheetReviewRouteEvaluationRecordComparisonPlan(
    left, right, comparisonPolicy(false),
  );
  const completed =
    runWorksheetReviewRouteEvaluationRecordComparisonPlan(
      left, right, plan,
    );
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.compliant, false);
  assert.equal(
    completed.result.violations.some(
      (entry) => entry.code === 'GROUND_TRUTH_CHANGED',
    ), true,
  );
  assert.equal(
    completed.result.violations.some(
      (entry) => entry.code === 'LABEL_ONLY_REEVALUATION_FORBIDDEN',
    ), true,
  );
  const execution =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      plan, completed,
    );
  assert.equal(execution.result.compliant, false);
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      prepareWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifact(
        execution,
      ).content,
    ),
    execution,
  );
});

test('stale source, regressed readiness, record substitution and codec tamper fail closed', async () => {
  const { source, left, right, plan, provider, observed } =
    await runFixture();
  const initialProviderCalls = observed.length;

  const stale = structuredClone(source);
  stale.cases[0]!.projectionState = {
    ...stale.cases[0]!.projectionState!,
    noveltyScore: 0.25,
  };
  assert.throws(
    () => reevaluateWorksheetReviewRouteEvaluationRecord(stale, left),
    /stale/,
  );

  const regressed = structuredClone(source);
  regressed.cases[0]!.adjudication = undefined;
  const blocked = await runWorksheetReviewRouteEvaluationPlan(
    regressed, plan, provider,
  );
  assert.equal(blocked.status, 'blocked');
  assert.equal(observed.length, initialProviderCalls);

  const directional = createWorksheetReviewRouteEvaluationRecordComparisonPlan(
    left, right, comparisonPolicy(true),
  );
  assert.throws(
    () => runWorksheetReviewRouteEvaluationRecordComparisonPlan(
      right, right, directional,
    ),
    /left record does not match/,
  );

  const tampered = {
    ...right,
    recordDigest: 'sha256:' + '0'.repeat(64),
  };
  assert.throws(
    () => parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      JSON.stringify(tampered),
    ),
    /digest does not match/,
  );
  assert.doesNotThrow(
    () => assertWorksheetReviewRouteEvaluationRecord(left),
  );
});


test('a provider abstention stays a typed non-decision through record and offline replay', async () => {
  const source = corpus();
  const observed: unknown[] = [];
  const base = localProvider(observed);
  const abstaining: ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> = {
    descriptor: base.descriptor,
    async decide(request) {
      if (request.observation.id === 'inspect-c') {
        observed.push(structuredClone(request.observation.payload));
        return {
          status: 'abstained',
          reasonCode: 'LOW_INFORMATION',
        };
      }
      return base.decide(request);
    },
  };
  const plan = createWorksheetReviewRouteEvaluationPlan(
    source, readiness, abstaining.descriptor,
  );
  const completed = await runWorksheetReviewRouteEvaluationPlan(
    source, plan, abstaining,
  );
  assert.equal(completed.status, 'completed');
  if (completed.status !== 'completed') {
    throw new Error('Synthetic abstention run did not complete.');
  }
  const record = createWorksheetReviewRouteEvaluationRecord(
    source, plan, completed,
  );
  assert.equal(record.report.summary.decisionCoverage, 0.75);
  assert.equal(record.report.summary.nonDecisionCases, 1);
  assert.equal(record.report.summary.decisionAccuracy, 1);
  assert.deepEqual(
    record.response.outcomes
      .filter((entry) => entry.outcome.status === 'abstained')
      .map((entry) => entry.caseId),
    ['inspect-c'],
  );
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
      prepareWorksheetReviewRouteEvaluationRecordJsonArtifact(
        record,
      ).content,
    ),
    record,
  );

  const corrected = structuredClone(source);
  corrected.cases[0]!.adjudication = {
    ...corrected.cases[0]!.adjudication!,
    route: 'routine',
    rationaleCodes: ['CORRECTED_FINAL_ROUTE'],
  };
  const replayed = reevaluateWorksheetReviewRouteEvaluationRecord(
    corrected, record,
  );
  assert.equal(observed.length, 4);
  assert.equal(replayed.report.summary.nonDecisionCases, 1);
  assert.equal(replayed.report.summary.decisionAccuracy, 0.666667);
  assert.deepEqual(replayed.response, record.response);
});
