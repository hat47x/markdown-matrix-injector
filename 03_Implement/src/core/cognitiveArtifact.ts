/**
 * Cognitive Artifact Manifest v0 (issue-0204).
 *
 * Cognitive artifacts are data, not executable authority. This module keeps
 * model/profile/index bytes outside MMI Core while binding them to explicit
 * identity, license, provider compatibility and source provenance.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';

export const COGNITIVE_ARTIFACT_MANIFEST_SCHEMA =
  'mmi.cognitive-artifact-manifest/v0' as const;
export const COGNITIVE_ARTIFACT_SCHEMA_VERSION = 0 as const;

export type CognitiveArtifactKind =
  | 'embedding-model'
  | 'prototype-set'
  | 'index'
  | 'profile'
  | 'other';

export interface CompatibleCognitiveProvider {
  id: string;
  /** v0 deliberately uses exact provider versions, not ambiguous ranges. */
  version: string;
}

export type CognitiveArtifactSource =
  | {
      kind: 'local-file';
      /** Relative to the caller-supplied localRoot. */
      uri: string;
    }
  | {
      kind: 'https';
      /** HTTPS only. Authentication is intentionally out of v0 scope. */
      uri: string;
    }
  | {
      kind: 'runtime-managed';
      /** Informational URI, e.g. runtime:ollama/nomic-embed-text. */
      uri: string;
      runtime: string;
      artifactRef: string;
    };

export interface CognitiveArtifactManifestV0 {
  schema: typeof COGNITIVE_ARTIFACT_MANIFEST_SCHEMA;
  schemaVersion: typeof COGNITIVE_ARTIFACT_SCHEMA_VERSION;
  artifactId: string;
  kind: CognitiveArtifactKind;
  version: string;
  sha256: string;
  sizeBytes: number;
  license: string;
  compatibleProviders: readonly CompatibleCognitiveProvider[];
  sources: readonly CognitiveArtifactSource[];
}

export interface RuntimeManagedArtifact {
  runtime: string;
  artifactRef: string;
  /** A runtime-native cryptographic identity when exposed by the runtime. */
  sha256?: string;
  sizeBytes?: number;
  /** Non-cryptographic runtime identity retained for provenance only. */
  runtimeIdentity?: string;
}

export interface CognitiveArtifactProvider {
  id: string;
  version: string;
}

export interface ArtifactFetchResponse {
  ok: boolean;
  status: number;
  url?: string;
  body: AsyncIterable<Uint8Array> | null;
}

export type ArtifactFetch = (
  url: string,
  init: { method: 'GET'; signal: AbortSignal },
) => Promise<ArtifactFetchResponse>;

export interface ResolveCognitiveArtifactOptions {
  provider: CognitiveArtifactProvider;
  cacheRoot?: string;
  localRoot?: string;
  runtimeArtifacts?: readonly RuntimeManagedArtifact[];
  /** Defaults false. Downloads are always explicit. */
  allowDownload?: boolean;
  /** When true no HTTPS source is contacted, even if allowDownload is true. */
  offline?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: ArtifactFetch;
}

export type CognitiveArtifactResolution =
  | {
      status: 'available';
      artifactId: string;
      sha256: string;
      sizeBytes: number;
      source: CognitiveArtifactSource;
      location:
        | { kind: 'cache'; path: string }
        | { kind: 'local-file'; path: string }
        | {
            kind: 'runtime-managed';
            runtime: string;
            artifactRef: string;
            runtimeIdentity?: string;
          };
      reused: boolean;
    }
  | {
      status: 'download-required';
      artifactId: string;
      sha256: string;
      sizeBytes: number;
      source: Extract<CognitiveArtifactSource, { kind: 'https' }>;
      cachePath: string;
    }
  | {
      status: 'unavailable';
      artifactId: string;
      sha256: string;
      sizeBytes: number;
      reason:
        | 'provider-incompatible'
        | 'no-usable-source'
        | 'offline-cache-miss'
        | 'runtime-artifact-unverified';
      detail?: string;
    };

const ARTIFACT_KINDS = new Set<CognitiveArtifactKind>([
  'embedding-model',
  'prototype-set',
  'index',
  'profile',
  'other',
]);

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export function cognitiveArtifactManifestSchemaJson(): Record<string, unknown> {
  return {
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    '$id': COGNITIVE_ARTIFACT_MANIFEST_SCHEMA,
    title: 'MMI Cognitive Artifact Manifest v0',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema',
      'schemaVersion',
      'artifactId',
      'kind',
      'version',
      'sha256',
      'sizeBytes',
      'license',
      'compatibleProviders',
      'sources',
    ],
    properties: {
      schema: { const: COGNITIVE_ARTIFACT_MANIFEST_SCHEMA },
      schemaVersion: { const: COGNITIVE_ARTIFACT_SCHEMA_VERSION },
      artifactId: { type: 'string', minLength: 1 },
      kind: {
        type: 'string',
        enum: [...ARTIFACT_KINDS],
      },
      version: { type: 'string', minLength: 1 },
      sha256: {
        type: 'string',
        pattern: '^sha256:[0-9a-f]{64}  text: string,
): CognitiveArtifactManifestV0 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('cognitive artifact manifest is not valid JSON');
  }
  assertCognitiveArtifactManifest(value);
  return value;
}

export function assertCognitiveArtifactManifest(
  value: unknown,
): asserts value is CognitiveArtifactManifestV0 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cognitive artifact manifest must be an object');
  }
  const manifest = value as Partial<CognitiveArtifactManifestV0>
    & Record<string, unknown>;
  const allowed = [
    'artifactId',
    'compatibleProviders',
    'kind',
    'license',
    'schema',
    'schemaVersion',
    'sha256',
    'sizeBytes',
    'sources',
    'version',
  ].sort();
  const keys = Object.keys(manifest).sort();
  if (JSON.stringify(keys) !== JSON.stringify(allowed)) {
    throw new Error('cognitive artifact manifest has unsupported fields');
  }
  if (manifest.schema !== COGNITIVE_ARTIFACT_MANIFEST_SCHEMA) {
    throw new Error(
      `unsupported cognitive artifact schema: ${String(manifest.schema)}`,
    );
  }
  if (manifest.schemaVersion !== COGNITIVE_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `unsupported cognitive artifact schemaVersion: ${String(manifest.schemaVersion)}`,
    );
  }
  assertNonEmpty('artifactId', manifest.artifactId);
  assertNonEmpty('version', manifest.version);
  assertNonEmpty('license', manifest.license);
  if (
    typeof manifest.kind !== 'string'
    || !ARTIFACT_KINDS.has(manifest.kind as CognitiveArtifactKind)
  ) {
    throw new Error('cognitive artifact kind is unsupported');
  }
  assertDigest('sha256', manifest.sha256);
  if (
    !Number.isSafeInteger(manifest.sizeBytes)
    || (manifest.sizeBytes as number) < 0
  ) {
    throw new Error('cognitive artifact sizeBytes must be a non-negative integer');
  }
  if (
    !Array.isArray(manifest.compatibleProviders)
    || manifest.compatibleProviders.length === 0
  ) {
    throw new Error('cognitive artifact compatibleProviders must not be empty');
  }
  for (const [index, provider] of manifest.compatibleProviders.entries()) {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
      throw new Error(`compatibleProviders[${index}] must be an object`);
    }
    const keys = Object.keys(provider as Record<string, unknown>).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['id', 'version'])) {
      throw new Error(
        `compatibleProviders[${index}] has unsupported fields`,
      );
    }
    assertNonEmpty(
      `compatibleProviders[${index}].id`,
      (provider as CompatibleCognitiveProvider).id,
    );
    assertNonEmpty(
      `compatibleProviders[${index}].version`,
      (provider as CompatibleCognitiveProvider).version,
    );
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error('cognitive artifact sources must not be empty');
  }
  manifest.sources.forEach(assertSource);
}

export function cognitiveArtifactCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  if (env.MMI_COGNITIVE_ARTIFACT_CACHE?.trim()) {
    return path.resolve(env.MMI_COGNITIVE_ARTIFACT_CACHE);
  }
  if (platform === 'win32' && env.LOCALAPPDATA?.trim()) {
    return path.win32.join(
      env.LOCALAPPDATA,
      'MMI',
      'cognitive-artifacts',
    );
  }
  const base = env.XDG_CACHE_HOME?.trim()
    ? path.resolve(env.XDG_CACHE_HOME)
    : path.join(home, '.cache');
  return path.join(base, 'mmi', 'cognitive-artifacts');
}

export function cognitiveArtifactCachePath(
  cacheRoot: string,
  sha256: string,
): string {
  assertDigest('sha256', sha256);
  const hex = sha256.slice('sha256:'.length);
  return path.join(path.resolve(cacheRoot), 'sha256', hex.slice(0, 2), hex);
}

export function isProviderCompatible(
  manifest: CognitiveArtifactManifestV0,
  provider: CognitiveArtifactProvider,
): boolean {
  return manifest.compatibleProviders.some(
    (item) => item.id === provider.id && item.version === provider.version,
  );
}

export async function resolveCognitiveArtifact(
  manifest: CognitiveArtifactManifestV0,
  options: ResolveCognitiveArtifactOptions,
): Promise<CognitiveArtifactResolution> {
  assertCognitiveArtifactManifest(manifest);

  if (!isProviderCompatible(manifest, options.provider)) {
    return {
      status: 'unavailable',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      reason: 'provider-incompatible',
      detail: `${options.provider.id}@${options.provider.version} is not listed by the manifest`,
    };
  }

  const cacheRoot = options.cacheRoot ?? cognitiveArtifactCacheRoot();
  const cachePath = cognitiveArtifactCachePath(cacheRoot, manifest.sha256);
  if (fs.existsSync(cachePath)) {
    await verifyArtifactFile(cachePath, manifest);
    return {
      status: 'available',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      source: firstCacheSource(manifest),
      location: { kind: 'cache', path: cachePath },
      reused: true,
    };
  }

  let runtimeUnverified = false;
  for (const source of manifest.sources) {
    if (source.kind === 'runtime-managed') {
      const resolved = resolveRuntimeManagedSource(
        manifest,
        source,
        options.runtimeArtifacts ?? [],
      );
      if (resolved) return resolved;
      if (hasRuntimeArtifact(source, options.runtimeArtifacts ?? [])) {
        runtimeUnverified = true;
      }
      continue;
    }

    if (source.kind === 'local-file') {
      if (!options.localRoot) continue;
      const localPath = resolveLocalArtifactPath(options.localRoot, source.uri);
      if (!localPath || !fs.existsSync(localPath)) continue;
      await verifyArtifactFile(localPath, manifest);
      return {
        status: 'available',
        artifactId: manifest.artifactId,
        sha256: manifest.sha256,
        sizeBytes: manifest.sizeBytes,
        source,
        location: { kind: 'local-file', path: localPath },
        reused: true,
      };
    }
  }

  const remote = manifest.sources.find(
    (source): source is Extract<CognitiveArtifactSource, { kind: 'https' }> =>
      source.kind === 'https',
  );

  if (!remote) {
    return {
      status: 'unavailable',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      reason: runtimeUnverified
        ? 'runtime-artifact-unverified'
        : 'no-usable-source',
      ...(runtimeUnverified
        ? { detail: 'runtime reported the artifact but did not expose a matching sha256 identity' }
        : {}),
    };
  }

  if (options.offline) {
    return {
      status: 'unavailable',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      reason: 'offline-cache-miss',
    };
  }

  if (!options.allowDownload) {
    return {
      status: 'download-required',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      source: remote,
      cachePath,
    };
  }

  const fetchImpl = options.fetchImpl
    ?? (fetch as unknown as ArtifactFetch);
  await downloadHttpsArtifact(
    manifest,
    remote,
    cachePath,
    fetchImpl,
    options,
  );
  return {
    status: 'available',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    source: remote,
    location: { kind: 'cache', path: cachePath },
    reused: false,
  };
}

export async function verifyArtifactFile(
  filepath: string,
  manifest: Pick<CognitiveArtifactManifestV0, 'sha256' | 'sizeBytes'>,
): Promise<void> {
  const stat = fs.statSync(filepath);
  if (!stat.isFile()) {
    throw new Error(`cognitive artifact is not a file: ${filepath}`);
  }
  if (stat.size !== manifest.sizeBytes) {
    throw new Error(
      `cognitive artifact size mismatch: expected ${manifest.sizeBytes}, got ${stat.size}`,
    );
  }
  const digest = await sha256File(filepath);
  if (digest !== manifest.sha256) {
    throw new Error(
      `cognitive artifact digest mismatch: expected ${manifest.sha256}, got ${digest}`,
    );
  }
}

async function sha256File(filepath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filepath)) {
    hash.update(chunk);
  }
  return `sha256:${hash.digest('hex')}`;
}

function resolveRuntimeManagedSource(
  manifest: CognitiveArtifactManifestV0,
  source: Extract<CognitiveArtifactSource, { kind: 'runtime-managed' }>,
  artifacts: readonly RuntimeManagedArtifact[],
): CognitiveArtifactResolution | undefined {
  const artifact = artifacts.find(
    (item) =>
      item.runtime === source.runtime
      && item.artifactRef === source.artifactRef,
  );
  if (!artifact?.sha256) return undefined;
  if (artifact.sha256 !== manifest.sha256) return undefined;
  if (
    artifact.sizeBytes !== undefined
    && artifact.sizeBytes !== manifest.sizeBytes
  ) {
    throw new Error(
      `runtime-managed artifact size mismatch for ${source.runtime}:${source.artifactRef}`,
    );
  }
  return {
    status: 'available',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    source,
    location: {
      kind: 'runtime-managed',
      runtime: source.runtime,
      artifactRef: source.artifactRef,
      ...(artifact.runtimeIdentity
        ? { runtimeIdentity: artifact.runtimeIdentity }
        : {}),
    },
    reused: true,
  };
}

function hasRuntimeArtifact(
  source: Extract<CognitiveArtifactSource, { kind: 'runtime-managed' }>,
  artifacts: readonly RuntimeManagedArtifact[],
): boolean {
  return artifacts.some(
    (item) =>
      item.runtime === source.runtime
      && item.artifactRef === source.artifactRef,
  );
}

async function downloadHttpsArtifact(
  manifest: CognitiveArtifactManifestV0,
  source: Extract<CognitiveArtifactSource, { kind: 'https' }>,
  cachePath: string,
  fetchImpl: ArtifactFetch,
  options: ResolveCognitiveArtifactOptions,
): Promise<void> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const response = await fetchImpl(source.uri, {
    method: 'GET',
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `cognitive artifact download failed with HTTP ${response.status}`,
    );
  }
  if (response.url) assertHttpsUri(response.url);

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const temp = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  const output = fs.createWriteStream(temp, { flags: 'wx' });
  const hash = createHash('sha256');
  let bytes = 0;

  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > manifest.sizeBytes) {
        throw new Error(
          `cognitive artifact download exceeded expected size ${manifest.sizeBytes}`,
        );
      }
      hash.update(chunk);
      if (!output.write(chunk)) {
        await new Promise<void>((resolve, reject) => {
          output.once('drain', resolve);
          output.once('error', reject);
        });
      }
    }
    output.end();
    await finished(output);

    if (bytes !== manifest.sizeBytes) {
      throw new Error(
        `cognitive artifact size mismatch: expected ${manifest.sizeBytes}, got ${bytes}`,
      );
    }
    const digest = `sha256:${hash.digest('hex')}`;
    if (digest !== manifest.sha256) {
      throw new Error(
        `cognitive artifact digest mismatch: expected ${manifest.sha256}, got ${digest}`,
      );
    }

    if (fs.existsSync(cachePath)) {
      await verifyArtifactFile(cachePath, manifest);
      fs.rmSync(temp, { force: true });
      return;
    }
    fs.renameSync(temp, cachePath);
  } catch (error) {
    output.destroy();
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

function resolveLocalArtifactPath(
  localRoot: string,
  uri: string,
): string | undefined {
  if (uri.includes('\0')) return undefined;
  const root = fs.realpathSync(path.resolve(localRoot));
  const candidate = path.resolve(root, uri);
  let resolved: string;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    return undefined;
  }
  const relative = path.relative(root, resolved);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return resolved;
}

function firstCacheSource(
  manifest: CognitiveArtifactManifestV0,
): CognitiveArtifactSource {
  return manifest.sources[0];
}

function assertSource(
  source: CognitiveArtifactSource,
  index: number,
): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`sources[${index}] must be an object`);
  }
  if (source.kind === 'local-file') {
    assertExactKeys(source, ['kind', 'uri'], `sources[${index}]`);
    assertNonEmpty(`sources[${index}].uri`, source.uri);
    if (
      path.posix.isAbsolute(source.uri)
      || path.win32.isAbsolute(source.uri)
    ) {
      throw new Error(`sources[${index}].uri must be relative to localRoot`);
    }
    return;
  }
  if (source.kind === 'https') {
    assertExactKeys(source, ['kind', 'uri'], `sources[${index}]`);
    assertHttpsUri(source.uri);
    return;
  }
  if (source.kind === 'runtime-managed') {
    assertExactKeys(
      source,
      ['artifactRef', 'kind', 'runtime', 'uri'],
      `sources[${index}]`,
    );
    assertNonEmpty(`sources[${index}].uri`, source.uri);
    assertNonEmpty(`sources[${index}].runtime`, source.runtime);
    assertNonEmpty(`sources[${index}].artifactRef`, source.artifactRef);
    if (!source.uri.startsWith('runtime:')) {
      throw new Error(
        `sources[${index}].uri must use the runtime: scheme`,
      );
    }
    return;
  }
  throw new Error(`sources[${index}].kind is unsupported`);
}

function assertHttpsUri(uri: string): void {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error(`cognitive artifact source is not a valid URL: ${uri}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`cognitive artifact remote source must use HTTPS: ${uri}`);
  }
  if (url.username || url.password) {
    throw new Error('cognitive artifact source URI must not embed credentials');
  }
}

function assertExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unsupported fields`);
  }
}

function assertNonEmpty(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertDigest(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  }
}
,
      },
      sizeBytes: {
        type: 'integer',
        minimum: 0,
      },
      license: { type: 'string', minLength: 1 },
      compatibleProviders: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'version'],
          properties: {
            id: { type: 'string', minLength: 1 },
            version: { type: 'string', minLength: 1 },
          },
        },
      },
      sources: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'uri'],
              properties: {
                kind: { const: 'local-file' },
                uri: { type: 'string', minLength: 1 },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'uri'],
              properties: {
                kind: { const: 'https' },
                uri: {
                  type: 'string',
                  pattern: '^https://',
                },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'uri', 'runtime', 'artifactRef'],
              properties: {
                kind: { const: 'runtime-managed' },
                uri: { type: 'string', pattern: '^runtime:' },
                runtime: { type: 'string', minLength: 1 },
                artifactRef: { type: 'string', minLength: 1 },
              },
            },
          ],
        },
      },
    },
  };
}

export function parseCognitiveArtifactManifest(
  text: string,
): CognitiveArtifactManifestV0 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('cognitive artifact manifest is not valid JSON');
  }
  assertCognitiveArtifactManifest(value);
  return value;
}

export function assertCognitiveArtifactManifest(
  value: unknown,
): asserts value is CognitiveArtifactManifestV0 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cognitive artifact manifest must be an object');
  }
  const manifest = value as Partial<CognitiveArtifactManifestV0>
    & Record<string, unknown>;
  const allowed = [
    'artifactId',
    'compatibleProviders',
    'kind',
    'license',
    'schema',
    'schemaVersion',
    'sha256',
    'sizeBytes',
    'sources',
    'version',
  ].sort();
  const keys = Object.keys(manifest).sort();
  if (JSON.stringify(keys) !== JSON.stringify(allowed)) {
    throw new Error('cognitive artifact manifest has unsupported fields');
  }
  if (manifest.schema !== COGNITIVE_ARTIFACT_MANIFEST_SCHEMA) {
    throw new Error(
      `unsupported cognitive artifact schema: ${String(manifest.schema)}`,
    );
  }
  if (manifest.schemaVersion !== COGNITIVE_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `unsupported cognitive artifact schemaVersion: ${String(manifest.schemaVersion)}`,
    );
  }
  assertNonEmpty('artifactId', manifest.artifactId);
  assertNonEmpty('version', manifest.version);
  assertNonEmpty('license', manifest.license);
  if (
    typeof manifest.kind !== 'string'
    || !ARTIFACT_KINDS.has(manifest.kind as CognitiveArtifactKind)
  ) {
    throw new Error('cognitive artifact kind is unsupported');
  }
  assertDigest('sha256', manifest.sha256);
  if (
    !Number.isSafeInteger(manifest.sizeBytes)
    || (manifest.sizeBytes as number) < 0
  ) {
    throw new Error('cognitive artifact sizeBytes must be a non-negative integer');
  }
  if (
    !Array.isArray(manifest.compatibleProviders)
    || manifest.compatibleProviders.length === 0
  ) {
    throw new Error('cognitive artifact compatibleProviders must not be empty');
  }
  for (const [index, provider] of manifest.compatibleProviders.entries()) {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
      throw new Error(`compatibleProviders[${index}] must be an object`);
    }
    const keys = Object.keys(provider as Record<string, unknown>).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['id', 'version'])) {
      throw new Error(
        `compatibleProviders[${index}] has unsupported fields`,
      );
    }
    assertNonEmpty(
      `compatibleProviders[${index}].id`,
      (provider as CompatibleCognitiveProvider).id,
    );
    assertNonEmpty(
      `compatibleProviders[${index}].version`,
      (provider as CompatibleCognitiveProvider).version,
    );
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error('cognitive artifact sources must not be empty');
  }
  manifest.sources.forEach(assertSource);
}

export function cognitiveArtifactCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  if (env.MMI_COGNITIVE_ARTIFACT_CACHE?.trim()) {
    return path.resolve(env.MMI_COGNITIVE_ARTIFACT_CACHE);
  }
  if (platform === 'win32' && env.LOCALAPPDATA?.trim()) {
    return path.win32.join(
      env.LOCALAPPDATA,
      'MMI',
      'cognitive-artifacts',
    );
  }
  const base = env.XDG_CACHE_HOME?.trim()
    ? path.resolve(env.XDG_CACHE_HOME)
    : path.join(home, '.cache');
  return path.join(base, 'mmi', 'cognitive-artifacts');
}

export function cognitiveArtifactCachePath(
  cacheRoot: string,
  sha256: string,
): string {
  assertDigest('sha256', sha256);
  const hex = sha256.slice('sha256:'.length);
  return path.join(path.resolve(cacheRoot), 'sha256', hex.slice(0, 2), hex);
}

export function isProviderCompatible(
  manifest: CognitiveArtifactManifestV0,
  provider: CognitiveArtifactProvider,
): boolean {
  return manifest.compatibleProviders.some(
    (item) => item.id === provider.id && item.version === provider.version,
  );
}

export async function resolveCognitiveArtifact(
  manifest: CognitiveArtifactManifestV0,
  options: ResolveCognitiveArtifactOptions,
): Promise<CognitiveArtifactResolution> {
  assertCognitiveArtifactManifest(manifest);

  if (!isProviderCompatible(manifest, options.provider)) {
    return {
      status: 'unavailable',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      reason: 'provider-incompatible',
      detail: `${options.provider.id}@${options.provider.version} is not listed by the manifest`,
    };
  }

  const cacheRoot = options.cacheRoot ?? cognitiveArtifactCacheRoot();
  const cachePath = cognitiveArtifactCachePath(cacheRoot, manifest.sha256);
  if (fs.existsSync(cachePath)) {
    await verifyArtifactFile(cachePath, manifest);
    return {
      status: 'available',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      source: firstCacheSource(manifest),
      location: { kind: 'cache', path: cachePath },
      reused: true,
    };
  }

  let runtimeUnverified = false;
  for (const source of manifest.sources) {
    if (source.kind === 'runtime-managed') {
      const resolved = resolveRuntimeManagedSource(
        manifest,
        source,
        options.runtimeArtifacts ?? [],
      );
      if (resolved) return resolved;
      if (hasRuntimeArtifact(source, options.runtimeArtifacts ?? [])) {
        runtimeUnverified = true;
      }
      continue;
    }

    if (source.kind === 'local-file') {
      if (!options.localRoot) continue;
      const localPath = resolveLocalArtifactPath(options.localRoot, source.uri);
      if (!localPath || !fs.existsSync(localPath)) continue;
      await verifyArtifactFile(localPath, manifest);
      return {
        status: 'available',
        artifactId: manifest.artifactId,
        sha256: manifest.sha256,
        sizeBytes: manifest.sizeBytes,
        source,
        location: { kind: 'local-file', path: localPath },
        reused: true,
      };
    }
  }

  const remote = manifest.sources.find(
    (source): source is Extract<CognitiveArtifactSource, { kind: 'https' }> =>
      source.kind === 'https',
  );

  if (!remote) {
    return {
      status: 'unavailable',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      reason: runtimeUnverified
        ? 'runtime-artifact-unverified'
        : 'no-usable-source',
      ...(runtimeUnverified
        ? { detail: 'runtime reported the artifact but did not expose a matching sha256 identity' }
        : {}),
    };
  }

  if (options.offline) {
    return {
      status: 'unavailable',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      reason: 'offline-cache-miss',
    };
  }

  if (!options.allowDownload) {
    return {
      status: 'download-required',
      artifactId: manifest.artifactId,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      source: remote,
      cachePath,
    };
  }

  const fetchImpl = options.fetchImpl
    ?? (fetch as unknown as ArtifactFetch);
  await downloadHttpsArtifact(
    manifest,
    remote,
    cachePath,
    fetchImpl,
    options,
  );
  return {
    status: 'available',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    source: remote,
    location: { kind: 'cache', path: cachePath },
    reused: false,
  };
}

export async function verifyArtifactFile(
  filepath: string,
  manifest: Pick<CognitiveArtifactManifestV0, 'sha256' | 'sizeBytes'>,
): Promise<void> {
  const stat = fs.statSync(filepath);
  if (!stat.isFile()) {
    throw new Error(`cognitive artifact is not a file: ${filepath}`);
  }
  if (stat.size !== manifest.sizeBytes) {
    throw new Error(
      `cognitive artifact size mismatch: expected ${manifest.sizeBytes}, got ${stat.size}`,
    );
  }
  const digest = await sha256File(filepath);
  if (digest !== manifest.sha256) {
    throw new Error(
      `cognitive artifact digest mismatch: expected ${manifest.sha256}, got ${digest}`,
    );
  }
}

async function sha256File(filepath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filepath)) {
    hash.update(chunk);
  }
  return `sha256:${hash.digest('hex')}`;
}

function resolveRuntimeManagedSource(
  manifest: CognitiveArtifactManifestV0,
  source: Extract<CognitiveArtifactSource, { kind: 'runtime-managed' }>,
  artifacts: readonly RuntimeManagedArtifact[],
): CognitiveArtifactResolution | undefined {
  const artifact = artifacts.find(
    (item) =>
      item.runtime === source.runtime
      && item.artifactRef === source.artifactRef,
  );
  if (!artifact?.sha256) return undefined;
  if (artifact.sha256 !== manifest.sha256) return undefined;
  if (
    artifact.sizeBytes !== undefined
    && artifact.sizeBytes !== manifest.sizeBytes
  ) {
    throw new Error(
      `runtime-managed artifact size mismatch for ${source.runtime}:${source.artifactRef}`,
    );
  }
  return {
    status: 'available',
    artifactId: manifest.artifactId,
    sha256: manifest.sha256,
    sizeBytes: manifest.sizeBytes,
    source,
    location: {
      kind: 'runtime-managed',
      runtime: source.runtime,
      artifactRef: source.artifactRef,
      ...(artifact.runtimeIdentity
        ? { runtimeIdentity: artifact.runtimeIdentity }
        : {}),
    },
    reused: true,
  };
}

function hasRuntimeArtifact(
  source: Extract<CognitiveArtifactSource, { kind: 'runtime-managed' }>,
  artifacts: readonly RuntimeManagedArtifact[],
): boolean {
  return artifacts.some(
    (item) =>
      item.runtime === source.runtime
      && item.artifactRef === source.artifactRef,
  );
}

async function downloadHttpsArtifact(
  manifest: CognitiveArtifactManifestV0,
  source: Extract<CognitiveArtifactSource, { kind: 'https' }>,
  cachePath: string,
  fetchImpl: ArtifactFetch,
  options: ResolveCognitiveArtifactOptions,
): Promise<void> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const response = await fetchImpl(source.uri, {
    method: 'GET',
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `cognitive artifact download failed with HTTP ${response.status}`,
    );
  }
  if (response.url) assertHttpsUri(response.url);

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const temp = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  const output = fs.createWriteStream(temp, { flags: 'wx' });
  const hash = createHash('sha256');
  let bytes = 0;

  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > manifest.sizeBytes) {
        throw new Error(
          `cognitive artifact download exceeded expected size ${manifest.sizeBytes}`,
        );
      }
      hash.update(chunk);
      if (!output.write(chunk)) {
        await new Promise<void>((resolve, reject) => {
          output.once('drain', resolve);
          output.once('error', reject);
        });
      }
    }
    output.end();
    await finished(output);

    if (bytes !== manifest.sizeBytes) {
      throw new Error(
        `cognitive artifact size mismatch: expected ${manifest.sizeBytes}, got ${bytes}`,
      );
    }
    const digest = `sha256:${hash.digest('hex')}`;
    if (digest !== manifest.sha256) {
      throw new Error(
        `cognitive artifact digest mismatch: expected ${manifest.sha256}, got ${digest}`,
      );
    }

    if (fs.existsSync(cachePath)) {
      await verifyArtifactFile(cachePath, manifest);
      fs.rmSync(temp, { force: true });
      return;
    }
    fs.renameSync(temp, cachePath);
  } catch (error) {
    output.destroy();
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

function resolveLocalArtifactPath(
  localRoot: string,
  uri: string,
): string | undefined {
  if (uri.includes('\0')) return undefined;
  const root = fs.realpathSync(path.resolve(localRoot));
  const candidate = path.resolve(root, uri);
  let resolved: string;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    return undefined;
  }
  const relative = path.relative(root, resolved);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return resolved;
}

function firstCacheSource(
  manifest: CognitiveArtifactManifestV0,
): CognitiveArtifactSource {
  return manifest.sources[0];
}

function assertSource(
  source: CognitiveArtifactSource,
  index: number,
): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`sources[${index}] must be an object`);
  }
  if (source.kind === 'local-file') {
    assertExactKeys(source, ['kind', 'uri'], `sources[${index}]`);
    assertNonEmpty(`sources[${index}].uri`, source.uri);
    if (
      path.posix.isAbsolute(source.uri)
      || path.win32.isAbsolute(source.uri)
    ) {
      throw new Error(`sources[${index}].uri must be relative to localRoot`);
    }
    return;
  }
  if (source.kind === 'https') {
    assertExactKeys(source, ['kind', 'uri'], `sources[${index}]`);
    assertHttpsUri(source.uri);
    return;
  }
  if (source.kind === 'runtime-managed') {
    assertExactKeys(
      source,
      ['artifactRef', 'kind', 'runtime', 'uri'],
      `sources[${index}]`,
    );
    assertNonEmpty(`sources[${index}].uri`, source.uri);
    assertNonEmpty(`sources[${index}].runtime`, source.runtime);
    assertNonEmpty(`sources[${index}].artifactRef`, source.artifactRef);
    if (!source.uri.startsWith('runtime:')) {
      throw new Error(
        `sources[${index}].uri must use the runtime: scheme`,
      );
    }
    return;
  }
  throw new Error(`sources[${index}].kind is unsupported`);
}

function assertHttpsUri(uri: string): void {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error(`cognitive artifact source is not a valid URL: ${uri}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`cognitive artifact remote source must use HTTPS: ${uri}`);
  }
  if (url.username || url.password) {
    throw new Error('cognitive artifact source URI must not embed credentials');
  }
}

function assertExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unsupported fields`);
  }
}

function assertNonEmpty(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertDigest(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  }
}
