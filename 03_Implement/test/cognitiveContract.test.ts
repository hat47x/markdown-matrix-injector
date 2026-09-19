import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCognitiveObservation,
  assertCognitiveOutcome,
  assertCognitiveProviderDescriptor,
  assertCognitiveScore,
  toCognitiveObservationRef,
  type CognitiveObservation,
  type CognitiveOutcome,
  type CognitiveProviderDescriptor,
} from '../src/experimental/cognitiveContract.js';

const flyProvider: CognitiveProviderDescriptor = {
  id: 'mmi.fly-format',
  version: 'worksheet-format-v6',
  category: 'perception',
  executionBoundary: 'local',
  capabilities: ['format-candidate-ranking', 'format-novelty'],
};

const observation: CognitiveObservation<{ features: readonly string[] }> = {
  id: 'obs-001',
  kind: 'worksheet-format',
  schemaVersion: 'worksheet-format-observation-v1',
  payload: {
    features: ['region:table', 'header:row', 'layout:4-columns'],
  },
  provenance: {
    sourceKind: 'xlsx',
    sourceDigest: 'sha256:abc123',
    featureVersion: 'worksheet-format-v6',
    sourceProfileId: 'sheetjs-ce-xlsx-0.20.3-fill-v1',
  },
};

test('accepts a provider-neutral perception signal with explicit provenance', () => {
  const outcome: CognitiveOutcome<{ prototypeId: string }> = {
    status: 'signal',
    provider: flyProvider,
    observation: toCognitiveObservationRef(observation),
    signal: {
      kind: 'candidate-ranking',
      payload: { prototypeId: 'release-checklist' },
      scores: [
        {
          namespace: 'mmi.fly-format',
          name: 'confidence',
          semantics: 'weighted feature and sparse-signature similarity',
          value: 0.82,
          range: { min: 0, max: 1 },
          higherIsStronger: true,
        },
        {
          namespace: 'mmi.fly-format',
          name: 'deviation-score',
          semantics: 'distance from the selected format prototype',
          value: 0.18,
          range: { min: 0, max: 1 },
          higherIsStronger: false,
        },
      ],
      evidence: [{ code: 'FORMAT_CANDIDATE_VISIBLE' }],
    },
  };

  assert.doesNotThrow(() => assertCognitiveOutcome(outcome));
  assert.deepEqual(outcome.observation, {
    id: 'obs-001',
    sourceDigest: 'sha256:abc123',
    schemaVersion: 'worksheet-format-observation-v1',
  });
});

test('keeps equal numeric scores separate when namespaces and semantics differ', () => {
  const flyScore = {
    namespace: 'mmi.fly-format',
    name: 'confidence',
    semantics: 'format similarity confidence',
    value: 0.8,
    range: { min: 0, max: 1 },
  } as const;
  const judgmentScore = {
    namespace: 'jev.closed-choice',
    name: 'probability',
    semantics: 'provider probability for a bounded choice',
    value: 0.8,
    range: { min: 0, max: 1 },
  } as const;

  assert.doesNotThrow(() => assertCognitiveScore(flyScore));
  assert.doesNotThrow(() => assertCognitiveScore(judgmentScore));
  assert.notEqual(flyScore.namespace, judgmentScore.namespace);
  assert.notEqual(flyScore.semantics, judgmentScore.semantics);
});

test('treats abstained unsupported and unavailable as valid explicit outcomes', () => {
  for (const status of ['abstained', 'unsupported', 'unavailable'] as const) {
    const outcome: CognitiveOutcome = {
      status,
      provider: {
        id: 'mmi.closed-choice.stub',
        version: '1',
        category: 'judgment',
        executionBoundary: 'external-opt-in',
        capabilities: ['intent-classification'],
      },
      observation: toCognitiveObservationRef(observation),
      reasonCode: `${status.toUpperCase()}_BY_PROVIDER`,
    };

    assert.doesNotThrow(() => assertCognitiveOutcome(outcome));
  }
});

test('validates provider and observation metadata without requiring IO handles', () => {
  assert.doesNotThrow(() => assertCognitiveProviderDescriptor(flyProvider));
  assert.doesNotThrow(() => assertCognitiveObservation(observation));
  assert.equal('path' in observation.provenance, false);
  assert.equal('write' in observation.provenance, false);
  assert.equal(flyProvider.executionBoundary, 'local');
});

test('rejects blank identity metadata and duplicate capabilities', () => {
  assert.throws(
    () => assertCognitiveProviderDescriptor({
      ...flyProvider,
      id: '   ',
    }),
    /provider.id/,
  );

  assert.throws(
    () => assertCognitiveProviderDescriptor({
      ...flyProvider,
      capabilities: ['format-candidate-ranking', 'format-candidate-ranking'],
    }),
    /Duplicate cognitive provider capability/,
  );

  assert.throws(
    () => assertCognitiveProviderDescriptor({
      ...flyProvider,
      capabilities: [],
    }),
    /at least one capability/,
  );

  assert.throws(
    () => assertCognitiveObservation({
      ...observation,
      provenance: {
        ...observation.provenance,
        sourceDigest: '   ',
      },
    }),
    /sourceDigest/,
  );
});

test('rejects invalid scores and empty abstention reasons', () => {
  assert.throws(
    () => assertCognitiveScore({
      namespace: 'x',
      name: 'confidence',
      semantics: 'test',
      value: Number.NaN,
    }),
    /finite/,
  );

  assert.throws(
    () => assertCognitiveScore({
      namespace: 'x',
      name: 'confidence',
      semantics: 'test',
      value: 2,
      range: { min: 0, max: 1 },
    }),
    /within its declared range/,
  );

  assert.throws(
    () => assertCognitiveOutcome({
      status: 'abstained',
      provider: flyProvider,
      observation: toCognitiveObservationRef(observation),
      reasonCode: '   ',
    }),
    /reasonCode/,
  );
});

test('rejects unsupported runtime status and invalid provider boundary', () => {
  assert.throws(
    () => assertCognitiveOutcome({
      status: 'unexpected' as never,
      provider: flyProvider,
      observation: toCognitiveObservationRef(observation),
      reasonCode: 'INVALID',
    } as CognitiveOutcome),
    /Unsupported cognitive outcome status/,
  );

  assert.throws(
    () => assertCognitiveProviderDescriptor({
      ...flyProvider,
      executionBoundary: 'implicit-cloud' as never,
    }),
    /execution boundary/,
  );
});

test('rejects a signal with missing kind or invalid evidence metadata', () => {
  assert.throws(
    () => assertCognitiveOutcome({
      status: 'signal',
      provider: flyProvider,
      observation: toCognitiveObservationRef(observation),
      signal: {
        kind: '   ',
        payload: {},
      },
    }),
    /signal.kind/,
  );

  assert.throws(
    () => assertCognitiveOutcome({
      status: 'signal',
      provider: flyProvider,
      observation: toCognitiveObservationRef(observation),
      signal: {
        kind: 'candidate-ranking',
        payload: {},
        evidence: [{ code: '   ' }],
      },
    }),
    /evidence.code/,
  );
});
