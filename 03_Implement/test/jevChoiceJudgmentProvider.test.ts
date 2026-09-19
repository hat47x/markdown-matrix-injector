import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import {
  runClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import {
  createJevChoiceJudgmentProvider,
  type JevSystemOneChoiceRequest,
  type JevSystemOneTransport,
} from '../src/experimental/jevChoiceJudgmentProvider.js';
import type {
  ClosedChoiceQuestion,
} from '../src/experimental/closedChoiceJudgment.js';

type Choice = 'columns' | 'grep';

const question: ClosedChoiceQuestion<Choice> = {
  id: 'mmi-authoring-intent-v1',
  semantics: 'Which supported MMI operation matches the request?',
  choices: ['columns', 'grep'],
};

function observation(): CognitiveObservation<{
  text: string;
  secret?: string;
}> {
  return {
    id: 'intent',
    kind: 'mmi-authoring-intent',
    schemaVersion: 'mmi-authoring-intent-v1',
    payload: {
      text: '要確認だけを表示したい',
      secret: 'must-not-be-sent-by-projector',
    },
    provenance: {
      sourceKind: 'user-intent',
      sourceDigest: 'sha256:intent',
    },
  };
}

function config(
  model?: string,
) {
  return {
    ...(model === undefined ? {} : { model }),
    projectState(obs: CognitiveObservation) {
      return {
        text: (obs.payload as { text: string }).text,
      };
    },
    describeChoice(choice: Choice) {
      return choice === 'columns'
        ? 'Select a subset of columns.'
        : 'Filter rows by text matching.';
    },
  };
}

function validResponse() {
  return {
    model: 'jev-latest',
    answers: {
      decision: {
        type: 'choice',
        choice: 'grep',
        probabilities: {
          columns: 0.2,
          grep: 0.8,
        },
        confidence: 0.7,
      },
    },
    usage: {
      input_tokens: 10,
      output_tokens: 5,
    },
  };
}

test('maps MMI Observation and Question to the official Jev Choice request shape', async () => {
  let seen: JevSystemOneChoiceRequest | undefined;

  const transport: JevSystemOneTransport = {
    async evaluate(request) {
      seen = structuredClone(request);
      return validResponse();
    },
  };

  const provider = createJevChoiceJudgmentProvider(
    config(),
    transport,
  );

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    question,
    { allowExternal: true },
  );

  assert.deepEqual(seen, {
    state: {
      text: '要確認だけを表示したい',
    },
    model: 'jev-latest',
    questions: {
      decision: {
        type: 'choice',
        instructions:
          'Which supported MMI operation matches the request?',
        criteria: {
          columns: 'Select a subset of columns.',
          grep: 'Filter rows by text matching.',
        },
      },
    },
  });
  assert.equal(
    JSON.stringify(seen).includes('must-not-be-sent'),
    false,
  );
  assert.equal(outcome.status, 'signal');
  assert.equal(outcome.signal.payload.choice, 'grep');
  assert.equal(outcome.signal.payload.probability, 0.8);
  assert.equal(outcome.provider.version, 'jev-latest');
});

test('uses an explicitly pinned model id in request and provider provenance', async () => {
  let model = '';
  const provider = createJevChoiceJudgmentProvider(
    config('jev-1.13.0'),
    {
      async evaluate(request) {
        model = request.model;
        return {
          ...validResponse(),
          model: 'jev-1.13.0',
        };
      },
    },
  );

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    question,
    { allowExternal: true },
  );

  assert.equal(model, 'jev-1.13.0');
  assert.equal(outcome.provider.version, 'jev-1.13.0');
});

test('external opt-in gate prevents the transport from being called', async () => {
  let calls = 0;
  const provider = createJevChoiceJudgmentProvider(
    config(),
    {
      async evaluate() {
        calls += 1;
        return validResponse();
      },
    },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
    ),
    /explicit opt-in/,
  );
  assert.equal(calls, 0);
});

test('accepts 255 choices and rejects 256 before transport', async () => {
  const choices255 = Array.from(
    { length: 255 },
    (_, index) => `c${index}`,
  );
  const choices256 = [
    ...choices255,
    'c255',
  ];

  let calls = 0;
  const provider = createJevChoiceJudgmentProvider(
    {
      projectState() {
        return 'state';
      },
      describeChoice() {
        return null;
      },
    },
    {
      async evaluate(request) {
        calls += 1;
        const keys = Object.keys(
          request.questions.decision.criteria,
        );
        const probabilities = Object.fromEntries(
          keys.map((key) => [
            key,
            key === keys[0] ? 1 : 0,
          ]),
        );
        return {
          model: 'jev-latest',
          answers: {
            decision: {
              type: 'choice',
              choice: keys[0],
              probabilities,
              confidence: 1,
            },
          },
        };
      },
    },
  );

  const q255: ClosedChoiceQuestion<string> = {
    id: 'max',
    semantics: 'Pick one.',
    choices: choices255,
  };

  const out = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    q255,
    { allowExternal: true },
  );
  assert.equal(out.status, 'signal');
  assert.equal(calls, 1);

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      {
        ...q255,
        choices: choices256,
      },
      { allowExternal: true },
    ),
    /at most 255 options/,
  );
  assert.equal(calls, 1);
});

test('rejects invalid projected state before transport', async () => {
  let calls = 0;

  const provider = createJevChoiceJudgmentProvider(
    {
      projectState() {
        return {
          value: Number.POSITIVE_INFINITY,
        };
      },
      describeChoice() {
        return null;
      },
    },
    {
      async evaluate() {
        calls += 1;
        return validResponse();
      },
    },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
      { allowExternal: true },
    ),
    /numbers must be finite/,
  );
  assert.equal(calls, 0);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  const cyclicProvider = createJevChoiceJudgmentProvider(
    {
      projectState() {
        return cyclic as never;
      },
      describeChoice() {
        return null;
      },
    },
    {
      async evaluate() {
        calls += 1;
        return validResponse();
      },
    },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      cyclicProvider,
      observation(),
      question,
      { allowExternal: true },
    ),
    /must not contain cycles/,
  );
  assert.equal(calls, 0);
});

test('rejects malformed Jev answer shape before generic response adaptation', async () => {
  const provider = createJevChoiceJudgmentProvider(
    config(),
    {
      async evaluate() {
        return {
          model: 'jev-latest',
          answers: {
            decision: {
              type: 'score',
              score: 1,
            },
          },
        };
      },
    },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
      { allowExternal: true },
    ),
    /answer type must be choice/,
  );
});

test('lets the existing closed-choice adapter reject invalid probability distributions', async () => {
  const provider = createJevChoiceJudgmentProvider(
    config(),
    {
      async evaluate() {
        return {
          model: 'jev-latest',
          answers: {
            decision: {
              type: 'choice',
              choice: 'grep',
              probabilities: {
                columns: 0.8,
                grep: 0.8,
              },
              confidence: 0.7,
            },
          },
        };
      },
    },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
      { allowExternal: true },
    ),
    /sum to 1/,
  );
});

test('transport errors propagate without adapter-level retry or unavailable conversion', async () => {
  const provider = createJevChoiceJudgmentProvider(
    config(),
    {
      async evaluate() {
        throw new Error('jev transport failed');
      },
    },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
      { allowExternal: true },
    ),
    /jev transport failed/,
  );
});

test('rejects blank model/provider ids and blank criteria descriptions', async () => {
  assert.throws(
    () => createJevChoiceJudgmentProvider(
      config('   '),
      { async evaluate() { return validResponse(); } },
    ),
    /model id must not be empty/,
  );

  assert.throws(
    () => createJevChoiceJudgmentProvider(
      {
        ...config(),
        providerId: '   ',
      },
      { async evaluate() { return validResponse(); } },
    ),
    /provider id must not be empty/,
  );

  const provider = createJevChoiceJudgmentProvider(
    {
      projectState() {
        return 'state';
      },
      describeChoice() {
        return '   ';
      },
    },
    { async evaluate() { return validResponse(); } },
  );

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
      { allowExternal: true },
    ),
    /criterion must be non-empty or null/,
  );
});
