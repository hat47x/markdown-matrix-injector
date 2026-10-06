import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverLocalEmbeddingModels,
  runtimeManagedArtifactFromEmbeddingModel,
  type DiscoveryFetch,
} from '../src/search/semantic/runtimeDiscovery.js';

function response(body: unknown, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

test('local embedding discovery keeps only Ollama models with embedding capability', async () => {
  const calls: string[] = [];
  const fetchImpl: DiscoveryFetch = async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/api/tags')) {
      return response({
        models: [
          {
            name: 'chat-model:latest',
            digest: '1'.repeat(64),
            size: 10,
          },
          {
            model: 'embed-model:latest',
            digest: '2'.repeat(64),
            size: 20,
          },
          {
            model: 'cloud-embed:cloud',
            remote_model: 'cloud-embed:cloud',
            remote_host: 'https://ollama.com',
            digest: '3'.repeat(64),
            size: 30,
          },
        ],
      });
    }
    if (url.endsWith('/api/show')) {
      const model = JSON.parse(init?.body ?? '{}').model;
      return response({
        capabilities:
          model === 'embed-model:latest'
            ? ['embedding']
            : ['completion'],
      });
    }
    return response({}, false);
  };

  const models = await discoverLocalEmbeddingModels(fetchImpl, {
    timeoutMs: 5_000,
    lmStudioEndpoint: 'http://127.0.0.1:1235',
  });

  assert.deepEqual(models, [{
    runtime: 'ollama',
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-model:latest',
    displayName: 'embed-model:latest',
    artifactDigest: `sha256:${'2'.repeat(64)}`,
    sizeBytes: 20,
  }]);
  assert.ok(calls.includes('GET http://127.0.0.1:11434/api/tags'));
  assert.equal(
    calls.filter((call) =>
      call === 'POST http://127.0.0.1:11434/api/show').length,
    2,
  );
});

test('local embedding discovery uses LM Studio native model types without loading models', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: DiscoveryFetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/api/v1/models')) {
      return response({
        models: [
          {
            type: 'llm',
            key: 'chat-model',
            display_name: 'Chat Model',
            size_bytes: 1_000,
          },
          {
            type: 'embedding',
            key: 'text-embed',
            display_name: 'Text Embed',
            size_bytes: 2_000,
          },
        ],
      });
    }
    return response({}, false);
  };

  const models = await discoverLocalEmbeddingModels(fetchImpl, {
    timeoutMs: 5_000,
    ollamaEndpoint: 'http://127.0.0.1:11435',
  });

  assert.deepEqual(models, [{
    runtime: 'lm-studio',
    api: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1234',
    model: 'text-embed',
    displayName: 'Text Embed',
    sizeBytes: 2_000,
  }]);
  assert.deepEqual(calls, [
    {
      url: 'http://127.0.0.1:11435/api/tags',
      method: 'GET',
    },
    {
      url: 'http://127.0.0.1:1234/api/v1/models',
      method: 'GET',
    },
  ]);
});

test('local embedding discovery refuses non-loopback probe endpoints before fetch', async () => {
  let calls = 0;
  const fetchImpl: DiscoveryFetch = async () => {
    calls += 1;
    return response({});
  };

  const models = await discoverLocalEmbeddingModels(fetchImpl, {
    ollamaEndpoint: 'http://192.168.1.20:11434',
    lmStudioEndpoint: 'https://models.example.test',
  });

  assert.deepEqual(models, []);
  assert.equal(calls, 0);
});

test('local embedding discovery degrades when one local runtime is unavailable', async () => {
  const fetchImpl: DiscoveryFetch = async (url) => {
    if (url.includes(':11434')) {
      throw new Error('not running');
    }
    if (url.endsWith('/api/v1/models')) {
      return response({
        models: [
          {
            type: 'embedding',
            key: 'available-embed',
            display_name: 'Available Embed',
          },
        ],
      });
    }
    return response({}, false);
  };

  const models = await discoverLocalEmbeddingModels(fetchImpl, {
    timeoutMs: 5_000,
  });

  assert.equal(models.length, 1);
  assert.equal(models[0].runtime, 'lm-studio');
  assert.equal(models[0].model, 'available-embed');
});


test('discovered local models expose runtime-managed artifact identity without changing discovery shape', () => {
  const ollama = runtimeManagedArtifactFromEmbeddingModel({
    runtime: 'ollama',
    api: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'embed-model:latest',
    displayName: 'embed-model:latest',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    sizeBytes: 123,
  });
  assert.deepEqual(ollama, {
    runtime: 'ollama',
    artifactRef: 'embed-model:latest',
    runtimeIdentity: 'embed-model:latest',
    sha256: `sha256:${'a'.repeat(64)}`,
    sizeBytes: 123,
  });

  const lmStudio = runtimeManagedArtifactFromEmbeddingModel({
    runtime: 'lm-studio',
    api: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1234',
    model: 'text-embed',
    displayName: 'Text Embed',
    sizeBytes: 456,
  });
  assert.deepEqual(lmStudio, {
    runtime: 'lm-studio',
    artifactRef: 'text-embed',
    runtimeIdentity: 'text-embed',
    sizeBytes: 456,
  });
  assert.equal('sha256' in lmStudio, false);
});
