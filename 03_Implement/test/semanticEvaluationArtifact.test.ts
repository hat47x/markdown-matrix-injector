import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSemanticEvaluationArtifact,
} from '../scripts/cpu-search-eval/semantic-eval.js';
import type {
  CognitiveArtifactManifestV0,
} from '../src/core/cognitiveArtifact.js';
import type {
  DiscoveredEmbeddingModel,
} from '../src/search/semantic/runtimeDiscovery.js';

const digest = `sha256:${'a'.repeat(64)}`;

function manifest(): CognitiveArtifactManifestV0 {
  return {
    schema: 'mmi.cognitive-artifact-manifest/v0',
    schemaVersion: 0,
    artifactId: 'semantic-embedding-fixture',
    kind: 'embedding-model',
    version: '2026-10-07',
    sha256: digest,
    sizeBytes: 4567,
    license: 'Apache-2.0',
    compatibleProviders: [{
      id: 'local-embedding:ollama',
      version: '1',
    }],
    sources: [{
      kind: 'runtime-managed',
      uri: 'runtime:ollama/fixture:latest',
      runtime: 'ollama',
      artifactRef: 'fixture:latest',
    }],
  };
}

function model(
  overrides: Partial<DiscoveredEmbeddingModel> = {},
): DiscoveredEmbeddingModel {
  return {
    runtime: 'ollama',
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'fixture:latest',
    displayName: 'fixture:latest',
    artifactDigest: digest,
    sizeBytes: 4567,
    ...overrides,
  };
}

test('semantic evaluation records runtime-managed artifact cost metrics', async () => {
  const result = await resolveSemanticEvaluationArtifact(
    manifest(),
    { id: 'local-embedding:ollama', version: '1' },
    {
      api: 'ollama',
      endpoint: 'http://127.0.0.1:11434/',
      model: 'fixture:latest',
    },
    [model()],
  );

  assert.equal(result.state, 'resolved');
  assert.deepEqual(result.metrics, {
    artifactBytes: 4567,
    downloadedBytes: 0,
    cacheHit: false,
    availableWithoutNetwork: true,
  });
  assert.deepEqual(result.resolution, {
    status: 'available',
    sourceKind: 'runtime-managed',
    locationKind: 'runtime-managed',
  });
  assert.equal(result.artifact?.sha256, digest);
});

test('semantic evaluation refuses a selected model whose digest is unavailable', async () => {
  await assert.rejects(
    resolveSemanticEvaluationArtifact(
      manifest(),
      { id: 'local-embedding:ollama', version: '1' },
      {
        api: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'fixture:latest',
      },
      [model({ artifactDigest: undefined })],
    ),
    /digest-unavailable/u,
  );
});

test('semantic evaluation refuses alias reuse when runtime digest drifted', async () => {
  await assert.rejects(
    resolveSemanticEvaluationArtifact(
      manifest(),
      { id: 'local-embedding:ollama', version: '1' },
      {
        api: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'fixture:latest',
      },
      [model({
        artifactDigest: `sha256:${'b'.repeat(64)}`,
      })],
    ),
    /not cryptographically bound/u,
  );
});

test('semantic evaluation refuses a model that was not rediscovered at the selected endpoint', async () => {
  await assert.rejects(
    resolveSemanticEvaluationArtifact(
      manifest(),
      { id: 'local-embedding:ollama', version: '1' },
      {
        api: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'fixture:latest',
      },
      [model({ endpoint: 'http://127.0.0.1:9999' })],
    ),
    /could not be rediscovered/u,
  );
});
