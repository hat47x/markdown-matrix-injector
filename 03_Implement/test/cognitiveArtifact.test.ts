import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  COGNITIVE_ARTIFACT_MANIFEST_SCHEMA,
  cognitiveArtifactCachePath,
  cognitiveArtifactCacheRoot,
  parseCognitiveArtifactManifest,
  resolveCognitiveArtifact,
  type ArtifactFetch,
  type CognitiveArtifactManifestV0,
} from '../src/core/cognitiveArtifact.js';

const sha256 = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function manifest(
  bytes: Buffer,
  overrides: Partial<CognitiveArtifactManifestV0> = {},
): CognitiveArtifactManifestV0 {
  return {
    schema: COGNITIVE_ARTIFACT_MANIFEST_SCHEMA,
    schemaVersion: 0,
    artifactId: 'semantic-table-embedding-v0',
    kind: 'embedding-model',
    version: '2026-10-07',
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
    license: 'Apache-2.0',
    compatibleProviders: [
      { id: 'local-embedding:ollama', version: '1' },
      { id: 'local-embedding:openai-compatible', version: '1' },
    ],
    sources: [
      {
        kind: 'https',
        uri: 'https://models.example.test/semantic.bin',
      },
    ],
    ...overrides,
  };
}

function stream(bytes: Buffer, parts = 2): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      const step = Math.max(1, Math.ceil(bytes.length / parts));
      for (let index = 0; index < bytes.length; index += step) {
        yield bytes.subarray(index, Math.min(bytes.length, index + step));
      }
    },
  };
}

test('Cognitive Artifact Manifest v0 validates exact identity, license, providers and sources', () => {
  const bytes = Buffer.from('artifact-v0');
  const parsed = parseCognitiveArtifactManifest(JSON.stringify(manifest(bytes)));
  assert.equal(parsed.schema, COGNITIVE_ARTIFACT_MANIFEST_SCHEMA);
  assert.equal(parsed.schemaVersion, 0);
  assert.equal(parsed.sha256, sha256(bytes));
  assert.equal(parsed.sizeBytes, bytes.byteLength);

  assert.throws(
    () => parseCognitiveArtifactManifest(JSON.stringify({
      ...manifest(bytes),
      sourceUrl: 'https://unexpected.example.test/model',
    })),
    /unsupported fields/u,
  );
  assert.throws(
    () => parseCognitiveArtifactManifest(JSON.stringify({
      ...manifest(bytes),
      sha256: 'sha256:not-a-digest',
    })),
    /sha256:<64 lowercase hex>/u,
  );
  assert.throws(
    () => parseCognitiveArtifactManifest(JSON.stringify({
      ...manifest(bytes),
      sources: [{ kind: 'https', uri: 'http://models.example.test/model' }],
    })),
    /must use HTTPS/u,
  );
  assert.throws(
    () => parseCognitiveArtifactManifest(JSON.stringify({
      ...manifest(bytes),
      sources: [{ kind: 'local-file', uri: '/etc/model.bin' }],
    })),
    /relative to localRoot/u,
  );
});

test('cache path is content-addressed and independent of provider/project identity', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const root = path.join(os.tmpdir(), 'mmi-cognitive-cache');
  assert.equal(
    cognitiveArtifactCachePath(root, digest),
    path.join(root, 'sha256', 'aa', 'a'.repeat(64)),
  );
  assert.equal(
    cognitiveArtifactCachePath(root, digest),
    cognitiveArtifactCachePath(root, digest),
  );
});

test('default cache root follows explicit override, XDG and Windows LOCALAPPDATA', () => {
  assert.equal(
    cognitiveArtifactCacheRoot(
      { MMI_COGNITIVE_ARTIFACT_CACHE: '/tmp/custom-cache' },
      'linux',
      '/home/user',
    ),
    path.resolve('/tmp/custom-cache'),
  );
  assert.equal(
    cognitiveArtifactCacheRoot(
      { XDG_CACHE_HOME: '/tmp/xdg' },
      'linux',
      '/home/user',
    ),
    path.resolve('/tmp/xdg', 'mmi', 'cognitive-artifacts'),
  );
  assert.equal(
    cognitiveArtifactCacheRoot(
      { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
      'win32',
      'C:\\Users\\u',
    ),
    path.win32.join(
      'C:\\Users\\u\\AppData\\Local',
      'MMI',
      'cognitive-artifacts',
    ),
  );
});

test('existing verified cache is reused without contacting any source', async () => {
  const bytes = Buffer.from('cached-artifact');
  const m = manifest(bytes);
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-cache-'));
  const cachePath = cognitiveArtifactCachePath(cacheRoot, m.sha256);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, bytes);
  let fetchCalls = 0;

  const result = await resolveCognitiveArtifact(m, {
    provider: { id: 'local-embedding:ollama', version: '1' },
    cacheRoot,
    allowDownload: true,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must not fetch');
    },
  });

  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.deepEqual(result.location, { kind: 'cache', path: cachePath });
  assert.equal(result.reused, true);
  assert.deepEqual(result.metrics, {
    artifactBytes: bytes.byteLength,
    downloadedBytes: 0,
    cacheHit: true,
    availableWithoutNetwork: true,
  });
  assert.equal(fetchCalls, 0);
});

test('corrupt cache fails closed instead of falling back to download', async () => {
  const bytes = Buffer.from('expected');
  const m = manifest(bytes);
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-cache-'));
  const cachePath = cognitiveArtifactCachePath(cacheRoot, m.sha256);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, Buffer.from('corrupt'));

  await assert.rejects(
    resolveCognitiveArtifact(m, {
      provider: { id: 'local-embedding:ollama', version: '1' },
      cacheRoot,
      allowDownload: true,
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    }),
    /size mismatch|digest mismatch/u,
  );
});

test('local-file source is verified in place and cannot escape localRoot', async () => {
  const bytes = Buffer.from('local-artifact');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-local-'));
  fs.mkdirSync(path.join(root, 'models'));
  fs.writeFileSync(path.join(root, 'models', 'model.bin'), bytes);

  const ok = await resolveCognitiveArtifact(
    manifest(bytes, {
      sources: [{ kind: 'local-file', uri: 'models/model.bin' }],
    }),
    {
      provider: { id: 'local-embedding:ollama', version: '1' },
      localRoot: root,
      cacheRoot: path.join(root, 'cache'),
    },
  );
  assert.equal(ok.status, 'available');
  if (ok.status === 'available') {
    assert.equal(ok.location.kind, 'local-file');
    if (ok.location.kind === 'local-file') {
      assert.equal(ok.location.path, fs.realpathSync(path.join(root, 'models', 'model.bin')));
    }
  }

  const outside = path.join(path.dirname(root), 'outside-model.bin');
  fs.writeFileSync(outside, bytes);
  const blocked = await resolveCognitiveArtifact(
    manifest(bytes, {
      sources: [{ kind: 'local-file', uri: '../outside-model.bin' }],
    }),
    {
      provider: { id: 'local-embedding:ollama', version: '1' },
      localRoot: root,
      cacheRoot: path.join(root, 'cache-2'),
    },
  );
  assert.equal(blocked.status, 'unavailable');
});

test('HTTPS source reports size and source before download and does not fetch implicitly', async () => {
  const bytes = Buffer.from('remote-artifact');
  const m = manifest(bytes);
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-remote-'));
  let fetchCalls = 0;
  const result = await resolveCognitiveArtifact(m, {
    provider: { id: 'local-embedding:ollama', version: '1' },
    cacheRoot,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('implicit download');
    },
  });

  assert.equal(result.status, 'download-required');
  if (result.status !== 'download-required') return;
  assert.equal(result.sizeBytes, bytes.byteLength);
  assert.equal(result.source.uri, 'https://models.example.test/semantic.bin');
  assert.deepEqual(result.metrics, {
    artifactBytes: bytes.byteLength,
    downloadedBytes: 0,
    cacheHit: false,
    availableWithoutNetwork: false,
  });
  assert.equal(fetchCalls, 0);
});

test('explicit HTTPS download streams, verifies and atomically populates shared cache', async () => {
  const bytes = Buffer.from('remote-artifact-streamed');
  const m = manifest(bytes);
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-remote-'));
  let fetchCalls = 0;
  const fetchImpl: ArtifactFetch = async (url) => {
    fetchCalls += 1;
    assert.equal(url, 'https://models.example.test/semantic.bin');
    return {
      ok: true,
      status: 200,
      url,
      body: stream(bytes, 3),
    };
  };

  const downloaded = await resolveCognitiveArtifact(m, {
    provider: { id: 'local-embedding:ollama', version: '1' },
    cacheRoot,
    allowDownload: true,
    fetchImpl,
  });
  assert.equal(downloaded.status, 'available');
  if (downloaded.status !== 'available') return;
  assert.equal(downloaded.reused, false);
  assert.equal(downloaded.location.kind, 'cache');
  if (downloaded.location.kind === 'cache') {
    assert.deepEqual(fs.readFileSync(downloaded.location.path), bytes);
  }
  assert.deepEqual(downloaded.metrics, {
    artifactBytes: bytes.byteLength,
    downloadedBytes: bytes.byteLength,
    cacheHit: false,
    availableWithoutNetwork: false,
  });
  assert.equal(fetchCalls, 1);

  const reusedByAnotherProvider = await resolveCognitiveArtifact(m, {
    provider: { id: 'local-embedding:openai-compatible', version: '1' },
    cacheRoot,
    allowDownload: false,
    fetchImpl: async () => {
      throw new Error('must not fetch');
    },
  });
  assert.equal(reusedByAnotherProvider.status, 'available');
  if (reusedByAnotherProvider.status === 'available') {
    assert.equal(reusedByAnotherProvider.reused, true);
    assert.deepEqual(reusedByAnotherProvider.location, downloaded.location);
    assert.deepEqual(reusedByAnotherProvider.metrics, {
      artifactBytes: bytes.byteLength,
      downloadedBytes: 0,
      cacheHit: true,
      availableWithoutNetwork: true,
    });
  }
});

test('HTTPS digest and size mismatch fail closed and leave no cache artifact', async () => {
  const expected = Buffer.from('expected-artifact');
  const wrong = Buffer.from('wrong-artifact');
  const m = manifest(expected);
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-remote-'));
  const cachePath = cognitiveArtifactCachePath(cacheRoot, m.sha256);

  await assert.rejects(
    resolveCognitiveArtifact(m, {
      provider: { id: 'local-embedding:ollama', version: '1' },
      cacheRoot,
      allowDownload: true,
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        url,
        body: stream(wrong),
      }),
    }),
    /size mismatch|exceeded expected size|digest mismatch/u,
  );
  assert.equal(fs.existsSync(cachePath), false);
});

test('offline cache miss leaves only the cognitive provider unavailable', async () => {
  const bytes = Buffer.from('offline-artifact');
  const result = await resolveCognitiveArtifact(manifest(bytes), {
    provider: { id: 'local-embedding:ollama', version: '1' },
    cacheRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-offline-')),
    offline: true,
    allowDownload: true,
    fetchImpl: async () => {
      throw new Error('offline must not fetch');
    },
  });
  assert.deepEqual(result.status, 'unavailable');
  if (result.status === 'unavailable') {
    assert.equal(result.reason, 'offline-cache-miss');
  }
});

test('provider version mismatch is unavailable before source access', async () => {
  const bytes = Buffer.from('provider-version');
  let fetchCalls = 0;
  const result = await resolveCognitiveArtifact(manifest(bytes), {
    provider: { id: 'local-embedding:ollama', version: '2' },
    cacheRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-version-')),
    allowDownload: true,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must not fetch');
    },
  });
  assert.equal(result.status, 'unavailable');
  if (result.status === 'unavailable') {
    assert.equal(result.reason, 'provider-incompatible');
  }
  assert.equal(fetchCalls, 0);
});

test('runtime-managed artifact is reused without copying only when sha256 identity matches', async () => {
  const bytes = Buffer.from('runtime-artifact');
  const m = manifest(bytes, {
    sources: [{
      kind: 'runtime-managed',
      uri: 'runtime:ollama/embed-model:latest',
      runtime: 'ollama',
      artifactRef: 'embed-model:latest',
    }],
  });
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-runtime-'));

  const exact = await resolveCognitiveArtifact(m, {
    provider: { id: 'local-embedding:ollama', version: '1' },
    cacheRoot,
    runtimeArtifacts: [{
      runtime: 'ollama',
      artifactRef: 'embed-model:latest',
      sha256: m.sha256,
      sizeBytes: m.sizeBytes,
      runtimeIdentity: 'embed-model:latest',
    }],
  });
  assert.equal(exact.status, 'available');
  if (exact.status === 'available') {
    assert.equal(exact.location.kind, 'runtime-managed');
    assert.equal(exact.reused, true);
    assert.deepEqual(exact.metrics, {
      artifactBytes: bytes.byteLength,
      downloadedBytes: 0,
      cacheHit: false,
      availableWithoutNetwork: true,
    });
  }
  assert.equal(fs.existsSync(cognitiveArtifactCachePath(cacheRoot, m.sha256)), false);

  const unverified = await resolveCognitiveArtifact(m, {
    provider: { id: 'local-embedding:ollama', version: '1' },
    cacheRoot,
    runtimeArtifacts: [{
      runtime: 'ollama',
      artifactRef: 'embed-model:latest',
      runtimeIdentity: 'embed-model:latest',
      sizeBytes: m.sizeBytes,
    }],
  });
  assert.equal(unverified.status, 'unavailable');
  if (unverified.status === 'unavailable') {
    assert.equal(unverified.reason, 'runtime-artifact-unverified');
  }
});

test('runtime-managed artifact with mismatched declared size fails closed', async () => {
  const bytes = Buffer.from('runtime-artifact');
  const m = manifest(bytes, {
    sources: [{
      kind: 'runtime-managed',
      uri: 'runtime:ollama/embed-model:latest',
      runtime: 'ollama',
      artifactRef: 'embed-model:latest',
    }],
  });
  await assert.rejects(
    resolveCognitiveArtifact(m, {
      provider: { id: 'local-embedding:ollama', version: '1' },
      cacheRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-runtime-')),
      runtimeArtifacts: [{
        runtime: 'ollama',
        artifactRef: 'embed-model:latest',
        sha256: m.sha256,
        sizeBytes: m.sizeBytes + 1,
      }],
    }),
    /runtime-managed artifact size mismatch/u,
  );
});

test('redirect/final HTTPS identity is rechecked before accepting bytes', async () => {
  const bytes = Buffer.from('redirected-artifact');
  const m = manifest(bytes);
  await assert.rejects(
    resolveCognitiveArtifact(m, {
      provider: { id: 'local-embedding:ollama', version: '1' },
      cacheRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-redirect-')),
      allowDownload: true,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: 'http://insecure.example.test/model',
        body: stream(bytes),
      }),
    }),
    /must use HTTPS/u,
  );
});
