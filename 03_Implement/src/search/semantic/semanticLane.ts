/**
 * Semantic lane (experimental, off by default): ranks regions by the meaning
 * of a described request with a local embedding provider, for requests whose
 * words appear nowhere in the table's names ("予行演習" for リハーサル).
 *
 * Runs only after the name lane and the structural paraphrase lane found
 * nothing, and only for a request that describes a table (never for a named
 * one, a quoted name, or a task MMI cannot do). Output is inferred,
 * provider-dependent candidates (ADR-0018/0020 M2) carrying the provider's
 * score; a person chooses, nothing is confirmed.
 */
import { describableRequest, inferredCandidate, SOFT_UNSUPPORTED_CONSTRUCTS, type Candidate } from '../nlQuery/compiler.js';
import type { QueryIR } from '../nlQuery/parser.js';
import type { RegionRecord } from '../regionCatalog.js';
import { cosine, type EmbeddingProvider } from './embeddingProvider.js';

export interface SemanticLaneOptions {
  /** Cosine at or above which a region is offered. Model-dependent; no default is portable. */
  minScore?: number;
  /** At most this many candidates. */
  maxCandidates?: number;
  /** Candidates must be within this distance of the best score (a flat ranking says nothing). */
  window?: number;
}

/** The text a region is known by to the model: names only, never cell values. */
export function regionDescriptor(region: RegionRecord): string {
  const book = region.bookStem;
  const parts = [`ブック: ${book}`, `シート: ${region.sheet}`];
  if (region.title) parts.push(`表題: ${region.title}`);
  if (region.headers && region.headers.length > 0) parts.push(`見出し: ${region.headers.join('、')}`);
  return parts.join(' / ');
}

export class SemanticRegionRanker {
  private readonly cache = new Map<string, number[]>();

  constructor(private readonly provider: EmbeddingProvider) {}

  clear(): void {
    this.cache.clear();
  }

  /** Scored regions, best first; `undefined` when the provider is unavailable. */
  async rank(request: string, regions: readonly RegionRecord[], signal?: AbortSignal): Promise<Array<{ region: RegionRecord; score: number }> | undefined> {
    const descriptors = regions.map((region) => regionDescriptor(region));
    const missing = descriptors
      .map((text, index) => ({ key: `${regions[index].id}\u0000${text}`, text }))
      .filter((item) => !this.cache.has(item.key));
    if (missing.length > 0) {
      const vectors = await this.provider.embed(missing.map((item) => this.provider.documentPrefix + item.text), signal);
      if (!vectors) return undefined;
      missing.forEach((item, index) => this.cache.set(item.key, vectors[index]));
    }
    const query = await this.provider.embed([this.provider.queryPrefix + request], signal);
    if (!query) return undefined;
    return regions
      .map((region, index) => ({ region, score: cosine(query[0], this.cache.get(`${region.id}\u0000${descriptors[index]}`)!) }))
      .sort((a, b) => b.score - a.score || a.region.id.localeCompare(b.region.id));
  }
}

export async function semanticCandidates(
  ir: QueryIR,
  regions: readonly RegionRecord[],
  ranker: SemanticRegionRanker,
  provider: EmbeddingProvider,
  relativePath: (bookPath: string) => string,
  options: SemanticLaneOptions = {},
  signal?: AbortSignal,
): Promise<Candidate[]> {
  if (!describableRequest(ir, SOFT_UNSUPPORTED_CONSTRUCTS) || regions.length === 0) return [];
  const ranked = await ranker.rank(ir.input, regions, signal);
  if (!ranked) return [];
  const minScore = options.minScore ?? 0.6;
  const window = options.window ?? 0.08;
  const best = ranked[0]?.score ?? 0;
  if (best < minScore) return [];
  const candidates: Candidate[] = [];
  for (const { region, score } of ranked) {
    if (candidates.length >= (options.maxCandidates ?? 3) || score < minScore || best - score > window) break;
    const candidate = inferredCandidate(
      region,
      ir,
      relativePath,
      'semantic',
      score,
      `表名の言葉ではなく、依頼との意味の近さ（ローカルモデル ${provider.model}、類似度 ${score.toFixed(2)}）から推定した候補です。実験的機能の結果で、誤りを含みます。確認してから選んでください。`,
      { provider: provider.descriptor.id, model: provider.model, score },
    );
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}
