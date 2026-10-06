/**
 * The workspace-level table index behind "find a table by description"
 * (issue-0115 in the product). VS Code-free so it can be tested directly.
 *
 * - Covers only the workbook files the caller lists (the workspace's own
 *   workbooks); holds content-derived data in memory only; `clear()` drops it.
 * - Refreshes by (mtime, size): only changed books are re-read. Refresh is
 *   cooperative, reports progress and honours an AbortSignal.
 * - Retrieval follows the measured decision (input-assistance-cpu-search.md
 *   §7.5): BM25 by default; FlyHash (with exact rerank) only once the index
 *   passes `flyhashThreshold` regions, where BM25 exceeded the latency target.
 * - Candidates are re-verified against the current source before they are
 *   returned; a stale one is dropped and its book re-indexed next time.
 */
import type { WorkbookData } from '../core/workbookLoader.js';
import { compileQuery, type CompileResult, type QueryAliasRule } from './nlQuery/compiler.js';
import { indexWorkbookFiles, RegionCatalog, type BookStat, type IndexFilesResult } from './regionCatalog.js';
import { createEmbeddingProvider, type EmbeddingProvider, type EmbeddingProviderConfig, type FetchLike } from './semantic/embeddingProvider.js';
import {
  verifyEmbeddingArtifactIdentity,
  type DiscoveryFetch,
} from './semantic/runtimeDiscovery.js';
import { semanticCandidates, SemanticRegionRanker, type SemanticLaneOptions } from './semantic/semanticLane.js';
import { RegionSearchIndex, type RetrievalMethod } from './searchIndex.js';
import type { RegionRecord } from './regionCatalog.js';
import { verifyRegion } from './verify.js';

/** Business dictionary (tuned on the dev query set only; see scripts/cpu-search-eval/dictionary.json). */
export const DEFAULT_SYNONYMS: readonly (readonly string[])[] = [
  ['API', 'インターフェース', 'IF'],
  ['障害', 'インシデント', '不具合'],
  ['スケジュール', '日程'],
  ['テスト', '試験'],
  ['問い合わせ', '問合せ', '問合わせ'],
  ['スペック', '構成'],
  ['見積', '見積もり'],
];

/**
 * High-precision directional descriptions for phrases that are not true
 * synonyms. Each rule needs two independent cues and two canonical terms;
 * compiler.ts ignores broader rules. This is retrieval assistance only and
 * never changes column semantics or emitted notation.
 */
export const DEFAULT_QUERY_ALIASES: readonly QueryAliasRule[] = [
  { cues: ['夜間', 'ジョブ'], terms: ['バッチ', '実行時刻'] },
  { cues: ['費用', '内訳'], terms: ['見積', '工程'] },
  { cues: ['付ける', 'ルール'], terms: ['ロール', '付与条件'] },
  { cues: ['バックアップ', 'どこ'], terms: ['バックアップ', '保管場所'] },
];

/** Shown to the user: what the restricted grammar accepts (design §3.3). */
export const QUERY_EXAMPLES = [
  '状態遷移表のIDと操作を見せて',
  'リリース判定の表から要確認を含む行',
  '設計.xlsxの画面一覧',
] as const;

export interface WorkspaceRegionIndexOptions {
  loadWorkbook(path: string): WorkbookData;
  statFile(path: string): BookStat;
  flyhashThreshold?: number;
  synonyms?: readonly (readonly string[])[];
  queryAliases?: readonly QueryAliasRule[];
  /** Upper bound on indexed regions (memory cap). */
  maxRegions?: number;
  /** Test seam for the experimental semantic lane's embedding HTTP call. */
  embeddingFetch?: FetchLike;
  /** Test seam for runtime-native artifact identity verification. */
  semanticIdentityFetch?: DiscoveryFetch;
}

export interface RefreshResult extends IndexFilesResult {
  regions: number;
  method: RetrievalMethod;
}

/** Experimental, off unless the caller passes it (the VS Code setting defaults to off). */
export interface SemanticSetting extends EmbeddingProviderConfig, SemanticLaneOptions {
  /** Above this many regions the semantic lane is skipped (every region is embedded once). */
  maxRegions?: number;
  /**
   * Optional runtime-native cryptographic identity captured when the user
   * selected the model. When present, semantic ranking runs only while the
   * runtime still reports the same artifact.
   */
  expectedArtifactDigest?: string;
}

const DEFAULT_SEMANTIC_MAX_REGIONS = 3000;

export class WorkspaceRegionIndex {
  private semantic?: { key: string; provider: EmbeddingProvider; ranker: SemanticRegionRanker };
  private readonly catalog = new RegionCatalog();
  private index = new RegionSearchIndex(this.catalog, { methods: ['bm25'] });
  private method: RetrievalMethod = 'bm25';
  private readonly threshold: number;

  constructor(private readonly options: WorkspaceRegionIndexOptions) {
    this.threshold = options.flyhashThreshold ?? 50_000;
  }

  get regionCount(): number {
    return this.catalog.regionCount;
  }

  get retrievalMethod(): RetrievalMethod {
    return this.method;
  }

  async refresh(paths: readonly string[], progress: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<RefreshResult> {
    const result = await indexWorkbookFiles(this.catalog, paths, {
      statFile: this.options.statFile,
      loadWorkbook: this.options.loadWorkbook,
      signal: progress.signal,
      onProgress: (done, total) => progress.onProgress?.(done, total),
      maxRegions: this.options.maxRegions ?? 150_000,
    });
    const wanted: RetrievalMethod = this.catalog.regionCount > this.threshold ? 'flyhash' : 'bm25';
    if (wanted !== this.method) {
      this.method = wanted;
      this.index = new RegionSearchIndex(this.catalog, { methods: [wanted] });
    }
    this.index.sync();
    return { ...result, regions: this.catalog.regionCount, method: this.method };
  }

  /**
   * Compiles a request against the index. Candidates whose headers/title no
   * longer match the source are removed (the book is marked for re-reading).
   */
  query(text: string, relativePath: (bookPath: string) => string, maxCandidates = 5): CompileResult {
    const result = compileQuery(text, {
      index: this.index,
      method: this.method,
      relativePath,
      synonyms: this.options.synonyms ?? DEFAULT_SYNONYMS,
      queryAliases: this.options.queryAliases ?? DEFAULT_QUERY_ALIASES,
      maxCandidates,
    });
    const current = (candidate: CompileResult['candidates'][number]): boolean => this.isCurrent(candidate);
    if (result.status !== 'candidates') {
      return result.nearMisses ? { ...result, nearMisses: result.nearMisses.filter(current) } : result;
    }
    const fresh = result.candidates.filter(current);
    if (fresh.length === 0) {
      return { ...result, status: 'no-match', candidates: [], reasons: ['候補の原本が変更されています。索引を更新してから再度検索してください。'] };
    }
    return { ...result, candidates: fresh };
  }

  private isCurrent(candidate: CompileResult['candidates'][number]): boolean {
    try {
      const stat = this.options.statFile(candidate.region.bookPath);
      if (this.catalog.needsUpdate(candidate.region.bookPath, stat)) return false;
      const workbook = this.options.loadWorkbook(candidate.region.bookPath);
      return verifyRegion(candidate.region, workbook.sheets[candidate.region.sheet]).ok;
    } catch {
      return false;
    }
  }

  /**
   * `query`, then -- only when it found nothing and a local embedding provider is configured -- the
   * experimental semantic lane. Without a setting, or when the provider is unavailable, this is
   * exactly `query`. Semantic candidates are re-verified against the source like any other.
   */
  async querySemantic(
    text: string,
    relativePath: (bookPath: string) => string,
    setting: SemanticSetting | undefined,
    signal?: AbortSignal,
    maxCandidates = 5,
  ): Promise<CompileResult> {
    const result = this.query(text, relativePath, maxCandidates);
    if (!setting || result.status === 'candidates' || result.status === 'needs-more-input') return result;
    const regions = this.allRegions();
    if (regions.length === 0 || regions.length > (setting.maxRegions ?? DEFAULT_SEMANTIC_MAX_REGIONS)) return result;
    let active: NonNullable<typeof this.semantic>;
    try {
      if (setting.expectedArtifactDigest) {
        const identityMatches = await verifyEmbeddingArtifactIdentity(
          setting,
          this.options.semanticIdentityFetch,
          { signal, timeoutMs: Math.min(setting.timeoutMs ?? 20_000, 1_500) },
        );
        if (!identityMatches) {
          this.semantic?.ranker.clear();
          this.semantic = undefined;
          return result;
        }
      }
      const key = JSON.stringify([
        setting.api,
        setting.endpoint,
        setting.model,
        setting.expectedArtifactDigest ?? '',
        setting.queryPrefix,
        setting.documentPrefix,
      ]);
      if (this.semantic?.key !== key) {
        const provider = createEmbeddingProvider(setting, this.options.embeddingFetch);
        this.semantic = { key, provider, ranker: new SemanticRegionRanker(provider) };
      }
      active = this.semantic;
    } catch {
      return result; // refused endpoint / identity mismatch / unavailable runtime: lexical result remains authoritative
    }
    const found = await semanticCandidates(result.ir, regions, active.ranker, active.provider, relativePath, { ...setting, maxCandidates: Math.min(maxCandidates, setting.maxCandidates ?? 3) }, signal);
    const fresh = found.filter((candidate) => this.isCurrent(candidate));
    return fresh.length > 0 ? { ...result, status: 'candidates', candidates: fresh, reasons: [] } : result;
  }

  /** All indexed regions, for evaluation harnesses. */
  allRegionsForEvaluation(): RegionRecord[] {
    return this.allRegions();
  }

  private allRegions(): RegionRecord[] {
    return this.index.bookPaths().flatMap((path) =>
      this.index.docsOfBook(path).map((doc) => this.index.region(doc)).filter((region): region is RegionRecord => region !== undefined));
  }

  clear(): void {
    this.semantic?.ranker.clear();
    this.semantic = undefined;
    this.catalog.clear();
    this.index = new RegionSearchIndex(this.catalog, { methods: [this.method] });
  }
}
