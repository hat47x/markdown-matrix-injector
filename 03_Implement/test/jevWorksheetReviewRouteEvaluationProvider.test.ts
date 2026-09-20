import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import {
  WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION,
} from '../src/experimental/containedUnifiedReviewWorkflow.js';
import type {
  JevSystemOneChoiceRequest,
  JevSystemOneTransport,
} from '../src/experimental/jevChoiceJudgmentProvider.js';
import {
  createJevWorksheetReviewRouteProvider,
  WORKSHEET_REVIEW_ROUTE_QUESTION,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';
import {
  createJevWorksheetReviewRouteEvaluationProvider,
} from '../src/experimental/jevWorksheetReviewRouteEvaluationProvider.js';
import {
  createWorksheetReviewRouteEvaluationObservation,
  projectWorksheetReviewRouteEvaluationState,
} from '../src/experimental/worksheetReviewRouteEvaluationObservation.js';

function response() {
  return {
    model: 'jev-1.13.0',
    answers: {
      decision: {
        type: 'choice',
        choice: 'routine',
        probabilities: {
          inspect: 0.1,
          routine: 0.9,
        },
        confidence: 0.8,
      },
    },
  };
}

test('evaluation Jev adapter emits the same state and Choice request as production for equivalent state', async () => {
  let productionRequest:
    JevSystemOneChoiceRequest | undefined;
  let evaluationRequest:
    JevSystemOneChoiceRequest | undefined;

  const productionTransport: JevSystemOneTransport = {
    async evaluate(request) {
      productionRequest = structuredClone(request);
      return response();
    },
  };
  const evaluationTransport: JevSystemOneTransport = {
    async evaluate(request) {
      evaluationRequest = structuredClone(request);
      return response();
    },
  };

  const options = {
    model: 'jev-1.13.0',
    providerId: 'mmi.typesafe.jev.review-route',
  };

  const production =
    createJevWorksheetReviewRouteProvider(
      productionTransport,
      options,
    );
  const evaluation =
    createJevWorksheetReviewRouteEvaluationProvider(
      evaluationTransport,
      options,
    );

  const productionObservation: CognitiveObservation = {
    id: 'production-case',
    kind: 'worksheet-format-review-route',
    schemaVersion:
      WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION,
    payload: {
      kind: 'worksheet-format-review-route',
      sheetName: 'Internal Sheet Name',
      classification: 'matched',
      candidateIds: ['internal-profile-id'],
      winnerPrototypeId: 'internal-profile-id',
      noveltyScore: 0.05,
    },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest:
        `sha256:${'1'.repeat(64)}`,
    },
  };

  const evaluationObservation =
    createWorksheetReviewRouteEvaluationObservation({
      id: 'evaluation-case',
      caseDigest:
        `sha256:${'2'.repeat(64)}`,
      state: {
        classification: 'matched',
        candidateCount: 1,
        hasWinner: true,
        noveltyScore: 0.05,
      },
    });

  await production.decide({
    observation: productionObservation,
    question: WORKSHEET_REVIEW_ROUTE_QUESTION,
  });
  await evaluation.decide({
    observation: evaluationObservation,
    question: WORKSHEET_REVIEW_ROUTE_QUESTION,
  });

  assert.deepEqual(
    evaluationRequest,
    productionRequest,
  );
  assert.deepEqual(evaluationRequest?.state, {
    classification: 'matched',
    candidateCount: 1,
    hasWinner: true,
    noveltyScore: 0.05,
  });

  const serialized =
    JSON.stringify(evaluationRequest);
  assert.equal(
    serialized.includes('Internal Sheet Name'),
    false,
  );
  assert.equal(
    serialized.includes('internal-profile-id'),
    false,
  );
});

test('evaluation observation contract rejects extra or malformed state instead of inventing production identifiers', () => {
  const valid =
    createWorksheetReviewRouteEvaluationObservation({
      id: 'case-a',
      caseDigest:
        `sha256:${'a'.repeat(64)}`,
      state: {
        classification: 'ambiguous',
        candidateCount: 2,
        hasWinner: false,
        noveltyScore: 0.3,
      },
    });

  assert.deepEqual(
    projectWorksheetReviewRouteEvaluationState(valid),
    {
      classification: 'ambiguous',
      candidateCount: 2,
      hasWinner: false,
      noveltyScore: 0.3,
    },
  );

  assert.throws(
    () => projectWorksheetReviewRouteEvaluationState({
      ...valid,
      payload: {
        ...valid.payload,
        sheetName: 'do-not-invent',
      },
    }),
    /Unknown worksheet review-route evaluation state field/,
  );

  assert.throws(
    () => createWorksheetReviewRouteEvaluationObservation({
      id: 'case-b',
      caseDigest:
        `sha256:${'b'.repeat(64)}`,
      state: {
        classification: 'matched',
        candidateCount: 0,
        hasWinner: true,
        noveltyScore: 0.1,
      },
    }),
    /cannot have a winner without candidates/,
  );
});
