import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
  CognitiveProviderDescriptor,
} from '../src/experimental/cognitiveContract.js';
import {
  adaptClosedChoiceResponse,
  type ClosedChoiceJudgmentOutcome,
} from '../src/experimental/closedChoiceJudgment.js';
import {
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  type JevWorksheetReviewRouteState,
  type WorksheetReviewRouteChoice,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';
import {
  analyzeWorksheetReviewRouteProjectionSeparability,
  evaluateWorksheetReviewRouteOutcomes,
} from '../src/experimental/worksheetReviewRouteEvaluation.js';

const provider: CognitiveProviderDescriptor = {
  id: 'mmi.route-eval.stub',
  version: '1',
  category: 'judgment',
  executionBoundary: 'local',
  capabilities: ['closed-choice'],
};

function observation(
  id: string,
): CognitiveObservation {
  return {
    id,
    kind: 'worksheet-format-review-route',
    schemaVersion: 'worksheet-format-review-route-v1',
    payload: { fixture: true },
    provenance: {
      sourceKind: 'evaluation-fixture',
      sourceDigest: `sha256:${id}`,
    },
  };
}

function decision(
  id: string,
  choice: WorksheetReviewRouteChoice,
  probability: number,
  confidence: number,
): ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice> {
  return adaptClosedChoiceResponse(
    observation(id),
    provider,
    WORKSHEET_REVIEW_ROUTE_QUESTION,
    {
      status: 'decision',
      choice,
      probability,
      confidence,
      distribution: choice === 'inspect'
        ? {
            inspect: probability,
            routine: 1 - probability,
          }
        : {
            inspect: 1 - probability,
            routine: probability,
          },
    },
  );
}

function abstained(
  id: string,
): ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice> {
  return adaptClosedChoiceResponse(
    observation(id),
    provider,
    WORKSHEET_REVIEW_ROUTE_QUESTION,
    {
      status: 'abstained',
      reasonCode: 'LOW_INFORMATION',
      confidence: 0.2,
    },
  );
}

test('separates coverage, asymmetric route errors, and conservative fallback', () => {
  const result = evaluateWorksheetReviewRouteOutcomes([
    {
      id: 'inspect-correct',
      expectedRoute: 'inspect',
      outcome: decision(
        'inspect-correct',
        'inspect',
        0.9,
        0.8,
      ),
    },
    {
      id: 'unsafe-routine',
      expectedRoute: 'inspect',
      outcome: decision(
        'unsafe-routine',
        'routine',
        0.7,
        0.9,
      ),
    },
    {
      id: 'routine-correct',
      expectedRoute: 'routine',
      outcome: decision(
        'routine-correct',
        'routine',
        0.8,
        0.75,
      ),
    },
    {
      id: 'unnecessary-inspect',
      expectedRoute: 'routine',
      outcome: decision(
        'unnecessary-inspect',
        'inspect',
        0.6,
        0.65,
      ),
    },
    {
      id: 'inspect-abstain',
      expectedRoute: 'inspect',
      outcome: abstained('inspect-abstain'),
    },
    {
      id: 'routine-abstain',
      expectedRoute: 'routine',
      outcome: abstained('routine-abstain'),
    },
  ]);

  assert.equal(result.cases, 6);
  assert.equal(result.expectedInspectCases, 3);
  assert.equal(result.expectedRoutineCases, 3);
  assert.equal(result.decisionCases, 4);
  assert.equal(result.nonDecisionCases, 2);
  assert.equal(result.decisionCoverage, 0.666667);
  assert.equal(result.correctDecisionCases, 2);
  assert.equal(result.incorrectDecisionCases, 2);
  assert.equal(result.decisionAccuracy, 0.5);
  assert.equal(result.inspectRecall, 0.333333);
  assert.equal(result.routineRecall, 0.333333);
  assert.equal(result.unsafeRoutineCases, 1);
  assert.equal(result.unsafeRoutineRate, 0.333333);
  assert.equal(result.unnecessaryInspectCases, 1);
  assert.equal(result.unnecessaryInspectRate, 0.333333);

  assert.equal(result.conservativeCorrectCases, 3);
  assert.equal(result.conservativeAccuracy, 0.5);
  assert.equal(result.conservativeUnsafeRoutineCases, 1);
  assert.equal(
    result.conservativeUnsafeRoutineRate,
    0.333333,
  );
  assert.equal(result.conservativeExtraInspectCases, 2);
  assert.equal(
    result.conservativeExtraInspectRate,
    0.666667,
  );
});

test('computes inspect-probability Brier score separately from provider confidence', () => {
  const result = evaluateWorksheetReviewRouteOutcomes([
    {
      id: 'inspect-good',
      expectedRoute: 'inspect',
      outcome: decision(
        'inspect-good',
        'inspect',
        0.9,
        0.55,
      ),
    },
    {
      id: 'routine-good',
      expectedRoute: 'routine',
      outcome: decision(
        'routine-good',
        'routine',
        0.8,
        0.95,
      ),
    },
  ]);

  // P(inspect): 0.9 for y=1, 0.2 for y=0
  assert.equal(
    result.inspectBinaryBrierScore,
    0.025,
  );
  assert.equal(result.meanSelectedProbability, 0.85);
  assert.equal(result.meanProviderConfidence, 0.75);
  assert.equal(result.decisionAccuracy, 1);
});

test('returns null decision metrics rather than NaN when every case is non-decision', () => {
  const result = evaluateWorksheetReviewRouteOutcomes([
    {
      id: 'inspect-abstain',
      expectedRoute: 'inspect',
      outcome: abstained('inspect-abstain'),
    },
    {
      id: 'routine-abstain',
      expectedRoute: 'routine',
      outcome: abstained('routine-abstain'),
    },
  ]);

  assert.equal(result.decisionCases, 0);
  assert.equal(result.decisionCoverage, 0);
  assert.equal(result.decisionAccuracy, null);
  assert.equal(result.inspectBinaryBrierScore, null);
  assert.equal(result.meanSelectedProbability, null);
  assert.equal(result.meanProviderConfidence, null);
  assert.equal(result.conservativeAccuracy, 0.5);
});

test('returns null class rates when the corpus has no cases for that expected route', () => {
  const result = evaluateWorksheetReviewRouteOutcomes([
    {
      id: 'routine-only',
      expectedRoute: 'routine',
      outcome: decision(
        'routine-only',
        'routine',
        0.8,
        0.7,
      ),
    },
  ]);

  assert.equal(result.inspectRecall, null);
  assert.equal(result.unsafeRoutineRate, null);
  assert.equal(result.routineRecall, 1);
  assert.equal(result.unnecessaryInspectRate, 0);
});

test('rejects error outcomes and malformed/missing decision confidence', () => {
  const base = decision(
    'base',
    'inspect',
    0.8,
    0.7,
  );

  assert.throws(
    () => evaluateWorksheetReviewRouteOutcomes([
      {
        id: 'error',
        expectedRoute: 'inspect',
        outcome: {
          status: 'error',
          provider,
          observation: {
            id: 'error',
            sourceDigest: 'sha256:error',
            schemaVersion: 'worksheet-format-review-route-v1',
          },
          reasonCode: 'PROVIDER_ERROR',
        },
      },
    ]),
    /Unsupported worksheet review-route non-decision/,
  );

  if (base.status !== 'signal') {
    throw new Error('fixture must be a signal');
  }

  assert.throws(
    () => evaluateWorksheetReviewRouteOutcomes([
      {
        id: 'missing-confidence',
        expectedRoute: 'inspect',
        outcome: {
          ...base,
          signal: {
            ...base.signal,
            scores: base.signal.scores?.filter(
              (score) =>
                score.name !== 'provider-confidence',
            ),
          },
        },
      },
    ]),
    /exactly one provider-confidence/,
  );
});

test('detects exact-state conflicting labels and computes the state-only oracle upper bound', () => {
  const shared: JevWorksheetReviewRouteState = {
    classification: 'matched',
    candidateCount: 1,
    hasWinner: true,
    noveltyScore: 0.1,
  };
  const inspectOnly: JevWorksheetReviewRouteState = {
    classification: 'ambiguous',
    candidateCount: 2,
    hasWinner: false,
    noveltyScore: 0.2,
  };

  const result =
    analyzeWorksheetReviewRouteProjectionSeparability([
      {
        id: 'same-state-routine-a',
        state: shared,
        expectedRoute: 'routine',
      },
      {
        id: 'same-state-routine-b',
        state: shared,
        expectedRoute: 'routine',
      },
      {
        id: 'same-state-inspect',
        state: shared,
        expectedRoute: 'inspect',
      },
      {
        id: 'inspect-only',
        state: inspectOnly,
        expectedRoute: 'inspect',
      },
    ]);

  assert.equal(result.cases, 4);
  assert.equal(result.exactStateGroups, 2);
  assert.equal(result.conflictingGroups, 1);
  assert.equal(result.casesInConflictingGroups, 3);
  assert.equal(result.exactStateOracleMaxCorrect, 3);
  assert.equal(result.exactStateOracleMaxAccuracy, 0.75);

  const conflict = result.groups.find(
    (group) => group.conflictingLabels,
  );
  assert.deepEqual(conflict?.caseIds, [
    'same-state-routine-a',
    'same-state-routine-b',
    'same-state-inspect',
  ]);
  assert.equal(conflict?.inspectCases, 1);
  assert.equal(conflict?.routineCases, 2);
});

test('reports perfect exact-state separability when labels do not conflict', () => {
  const result =
    analyzeWorksheetReviewRouteProjectionSeparability([
      {
        id: 'routine-a',
        state: {
          classification: 'matched',
          candidateCount: 1,
          hasWinner: true,
          noveltyScore: 0.05,
        },
        expectedRoute: 'routine',
      },
      {
        id: 'routine-b',
        state: {
          classification: 'matched',
          candidateCount: 1,
          hasWinner: true,
          noveltyScore: 0.05,
        },
        expectedRoute: 'routine',
      },
      {
        id: 'inspect',
        state: {
          classification: 'novel',
          candidateCount: 1,
          hasWinner: false,
          noveltyScore: 0.5,
        },
        expectedRoute: 'inspect',
      },
    ]);

  assert.equal(result.conflictingGroups, 0);
  assert.equal(result.casesInConflictingGroups, 0);
  assert.equal(result.exactStateOracleMaxCorrect, 3);
  assert.equal(result.exactStateOracleMaxAccuracy, 1);
});

test('does not mutate evaluation inputs', () => {
  const cases = [{
    id: 'immutable',
    expectedRoute: 'inspect' as const,
    outcome: decision(
      'immutable',
      'inspect',
      0.8,
      0.7,
    ),
  }];
  const before = structuredClone(cases);

  evaluateWorksheetReviewRouteOutcomes(cases);

  assert.deepEqual(cases, before);
});
