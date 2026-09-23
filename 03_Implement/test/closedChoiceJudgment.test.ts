import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
  CognitiveProviderDescriptor,
} from '../src/experimental/cognitiveContract.js';
import {
  adaptClosedChoiceResponse,
  collectClosedChoiceCalibrationSample,
  type ClosedChoiceQuestion,
} from '../src/experimental/closedChoiceJudgment.js';

const provider: CognitiveProviderDescriptor = {
  id: 'mmi.closed-choice.stub',
  version: '1',
  category: 'judgment',
  executionBoundary: 'local',
  capabilities: ['closed-choice'],
};

const question: ClosedChoiceQuestion<'columns' | 'grep' | 'mode-card' | 'caption'> = {
  id: 'mmi-authoring-intent-v1',
  semantics: 'Classify a user request into one currently supported MMI authoring operation.',
  choices: ['columns', 'grep', 'mode-card', 'caption'],
};

function observation(id: string): CognitiveObservation<{ text: string }> {
  return {
    id,
    kind: 'mmi-authoring-intent',
    schemaVersion: 'mmi-authoring-intent-v1',
    payload: { text: 'fixture' },
    provenance: {
      sourceKind: 'user-intent-fixture',
      sourceDigest: `sha256:${id}`,
    },
  };
}

test('adapts a valid closed choice as proposal-only and preserves provider score namespaces', () => {
  const outcome = adaptClosedChoiceResponse(
    observation('choice'),
    provider,
    question,
    {
      status: 'decision',
      choice: 'grep',
      probability: 0.8,
      confidence: 0.73,
      distribution: {
        columns: 0.05,
        grep: 0.8,
        'mode-card': 0.1,
        caption: 0.05,
      },
    },
  );

  assert.equal(outcome.status, 'signal');
  assert.equal(outcome.signal.payload.disposition, 'proposal-only');
  assert.equal(outcome.signal.payload.choice, 'grep');
  assert.equal(outcome.signal.payload.probability, 0.8);
  assert.ok(outcome.signal.scores?.every((score) => score.namespace === provider.id));
  assert.equal('apply' in outcome.signal.payload, false);
});

test('keeps abstained and unsupported as explicit non-decisions', () => {
  const abstained = adaptClosedChoiceResponse(
    observation('abstain'),
    provider,
    question,
    {
      status: 'abstained',
      reasonCode: 'INTENT_TOO_VAGUE',
      confidence: 0.31,
    },
  );
  const unsupported = adaptClosedChoiceResponse(
    observation('unsupported'),
    provider,
    question,
    {
      status: 'unsupported',
      reasonCode: 'NOTATION_CANNOT_EXPRESS_AGGREGATION',
    },
  );

  assert.equal(abstained.status, 'abstained');
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(
    abstained.scores?.[0]?.name,
    'provider-confidence',
  );
});

test('rejects undeclared choices and malformed probability distributions', () => {
  assert.throws(
    () => adaptClosedChoiceResponse(
      observation('bad-choice'),
      provider,
      question,
      {
        status: 'decision',
        choice: 'aggregate' as never,
        probability: 1,
        confidence: 0.9,
        distribution: {
          columns: 0,
          grep: 0,
          'mode-card': 0,
          caption: 0,
          aggregate: 1,
        },
      },
    ),
    /undeclared choice/,
  );

  assert.throws(
    () => adaptClosedChoiceResponse(
      observation('bad-sum'),
      provider,
      question,
      {
        status: 'decision',
        choice: 'grep',
        probability: 0.7,
        confidence: 0.9,
        distribution: {
          columns: 0.1,
          grep: 0.7,
          'mode-card': 0.1,
          caption: 0.2,
        },
      },
    ),
    /sum to 1/,
  );

  assert.throws(
    () => adaptClosedChoiceResponse(
      observation('missing-choice'),
      provider,
      question,
      {
        status: 'decision',
        choice: 'grep',
        probability: 0.8,
        confidence: 0.9,
        distribution: {
          columns: 0.1,
          grep: 0.8,
          'mode-card': 0.1,
        },
      },
    ),
    /exactly the declared choices/,
  );
});

test('rejects non-judgment providers and providers without closed-choice capability', () => {
  assert.throws(
    () => adaptClosedChoiceResponse(
      observation('wrong-category'),
      { ...provider, category: 'perception' },
      question,
      {
        status: 'unsupported',
        reasonCode: 'NO',
      },
    ),
    /judgment category/,
  );

  assert.throws(
    () => adaptClosedChoiceResponse(
      observation('missing-capability'),
      { ...provider, capabilities: ['other'] },
      question,
      {
        status: 'unsupported',
        reasonCode: 'NO',
      },
    ),
    /closed-choice capability/,
  );
});

test('collects calibration samples without treating confidence as correctness', () => {
  const correctOutcome = adaptClosedChoiceResponse(
    observation('calibration-correct'),
    provider,
    question,
    {
      status: 'decision',
      choice: 'columns',
      probability: 0.65,
      confidence: 0.91,
      distribution: {
        columns: 0.65,
        grep: 0.15,
        'mode-card': 0.1,
        caption: 0.1,
      },
    },
  );
  const wrongOutcome = adaptClosedChoiceResponse(
    observation('calibration-wrong'),
    provider,
    question,
    {
      status: 'decision',
      choice: 'caption',
      probability: 0.6,
      confidence: 0.95,
      distribution: {
        columns: 0.2,
        grep: 0.1,
        'mode-card': 0.1,
        caption: 0.6,
      },
    },
  );

  assert.deepEqual(
    collectClosedChoiceCalibrationSample(correctOutcome, 'columns'),
    {
      questionId: question.id,
      confidence: 0.91,
      choiceProbability: 0.65,
      correct: true,
    },
  );
  assert.equal(
    collectClosedChoiceCalibrationSample(wrongOutcome, 'grep')?.correct,
    false,
  );
});

test('does not create a calibration sample for abstention', () => {
  const outcome = adaptClosedChoiceResponse(
    observation('calibration-abstain'),
    provider,
    question,
    {
      status: 'abstained',
      reasonCode: 'LOW_INFORMATION',
    },
  );

  assert.equal(
    collectClosedChoiceCalibrationSample(outcome, 'grep'),
    undefined,
  );
});
