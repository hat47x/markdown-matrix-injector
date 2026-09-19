import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
  CognitiveProviderDescriptor,
} from '../src/experimental/cognitiveContract.js';
import {
  ExternalCognitiveProviderOptInRequiredError,
  runClosedChoiceJudgmentProvider,
  type ClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import type {
  ClosedChoiceQuestion,
} from '../src/experimental/closedChoiceJudgment.js';

type Choice = 'columns' | 'grep';

const question: ClosedChoiceQuestion<Choice> = {
  id: 'mmi-intent-v1',
  semantics: 'Choose the supported MMI operation.',
  choices: ['columns', 'grep'],
};

function observation(): CognitiveObservation<{ text: string }> {
  return {
    id: 'intent-observation',
    kind: 'mmi-authoring-intent',
    schemaVersion: 'mmi-authoring-intent-v1',
    payload: { text: '要確認だけを表示したい' },
    provenance: {
      sourceKind: 'user-intent',
      sourceDigest: 'sha256:intent',
    },
  };
}

function descriptor(
  boundary: 'local' | 'external-opt-in' = 'local',
): CognitiveProviderDescriptor {
  return {
    id: 'mmi.closed-choice.provider-test',
    version: '1',
    category: 'judgment',
    executionBoundary: boundary,
    capabilities: ['closed-choice'],
  };
}

function decisionProvider(
  boundary: 'local' | 'external-opt-in' = 'local',
): ClosedChoiceJudgmentProvider<Choice> {
  return {
    descriptor: descriptor(boundary),
    async decide() {
      return {
        status: 'decision',
        choice: 'grep',
        probability: 0.8,
        confidence: 0.7,
        distribution: {
          columns: 0.2,
          grep: 0.8,
        },
      };
    },
  };
}

test('runs a local provider and returns proposal-only Judgment', async () => {
  const outcome = await runClosedChoiceJudgmentProvider(
    decisionProvider(),
    observation(),
    question,
  );

  assert.equal(outcome.status, 'signal');
  assert.equal(outcome.signal.payload.choice, 'grep');
  assert.equal(outcome.signal.payload.disposition, 'proposal-only');
});

test('preserves explicit provider abstention', async () => {
  const provider: ClosedChoiceJudgmentProvider<Choice> = {
    descriptor: descriptor(),
    async decide() {
      return {
        status: 'abstained',
        reasonCode: 'LOW_INFORMATION',
        confidence: 0.2,
      };
    },
  };

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    question,
  );

  assert.equal(outcome.status, 'abstained');
  assert.equal(outcome.reasonCode, 'LOW_INFORMATION');
});

test('does not call external provider without explicit opt-in', async () => {
  let calls = 0;
  const provider = decisionProvider('external-opt-in');
  provider.decide = async () => {
    calls += 1;
    return {
      status: 'unsupported',
      reasonCode: 'SHOULD_NOT_RUN',
    };
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
    ),
    ExternalCognitiveProviderOptInRequiredError,
  );
  assert.equal(calls, 0);
});

test('runs external provider only when allowExternal is true', async () => {
  let calls = 0;
  const provider = decisionProvider('external-opt-in');
  const original = provider.decide;
  provider.decide = async (request) => {
    calls += 1;
    return original(request);
  };

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    question,
    { allowExternal: true },
  );

  assert.equal(calls, 1);
  assert.equal(outcome.status, 'signal');
});

test('rejects invalid provider descriptor before provider invocation', async () => {
  let calls = 0;
  const provider = decisionProvider();
  provider.descriptor = {
    ...provider.descriptor,
    category: 'perception',
  };
  provider.decide = async () => {
    calls += 1;
    return {
      status: 'unsupported',
      reasonCode: 'SHOULD_NOT_RUN',
    };
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
    ),
    /judgment category/,
  );
  assert.equal(calls, 0);

  provider.descriptor = {
    ...descriptor(),
    capabilities: ['other'],
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
    ),
    /closed-choice capability/,
  );
  assert.equal(calls, 0);
});

test('isolates caller Observation and Question from provider mutation', async () => {
  const obs = observation();
  const q = structuredClone(question);
  const obsBefore = structuredClone(obs);
  const qBefore = structuredClone(q);

  const provider: ClosedChoiceJudgmentProvider<Choice> = {
    descriptor: descriptor(),
    async decide(request) {
      (request.observation.payload as { text: string }).text = 'mutated';
      (request.question.choices as Choice[])[0] = 'grep';
      return {
        status: 'decision',
        choice: 'grep',
        probability: 0.8,
        confidence: 0.7,
        distribution: {
          columns: 0.2,
          grep: 0.8,
        },
      };
    },
  };

  await runClosedChoiceJudgmentProvider(provider, obs, q);

  assert.deepEqual(obs, obsBefore);
  assert.deepEqual(q, qBefore);
});

test('uses the pre-call provider descriptor snapshot for Outcome provenance', async () => {
  const provider = decisionProvider();
  const decide = provider.decide;

  provider.decide = async (request) => {
    provider.descriptor = {
      id: 'mutated-provider',
      version: '999',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice'],
    };
    return decide(request);
  };

  const outcome = await runClosedChoiceJudgmentProvider(
    provider,
    observation(),
    question,
  );

  assert.equal(outcome.provider.id, 'mmi.closed-choice.provider-test');
  assert.equal(outcome.provider.version, '1');
});

test('malformed provider decision remains fail-closed through existing adapter', async () => {
  const provider: ClosedChoiceJudgmentProvider<Choice> = {
    descriptor: descriptor(),
    async decide() {
      return {
        status: 'decision',
        choice: 'grep',
        probability: 0.8,
        confidence: 0.7,
        distribution: {
          columns: 0.8,
          grep: 0.8,
        },
      };
    },
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
    ),
    /sum to 1/,
  );
});

test('provider exceptions propagate without being mislabeled as unavailable', async () => {
  const provider: ClosedChoiceJudgmentProvider<Choice> = {
    descriptor: descriptor(),
    async decide() {
      throw new Error('provider transport failed');
    },
  };

  await assert.rejects(
    () => runClosedChoiceJudgmentProvider(
      provider,
      observation(),
      question,
    ),
    /provider transport failed/,
  );
});
