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
import { RegionSearchIndex, type RetrievalMethod } from './searchIndex.js';
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
}

export interface RefreshResult extends IndexFilesResult {
  regions: number;
  method: RetrievalMethod;
}

export class WorkspaceRegionIndex {
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
    const current = (candidate: CompileResult['candidates'][number]): boolean => {
      try {
        const stat = this.options.statFile(candidate.region.bookPath);
        if (this.catalog.needsUpdate(candidate.region.bookPath, stat)) return false;
        const workbook = this.options.loadWorkbook(candidate.region.bookPath);
        return verifyRegion(candidate.region, workbook.sheets[candidate.region.sheet]).ok;
      } catch {
        return false;
      }
    };
    if (result.status !== 'candidates') {
      return result.nearMisses ? { ...result, nearMisses: result.nearMisses.filter(current) } : result;
    }
    const fresh = result.candidates.filter(current);
    if (fresh.length === 0) {
      return { ...result, status: 'no-match', candidates: [], reasons: ['候補の原本が変更されています。索引を更新してから再度検索してください。'] };
    }
    return { ...result, candidates: fresh };
  }

  clear(): void {
    this.catalog.clear();
    this.index = new RegionSearchIndex(this.catalog, { methods: [this.method] });
  }
}
