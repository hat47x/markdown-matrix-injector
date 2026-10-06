import type { RuntimeManagedArtifact } from '../../core/cognitiveArtifact.js';
import { endpointProblem, type EmbeddingApi } from './embeddingProvider.js';

export type LocalEmbeddingRuntime = 'ollama' | 'lm-studio';

export interface DiscoveredEmbeddingModel {
  runtime: LocalEmbeddingRuntime;
  api: EmbeddingApi;
  endpoint: string;
  model: string;
  displayName: string;
  artifactDigest?: string;
  sizeBytes?: number;
}

export function runtimeManagedArtifactFromEmbeddingModel(
  model: DiscoveredEmbeddingModel,
): RuntimeManagedArtifact {
  return {
    runtime: model.runtime,
    artifactRef: model.model,
    runtimeIdentity: model.model,
    ...(model.artifactDigest ? { sha256: model.artifactDigest } : {}),
    ...(model.sizeBytes !== undefined ? { sizeBytes: model.sizeBytes } : {}),
  };
}

export interface ExpectedEmbeddingArtifactIdentity {
  api: EmbeddingApi;
  endpoint: string;
  model: string;
  expectedArtifactDigest?: string;
}

/**
 * Verify a configured model alias against a runtime-native cryptographic
 * identity before provider-dependent ranking runs. v0 can verify Ollama
 * because /api/tags exposes sha256 digests. OpenAI-compatible runtimes that do
 * not expose a digest cannot satisfy an expected digest and therefore fail
 * closed instead of silently accepting an alias.
 */
export async function verifyEmbeddingArtifactIdentity(
  selection: ExpectedEmbeddingArtifactIdentity,
  fetchImpl: DiscoveryFetch = fetch as unknown as DiscoveryFetch,
  options: Pick<LocalEmbeddingDiscoveryOptions, 'signal' | 'timeoutMs'> = {},
): Promise<boolean> {
  const expected = selection.expectedArtifactDigest?.trim();
  if (!expected) return true;
  if (!/^sha256:[0-9a-f]{64}$/u.test(expected)) return false;
  if (selection.api !== 'ollama') return false;

  const safe = safeEndpoint(selection.endpoint);
  if (!safe) return false;
  const listed = await fetchJson(
    fetchImpl,
    `${safe}/api/tags`,
    { method: 'GET' },
    options.signal,
    options.timeoutMs ?? 1_500,
  ) as {
    models?: Array<{
      name?: unknown;
      model?: unknown;
      digest?: unknown;
      remote_model?: unknown;
      remote_host?: unknown;
    }>;
  } | undefined;
  if (!Array.isArray(listed?.models)) return false;

  const matching = listed.models.find((item) => {
    const model = typeof item.model === 'string'
      ? item.model
      : typeof item.name === 'string'
        ? item.name
        : undefined;
    const remote =
      (typeof item.remote_model === 'string' && item.remote_model.length > 0)
      || (typeof item.remote_host === 'string' && item.remote_host.length > 0);
    return model === selection.model && !remote;
  });
  if (!matching || typeof matching.digest !== 'string') return false;
  const digest = matching.digest.startsWith('sha256:')
    ? matching.digest
    : `sha256:${matching.digest}`;
  return digest === expected;
}

export interface LocalEmbeddingDiscoveryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  ollamaEndpoint?: string;
  lmStudioEndpoint?: string;
}

export type DiscoveryFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://127.0.0.1:1234';
const MAX_DISCOVERY_MODELS = 128;

function combinedSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchJson(
  fetchImpl: DiscoveryFetch,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<unknown | undefined> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: combinedSignal(signal, timeoutMs),
    });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

function safeEndpoint(endpoint: string): string | undefined {
  const trimmed = endpoint.replace(/\/+$/u, '');
  return endpointProblem(trimmed) ? undefined : trimmed;
}

async function discoverOllama(
  fetchImpl: DiscoveryFetch,
  endpoint: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<DiscoveredEmbeddingModel[]> {
  const safe = safeEndpoint(endpoint);
  if (!safe) return [];

  const listed = await fetchJson(
    fetchImpl,
    `${safe}/api/tags`,
    { method: 'GET' },
    signal,
    timeoutMs,
  ) as {
    models?: Array<{
      name?: unknown;
      model?: unknown;
      digest?: unknown;
      size?: unknown;
      remote_model?: unknown;
      remote_host?: unknown;
    }>;
  } | undefined;
  if (!Array.isArray(listed?.models)) return [];

  const summaries = listed.models
    .flatMap((item) => {
      const model = typeof item.model === 'string'
        ? item.model
        : typeof item.name === 'string'
          ? item.name
          : undefined;
      const remote =
        (typeof item.remote_model === 'string' && item.remote_model.length > 0)
        || (typeof item.remote_host === 'string' && item.remote_host.length > 0);
      return model && !remote ? [{
        model,
        digest:
          typeof item.digest === 'string' ? item.digest : undefined,
        size:
          typeof item.size === 'number' && Number.isFinite(item.size)
            ? item.size
            : undefined,
      }] : [];
    })
    .slice(0, MAX_DISCOVERY_MODELS);

  const discovered = await Promise.all(
    summaries.map(async (summary) => {
      const shown = await fetchJson(
        fetchImpl,
        `${safe}/api/show`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: summary.model }),
        },
        signal,
        timeoutMs,
      ) as { capabilities?: unknown } | undefined;
      if (
        !Array.isArray(shown?.capabilities)
        || !shown.capabilities.some((item) => item === 'embedding')
      ) {
        return undefined;
      }
      return {
        runtime: 'ollama' as const,
        api: 'ollama' as const,
        endpoint: safe,
        model: summary.model,
        displayName: summary.model,
        ...(summary.digest
          ? { artifactDigest: summary.digest.startsWith('sha256:')
              ? summary.digest
              : `sha256:${summary.digest}` }
          : {}),
        ...(summary.size !== undefined
          ? { sizeBytes: summary.size }
          : {}),
      };
    }),
  );

  return discovered.flatMap((item) => item ? [item] : []);
}

async function discoverLmStudio(
  fetchImpl: DiscoveryFetch,
  endpoint: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<DiscoveredEmbeddingModel[]> {
  const safe = safeEndpoint(endpoint);
  if (!safe) return [];

  const listed = await fetchJson(
    fetchImpl,
    `${safe}/api/v1/models`,
    { method: 'GET' },
    signal,
    timeoutMs,
  ) as {
    models?: Array<{
      type?: unknown;
      key?: unknown;
      display_name?: unknown;
      size_bytes?: unknown;
    }>;
  } | undefined;
  if (!Array.isArray(listed?.models)) return [];

  return listed.models
    .flatMap((item) => {
      if (item.type !== 'embedding' || typeof item.key !== 'string') {
        return [];
      }
      return [{
        runtime: 'lm-studio' as const,
        api: 'openai-compatible' as const,
        endpoint: safe,
        model: item.key,
        displayName:
          typeof item.display_name === 'string' && item.display_name.trim()
            ? item.display_name
            : item.key,
        ...(typeof item.size_bytes === 'number'
          && Number.isFinite(item.size_bytes)
          ? { sizeBytes: item.size_bytes }
          : {}),
      }];
    })
    .slice(0, MAX_DISCOVERY_MODELS);
}

export async function discoverLocalEmbeddingModels(
  fetchImpl: DiscoveryFetch = fetch as unknown as DiscoveryFetch,
  options: LocalEmbeddingDiscoveryOptions = {},
): Promise<DiscoveredEmbeddingModel[]> {
  const timeoutMs = options.timeoutMs ?? 1_500;
  const [ollama, lmStudio] = await Promise.all([
    discoverOllama(
      fetchImpl,
      options.ollamaEndpoint ?? DEFAULT_OLLAMA_ENDPOINT,
      options.signal,
      timeoutMs,
    ),
    discoverLmStudio(
      fetchImpl,
      options.lmStudioEndpoint ?? DEFAULT_LM_STUDIO_ENDPOINT,
      options.signal,
      timeoutMs,
    ),
  ]);

  return [...ollama, ...lmStudio].sort(
    (left, right) =>
      left.runtime.localeCompare(right.runtime)
      || left.displayName.localeCompare(right.displayName)
      || left.model.localeCompare(right.model),
  );
}
