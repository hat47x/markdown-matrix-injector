import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { COGNITIVE_ARTIFACT_MANIFEST_SCHEMA } from '../src/core/cognitiveArtifact.js';

const sha256 = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function captureMain(argv: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const error = console.error;
  // The test runner writes binary event frames to the same stream while this
  // awaits; the CLI only ever writes strings, so keep just those.
  process.stdout.write = ((chunk: string | Uint8Array) => {
    if (typeof chunk === 'string') stdout.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      stdout: stdout.join(''),
      stderr: stderr.join('\n'),
    };
  } finally {
    process.stdout.write = out;
    console.error = error;
  }
}

function writeManifest(
  root: string,
  bytes: Buffer,
  sources: unknown[],
  providers = [{ id: 'local-embedding:ollama', version: '1' }],
): string {
  const filepath = path.join(root, 'artifact.json');
  fs.writeFileSync(filepath, JSON.stringify({
    schema: COGNITIVE_ARTIFACT_MANIFEST_SCHEMA,
    schemaVersion: 0,
    artifactId: 'fixture-artifact',
    kind: 'embedding-model',
    version: 'fixture-1',
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
    license: 'Apache-2.0',
    compatibleProviders: providers,
    sources,
  }, null, 2));
  return filepath;
}

test('CLI schema publishes Cognitive Artifact Manifest v0', async () => {
  const result = await captureMain(['schema', 'cognitive-artifact']);
  assert.equal(result.code, 0);
  const schema = JSON.parse(result.stdout);
  assert.equal(schema.$id, COGNITIVE_ARTIFACT_MANIFEST_SCHEMA);
  assert.equal(schema.properties.schemaVersion.const, 0);
  assert.equal(schema.additionalProperties, false);
});

test('CLI artifact verifies a local file without copying or downloading it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-artifact-cli-'));
  const bytes = Buffer.from('local-model');
  fs.mkdirSync(path.join(root, 'models'));
  fs.writeFileSync(path.join(root, 'models', 'model.bin'), bytes);
  const manifestPath = writeManifest(root, bytes, [
    { kind: 'local-file', uri: 'models/model.bin' },
  ]);

  const result = await captureMain([
    'artifact',
    manifestPath,
    '--provider',
    'local-embedding:ollama@1',
    '--cache',
    path.join(root, 'cache'),
    '--json',
  ]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.resolution.status, 'available');
  assert.equal(parsed.resolution.location.kind, 'local-file');
  assert.equal(parsed.resolution.reused, true);
  assert.equal(fs.existsSync(path.join(root, 'cache')), false);
});

test('CLI artifact reports HTTPS acquisition before any network request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-artifact-cli-'));
  const bytes = Buffer.from('remote-model');
  const manifestPath = writeManifest(root, bytes, [
    { kind: 'https', uri: 'https://models.example.test/model.bin' },
  ]);

  const result = await captureMain([
    'artifact',
    manifestPath,
    '--provider',
    'local-embedding:ollama@1',
    '--cache',
    path.join(root, 'cache'),
    '--json',
  ]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.resolution.status, 'download-required');
  assert.equal(
    parsed.resolution.source.uri,
    'https://models.example.test/model.bin',
  );
  assert.equal(parsed.resolution.sizeBytes, bytes.byteLength);
  assert.equal(fs.existsSync(path.join(root, 'cache')), false);
});

test('CLI artifact returns nonzero for incompatible provider and offline cache miss', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-artifact-cli-'));
  const bytes = Buffer.from('remote-model');
  const manifestPath = writeManifest(root, bytes, [
    { kind: 'https', uri: 'https://models.example.test/model.bin' },
  ]);

  const incompatible = await captureMain([
    'artifact',
    manifestPath,
    '--provider',
    'local-embedding:ollama@2',
    '--json',
  ]);
  assert.equal(incompatible.code, 1);
  assert.equal(
    JSON.parse(incompatible.stdout).resolution.reason,
    'provider-incompatible',
  );

  const offline = await captureMain([
    'artifact',
    manifestPath,
    '--provider',
    'local-embedding:ollama@1',
    '--offline',
    '--cache',
    path.join(root, 'empty-cache'),
    '--json',
  ]);
  assert.equal(offline.code, 1);
  assert.equal(
    JSON.parse(offline.stdout).resolution.reason,
    'offline-cache-miss',
  );
});

test('CLI artifact requires explicit valid provider and rejects conflicting network flags', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-artifact-cli-'));
  const bytes = Buffer.from('remote-model');
  const manifestPath = writeManifest(root, bytes, [
    { kind: 'https', uri: 'https://models.example.test/model.bin' },
  ]);

  assert.equal((await captureMain(['artifact', manifestPath])).code, 2);
  assert.equal((await captureMain([
    'artifact',
    manifestPath,
    '--provider',
    'missing-at-sign',
  ])).code, 2);
  assert.equal((await captureMain([
    'artifact',
    manifestPath,
    '--provider',
    'local-embedding:ollama@1',
    '--download',
    '--offline',
  ])).code, 2);
});
