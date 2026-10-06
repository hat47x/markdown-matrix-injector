/**
 * Local embedding provider (experimental, off by default; issue-0115 / issue-0113).
 *
 * Judges how close a described request is to a table by meaning, using a model
 * that is already running on this machine (Ollama, LM Studio, llama.cpp
 * server ...). Boundaries, in order of importance:
 *
 * - Local only: the endpoint must be a loopback address. A remote or LAN host
 *   is refused, so no table text can leave the machine through this path.
 * - Nothing is installed or downloaded. Without a running runtime and a model
 *   the provider reports `unavailable` and search continues as before.
 * - Only derived text is sent: book / sheet / title / header names. Cell
 *   values and the request's own words are the whole input -- never the
 *   workbook.
 * - It never decides: its output is a ranking with a per-provider score that
 *   the caller offers as inferred candidates for a person to choose.
 */
import type { CognitiveProviderDescriptor } from '../../experimental/cognitiveContract.js';

export type EmbeddingApi = 'ollama' | 'openai-compatible';

export interface EmbeddingProviderConfig {
  api: EmbeddingApi;
  /** Base URL, e.g. `http://127.0.0.1:11434`. Must be loopback. */
  endpoint: string;
  model: string;
  /** Some models (e5, bge) expect a task prefix on queries and on documents. */
  queryPrefix?: string;
  documentPrefix?: string;
  timeoutMs?: number;
}

export interface EmbeddingProvider {
  readonly descriptor: CognitiveProviderDescriptor;
  readonly model: string;
  readonly queryPrefix: string;
  readonly documentPrefix: string;
  /** One vector per input, or `undefined` when the runtime/model is unavailable. */
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][] | undefined>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** `undefined` when the endpoint is acceptable, otherwise the reason it is refused. */
export function endpointProblem(endpoint: string): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'endpointがURLではありません。';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'endpointはhttp/httpsのみです。';
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    return 'endpointはこの端末内（localhost / 127.0.0.1 / ::1）に限られます。表の見出しを端末の外へ送らないためです。';
  }
  if (url.username || url.password) return 'endpointに認証情報を含められません。';
  return undefined;
}

const MAX_BATCH = 32;

export function createEmbeddingProvider(config: EmbeddingProviderConfig, fetchImpl: FetchLike = fetch as unknown as FetchLike): EmbeddingProvider {
  const problem = endpointProblem(config.endpoint);
  if (problem) throw new Error(problem);
  if (config.model.trim() === '') throw new Error('modelが指定されていません。');
  const base = config.endpoint.replace(/\/+$/u, '');
  const url = config.api === 'ollama' ? `${base}/api/embed` : `${base}/v1/embeddings`;

  const call = async (inputs: readonly string[], signal: AbortSignal | undefined): Promise<number[][] | undefined> => {
    const timeout = AbortSignal.timeout(config.timeoutMs ?? 20_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.model, input: inputs }),
        signal: combined,
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { embeddings?: unknown; data?: Array<{ embedding?: unknown }> };
      const raw = config.api === 'ollama' ? body.embeddings : body.data?.map((item) => item.embedding);
      if (!Array.isArray(raw) || raw.length !== inputs.length) return undefined;
      const vectors: number[][] = [];
      for (const vector of raw) {
        if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return undefined;
        vectors.push(vector as number[]);
      }
      return vectors;
    } catch {
      return undefined; // runtime absent, timeout, abort: unavailable, never an error to the user
    }
  };

  return {
    descriptor: {
      id: `local-embedding:${config.api}`,
      version: '1',
      category: 'perception',
      executionBoundary: 'local',
      capabilities: ['text-embedding'],
    },
    model: config.model,
    queryPrefix: config.queryPrefix ?? '',
    documentPrefix: config.documentPrefix ?? '',
    async embed(texts, signal) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH) {
        const vectors = await call(texts.slice(i, i + MAX_BATCH), signal);
        if (!vectors) return undefined;
        out.push(...vectors);
      }
      return out;
    },
  };
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
