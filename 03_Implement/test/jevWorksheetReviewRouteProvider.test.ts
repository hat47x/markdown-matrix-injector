import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import {
  runClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import {
  WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION,
  type WorksheetFormatReviewRoutePayload,
} from '../src/experimental/containedUnifiedReviewWorkflow.js';
import type {
  JevSystemOneChoiceRequest,
  JevSystemOneTransport,
} from '../src/experimental/jevChoiceJudgmentProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_POLICY,
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  createJevWorksheetReviewRouteProvider,
  projectWorksheetReviewRouteState,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';

function observation(): CognitiveObservation<
  WorksheetFormatReviewRoutePayload
> {
  return {
    id: 'source:review-route',
    kind: 'worksheet-format-review-route',
    schemaVersion:
      WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION,
    payload: {
      kind: 'worksheet-format-review-route',
      sheetName: 'Secret Sheet Name',
      classification: 'ambiguous',
      candidateIds: [
        'internal-profile-a',
        'internal-profile-b',
      ],
      noveltyScore: 0.31,
    },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest: 'sha256:secret-source-digest',
      featureVersion: 'worksheet-format-v6',
      sourceProfileId: 'internal-source-profile',
    },
  };
}

function response(choice: 'inspect' | 'routine') {
  return {
    model: 'jev-latest',
    answers: {
      decision: {
        type: 'choice',
        choice,
        probabilities: choice === 'inspect'
          ? { inspect: 0.8, routine: 0.2 }
          : { inspect: 0.2, routine: 0.8 },
        confidence: 0.7,
      },
    },
  };
}

test('projects only minimized non-identifying review-route state', () => {
  const state = projectWorksheetReviewRouteState(
    observation(),
  );

  assert.deepEqual(state, {
    classification: 'ambiguous',
    candidateCount: 2,
    hasWinner: false,
    noveltyScore: 0.31,
  });

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes('Secret Sheet Name'), false);
  assert.equal(serialized.includes('internal-profile'), false);
  assert.equal(serialized.includes('secret-source-digest'), false);
  assert.equal(serialized.includes('worksheet-format-v6'), false);
});

test('fixes inspect and routine as human-review-only routes', () => {
  assert.deepEqual(
    WORKSHEET_REVIEW_ROUTE_POLICY.inspect,
    {
      attention: 'elevated',
      humanReviewRequired: true,
      applyAuthority: 'none',
      automaticDecision: 'none',
    },
  );
  assert.deepEqual(
    WORKSHEET_REVIEW_ROUTE_POLICY.routine,
    {
      attention: 'standard',
      humanReviewRequired: true,
      applyAuthority: 'none',
      automaticDecision: 'none',
    },
  );
});

test('maps the canonical route question and criteria into Jev Choice', async () => {
  let seen: JevSystemOneChoiceRequest | undefined;
  const transport: JevSystemOneTransport = {
    async evaluate(request) {
      seen = structuredClone(request);
      return response('inspect');
    },
  };

  const provider =
    createJevWorksheetReviewRouteProvider(transport);

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    WORKSHEET_REVIEW_ROUTE_QUESTION,
    { allowExternal: true },
  );

  assert.ok(seen);
  assert.deepEqual(seen.state, {
    classification: 'ambiguous',
    candidateCount: 2,
    hasWinner: false,
    noveltyScore: 0.31,
  });
  assert.equal(
    seen.questions.decision.instructions,
    WORKSHEET_REVIEW_ROUTE_QUESTION.semantics,
  );
  assert.deepEqual(
    seen.questions.decision.criteria,
    {
      inspect:
        'Use the higher-attention human-review route. This does not mean reject.',
      routine:
        'Use the standard human-review route. This does not mean accept, approve, or authorize apply.',
    },
  );

  assert.equal(outcome.status, 'signal');
  assert.equal(outcome.signal.payload.choice, 'inspect');
  assert.equal(
    outcome.signal.payload.disposition,
    'proposal-only',
  );
});

test('routine remains proposal-only and never gains apply authority', async () => {
  const provider = createJevWorksheetReviewRouteProvider({
    async evaluate() {
      return response('routine');
    },
  });

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    WORKSHEET_REVIEW_ROUTE_QUESTION,
    { allowExternal: true },
  );

  assert.equal(outcome.status, 'signal');
  assert.equal(outcome.signal.payload.choice, 'routine');
  assert.equal(
    outcome.signal.payload.disposition,
    'proposal-only',
  );
  assert.equal(
    WORKSHEET_REVIEW_ROUTE_POLICY.routine.applyAuthority,
    'none',
  );
  assert.equal(
    WORKSHEET_REVIEW_ROUTE_POLICY.routine.humanReviewRequired,
    true,
  );
});

test('rejects non-canonical review-route Observation before transport', async () => {
  let calls = 0;
  const provider = createJevWorksheetReviewRouteProvider({
    async evaluate() {
      calls += 1;
      return response('inspect');
    },
  });

  const wrongKind = {
    ...observation(),
    kind: 'worksheet-format',
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      wrongKind,
      WORKSHEET_REVIEW_ROUTE_QUESTION,
      { allowExternal: true },
    ),
    /canonical review-route Observation/,
  );
  assert.equal(calls, 0);
});

test('rejects malformed review-route payload before transport', async () => {
  let calls = 0;
  const provider = createJevWorksheetReviewRouteProvider({
    async evaluate() {
      calls += 1;
      return response('inspect');
    },
  });
  const malformed = {
    ...observation(),
    payload: {
      ...observation().payload,
      noveltyScore: 2,
    },
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      malformed,
      WORKSHEET_REVIEW_ROUTE_QUESTION,
      { allowExternal: true },
    ),
    /Invalid worksheet review-route Observation payload/,
  );
  assert.equal(calls, 0);
});

test('propagates pinned model and provider id through the generic Jev adapter', async () => {
  let seenModel = '';
  const provider = createJevWorksheetReviewRouteProvider(
    {
      async evaluate(request) {
        seenModel = request.model;
        return {
          ...response('routine'),
          model: 'jev-1.13.0',
        };
      },
    },
    {
      model: 'jev-1.13.0',
      providerId: 'mmi.typesafe.jev.review-route',
    },
  );

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    WORKSHEET_REVIEW_ROUTE_QUESTION,
    { allowExternal: true },
  );

  assert.equal(seenModel, 'jev-1.13.0');
  assert.equal(
    outcome.provider.id,
    'mmi.typesafe.jev.review-route',
  );
  assert.equal(outcome.provider.version, 'jev-1.13.0');
});

test('still requires explicit external opt-in before transport', async () => {
  let calls = 0;
  const provider = createJevWorksheetReviewRouteProvider({
    async evaluate() {
      calls += 1;
      return response('inspect');
    },
  });

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      WORKSHEET_REVIEW_ROUTE_QUESTION,
    ),
    /explicit opt-in/,
  );
  assert.equal(calls, 0);
});
