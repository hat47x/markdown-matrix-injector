import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cognitiveArtifactEvaluationObservation,
  cognitiveArtifactNotMeasured,
  COGNITIVE_ARTIFACT_EVALUATION_SCHEMA,
} from '../src/evaluation/cognitiveArtifactEvaluation.js';
import type {
  CognitiveArtifactManifestV0,
  CognitiveArtifactResolution,
} from '../src/core/cognitiveArtifact.js';

const manifest: CognitiveArtifactManifestV0 = {
  schema: 'mmi.cognitive-artifact-manifest/v0',
  schemaVersion: 0,
  artifactId: 'embedding-fixture',
  kind: 'embedding-model',
  version: '2026-10-07',
  sha256: `sha256:${'a'.repeat(64)}`,
  sizeBytes: 1234,
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

test('unmeasured artifact evaluation never turns missing evidence into zero metrics', () => {
  assert.deepEqual(
    cognitiveArtifactNotMeasured('manifest not supplied'),
    {
      schema: COGNITIVE_ARTIFACT_EVALUATION_SCHEMA,
      state: 'not-measured',
      reason: 'manifest not supplied',
    },
  );
  assert.throws(
    () => cognitiveArtifactNotMeasured('   '),
    /reason must not be empty/u,
  );
});

test('resolved artifact evaluation preserves common resolver metrics', () => {
  const resolution: CognitiveArtifactResolution = {
    status: 'available',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    source: manifest.sources[0],
    location: {
      kind: 'runtime-managed',
      runtime: 'ollama',
      artifactRef: 'fixture:latest',
      runtimeIdentity: 'fixture:latest',
    },
    reused: true,
    metrics: {
      artifactBytes: 1234,
      downloadedBytes: 0,
      cacheHit: false,
      availableWithoutNetwork: true,
    },
  };

  const observed = cognitiveArtifactEvaluationObservation(
    manifest,
    { id: 'local-embedding:ollama', version: '1' },
    resolution,
  );
  assert.equal(observed.state, 'resolved');
  assert.deepEqual(observed.metrics, resolution.metrics);
  assert.deepEqual(observed.resolution, {
    status: 'available',
    sourceKind: 'runtime-managed',
    locationKind: 'runtime-managed',
  });
  assert.equal(observed.artifact?.sha256, manifest.sha256);
});

test('unavailable and download-required states still preserve artifact cost facts', () => {
  const unavailable: CognitiveArtifactResolution = {
    status: 'unavailable',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    reason: 'runtime-artifact-unverified',
    metrics: {
      artifactBytes: 1234,
      downloadedBytes: 0,
      cacheHit: false,
      availableWithoutNetwork: false,
    },
  };
  const unresolved = cognitiveArtifactEvaluationObservation(
    manifest,
    { id: 'local-embedding:ollama', version: '1' },
    unavailable,
  );
  assert.equal(unresolved.state, 'unavailable');
  assert.equal(
    unresolved.resolution?.reason,
    'runtime-artifact-unverified',
  );
  assert.equal(unresolved.metrics?.artifactBytes, 1234);

  const downloadRequired: CognitiveArtifactResolution = {
    status: 'download-required',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    source: {
      kind: 'https',
      uri: 'https://example.invalid/model.bin',
    },
    cachePath: '/tmp/model',
    metrics: {
      artifactBytes: 1234,
      downloadedBytes: 0,
      cacheHit: false,
      availableWithoutNetwork: false,
    },
  };
  const remote = cognitiveArtifactEvaluationObservation(
    manifest,
    { id: 'local-embedding:ollama', version: '1' },
    downloadRequired,
  );
  assert.equal(remote.state, 'download-required');
  assert.equal(remote.resolution?.sourceKind, 'https');
});
