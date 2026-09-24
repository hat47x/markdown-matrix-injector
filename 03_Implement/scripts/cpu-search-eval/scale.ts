/**
 * Scale benchmark on SYNTHETIC data (input-assistance-cpu-search.md §5.2 /
 * §5.3) -- reported separately from the fictional business corpus.
 *
 *   node --import tsx scripts/cpu-search-eval/scale.ts [--books 10,100,1000]
 *        [--regions 1000,10000,100000] [--queries 200] [--iterations 3] [--out report.json]
 *
 * Book count and region count are independent axes. Each (books, regions)
 * pair runs in its own child process so peak RSS belongs to that pair only.
 * Measured separately, each with p50/p95 where it is a distribution:
 * cold load (per book), region detection (per book), index build (per
 * method), diff update (one book touched), warm retrieval, warm compile, and
 * compile + exact re-verification against the source. The OS page cache is
 * warm (files were just written); dropping it needs root and is not done.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

import { WorkbookCache } from '../../src/cache/workbookCache.js';
import { loadWorkbook, readSnapshot, type WorkbookData } from '../../src/core/workbookLoader.js';
import { compileQuery } from '../../src/search/nlQuery/compiler.js';
import { requestFeatureBag } from '../../src/search/nlQuery/compiler.js';
import { RegionCatalog } from '../../src/search/regionCatalog.js';
import { detectRegions } from '../../src/search/regionDetector.js';
import { Bm25Retriever, CosineRetriever, ExactTokenRetriever, FlyHashRetriever, type Retriever } from '../../src/search/retrievers.js';
import { RegionSearchIndex, RETRIEVAL_METHODS, type RetrievalMethod } from '../../src/search/searchIndex.js';
import { verifyRegion } from '../../src/search/verify.js';
import { environment, percentile } from './evaluate.js';

const SEED = 20260924;
const ROOT = path.join(os.tmpdir(), 'mmi-cpu-search-eval', 'scale');

const NOUNS =
  '受注 出荷 在庫 請求 入金 仕入 支払 顧客 商品 取引先 見積 契約 返品 検品 棚卸 発注 納品 売上 原価 予算 実績 部門 社員 勤怠 給与 経費 資産 償却 税務 監査 権限 ログ 障害 課題 変更 要件 設計 試験 移行 運用 監視 構成 帳票 画面 API バッチ 連携 マスタ 履歴 通知 承認 申請 集約 配送 倉庫 物流 品質 工程 教育 保守'.split(' ');
const SUFFIXES = '一覧 台帳 定義 管理表 明細 計画 実績表 チェックリスト マトリクス 対応表'.split(' ');
const HEADERS =
  'ID 名称 区分 状態 担当 期限 開始日 終了日 数量 金額 単価 備考 優先度 結果 判定 種別 コード 所属 更新日 登録日 承認者 版数 概要 対象 方式 頻度 件数 目標値 実績値 差異 理由 対応 影響 手順 条件 閾値 通知先 保管場所 世代 用途'.split(' ');
const VALUES = '未着手 対応中 完了 保留 高 中 低 OK NG 要確認 日次 週次 月次 随時 A B C 済 未 有 無 1 2 3 5 10 100'.split(' ');
const KANJI = '亜哀愛悪握扱安暗案以位囲医域育員因引飲院'.split('');

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SyntheticRegion {
  file: string;
  sheet: string;
  title: string;
  headers: string[];
}

/** Writes `books` xlsx files holding `regions` tables in total. Idempotent per (books, regions). */
function writeSynthetic(books: number, regions: number): { dir: string; truth: SyntheticRegion[] } {
  const dir = path.join(ROOT, `b${books}-r${regions}`);
  const truthFile = path.join(dir, 'truth.json');
  if (fs.existsSync(truthFile)) return { dir, truth: JSON.parse(fs.readFileSync(truthFile, 'utf8')) };
  fs.mkdirSync(dir, { recursive: true });
  const random = mulberry32(SEED + books * 7 + regions);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const truth: SyntheticRegion[] = [];
  const perSheet = 200;
  for (let b = 0; b < books; b += 1) {
    const count = Math.floor(regions / books) + (b < regions % books ? 1 : 0);
    const workbook = XLSX.utils.book_new();
    const file = `${pick(NOUNS)}${pick(NOUNS)}_${String(b).padStart(4, '0')}.xlsx`;
    for (let s = 0; s * perSheet < count; s += 1) {
      const ws: XLSX.WorkSheet = {};
      const sheetName = `${pick(NOUNS)}${s}`;
      let row = 0;
      let maxCol = 0;
      for (let r = s * perSheet; r < Math.min(count, (s + 1) * perSheet); r += 1) {
        const col0 = Math.floor(random() * 3);
        const title = `${pick(NOUNS)}${pick(NOUNS)}${pick(SUFFIXES)}${random() < 0.3 ? `第${1 + Math.floor(random() * 9)}版` : ''}`;
        const headers: string[] = [];
        while (headers.length < 4) {
          const header = pick(HEADERS);
          if (!headers.includes(header)) headers.push(header);
        }
        ws[XLSX.utils.encode_cell({ r: row, c: col0 })] = { t: 's', v: title };
        headers.forEach((header, c) => (ws[XLSX.utils.encode_cell({ r: row + 1, c: col0 + c })] = { t: 's', v: header }));
        for (let body = 0; body < 4; body += 1) {
          for (let c = 0; c < 4; c += 1) {
            const value = c === 0 ? `${headers[0]}-${r}-${body}` : pick(VALUES);
            ws[XLSX.utils.encode_cell({ r: row + 2 + body, c: col0 + c })] = /^\d+$/u.test(value)
              ? { t: 'n', v: Number(value) }
              : { t: 's', v: value };
          }
        }
        maxCol = Math.max(maxCol, col0 + 3);
        truth.push({ file, sheet: sheetName, title, headers });
        row += 7;
      }
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, row - 2), c: maxCol } });
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    }
    fs.writeFileSync(path.join(dir, file), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  }
  fs.writeFileSync(truthFile, JSON.stringify(truth));
  return { dir, truth };
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));
const now = (): number => performance.now();
const stats = (samples: number[]) => ({ p50: round(percentile(samples, 50)), p95: round(percentile(samples, 95)), n: samples.length });
const heap = (): number => {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().heapUsed;
};

function worker(books: number, regions: number, queryCount: number, iterations: number): Record<string, unknown> {
  const { dir, truth } = writeSynthetic(books, regions);
  const files = [...new Set(truth.map((region) => region.file))].map((file) => path.join(dir, file));

  // Cold load and detection, per book.
  const loadMs: number[] = [];
  const detectMs: number[] = [];
  const workbooks = new Map<string, WorkbookData>();
  const heapBase = heap();
  for (const file of files) {
    let t = now();
    const workbook = loadWorkbook({ absolutePath: file });
    loadMs.push(now() - t);
    t = now();
    for (const [name, sheet] of Object.entries(workbook.sheets)) detectRegions(name, sheet);
    detectMs.push(now() - t);
    workbooks.set(file, workbook);
  }
  const heapWorkbooks = heap() - heapBase;

  const catalog = new RegionCatalog();
  const statOf = (file: string) => {
    const stat = fs.statSync(file);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  };
  let t = now();
  for (const file of files) catalog.setBook(file, statOf(file), workbooks.get(file)!);
  const catalogMs = now() - t;

  const heapBeforeIndex = heap();
  const index = new RegionSearchIndex(catalog);
  t = now();
  index.sync();
  const fullSyncMs = now() - t;
  const heapIndexAll = heap() - heapBeforeIndex;

  // Per-method build time and heap on the shared corpus.
  const perMethod: Record<string, { buildMs: number; heapBytes: number; structuralBytes: number }> = {};
  const keepAlive: Retriever[] = []; // so an earlier retriever is not collected during a later measurement
  for (const method of RETRIEVAL_METHODS) {
    const before = heap();
    const retriever: Retriever =
      method === 'exact' ? new ExactTokenRetriever(index.corpus)
      : method === 'bm25' ? new Bm25Retriever(index.corpus)
      : method === 'cosine' ? new CosineRetriever(index.corpus)
      : new FlyHashRetriever(index.corpus, index.cosine);
    const start = now();
    retriever.build();
    const buildMs = now() - start;
    perMethod[method] = { buildMs: round(buildMs), heapBytes: heap() - before, structuralBytes: retriever.memoryEstimate() };
    keepAlive.push(retriever);
  }

  // Queries from unique titles: exact title, title + a column, one-character typo.
  const random = mulberry32(SEED);
  const titleCount = new Map<string, number>();
  for (const region of truth) titleCount.set(region.title, (titleCount.get(region.title) ?? 0) + 1);
  const unique = truth.filter((region) => titleCount.get(region.title) === 1);
  const idOf = (region: RegionRecordLike): string => `${path.basename(region.bookPath)}#${region.sheet}#${region.title ?? ''}`;
  const queries = Array.from({ length: Math.min(queryCount, unique.length) }, (_, i) => {
    const region = unique[Math.floor(random() * unique.length)];
    const kind = i % 10 < 4 ? 'exact' : i % 10 < 7 ? 'column' : 'typo';
    let text = `${region.title}を見せて`;
    if (kind === 'column') text = `${region.title}の${region.headers[1]}`;
    if (kind === 'typo') {
      const chars = [...region.title];
      chars[Math.floor(random() * chars.length)] = KANJI[Math.floor(random() * KANJI.length)];
      text = `${chars.join('')}を表示`;
    }
    return { text, kind, want: `${region.file}#${region.sheet}#${region.title}` };
  });

  const cache = new WorkbookCache<WorkbookData>();
  for (const file of files) cache.set(file, readSnapshot(file), workbooks.get(file)!);
  const relativePath = (bookPath: string): string => `./${path.basename(bookPath)}`;
  const results: Record<string, unknown> = {};
  for (const method of RETRIEVAL_METHODS) {
    const retrieval: number[] = [];
    const compile: number[] = [];
    const verified: number[] = [];
    let recall = 0;
    let top1 = 0;
    for (const query of queries) compileQuery(query.text, { index, method, relativePath }); // warm-up
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const query of queries) {
        let start = now();
        const result = compileQuery(query.text, { index, method, relativePath });
        compile.push(now() - start);
        if (iteration === 0) {
          const ids = result.candidates.map((candidate) => idOf(candidate.region));
          if (ids.includes(query.want)) recall += 1;
          if (ids[0] === query.want) top1 += 1;
        }
        start = now();
        const again = compileQuery(query.text, { index, method, relativePath });
        for (const candidate of again.candidates) {
          const workbook = cache.get(candidate.region.bookPath, readSnapshot(candidate.region.bookPath))!;
          verifyRegion(candidate.region, workbook.sheets[candidate.region.sheet]);
        }
        verified.push(now() - start);
        const bag = requestFeatureBag(result.ir);
        start = now();
        index.search(method, bag, 30);
        retrieval.push(now() - start);
      }
    }
    results[method] = {
      recallAt5: round(recall / queries.length),
      top1: round(top1 / queries.length),
      retrievalMs: stats(retrieval),
      compileMs: stats(compile),
      withVerificationMs: stats(verified),
    };
  }

  // Diff update: one book's mtime changes; only it is re-read.
  const changed = files[0];
  const bump = new Date(Date.now() + 5000);
  fs.utimesSync(changed, bump, bump);
  t = now();
  let reloaded = 0;
  for (const file of files) {
    const stat = statOf(file);
    if (catalog.needsUpdate(file, stat)) {
      catalog.setBook(file, stat, loadWorkbook({ absolutePath: file }));
      reloaded += 1;
    }
  }
  const sync = index.sync();
  const diffMs = now() - t;

  return {
    books: files.length,
    regions: catalog.regionCount,
    cells: truth.length * 21,
    totalBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
    vocabulary: index.corpus.vocabularySize,
    queries: queries.length,
    timingsMs: {
      coldLoadPerBook: stats(loadMs),
      coldLoadTotal: round(loadMs.reduce((a, b) => a + b, 0)),
      detectPerBook: stats(detectMs),
      detectTotal: round(detectMs.reduce((a, b) => a + b, 0)),
      catalog: round(catalogMs),
      fullIndexSync: round(fullSyncMs),
      diffUpdate: { ms: round(diffMs), reloadedBooks: reloaded, docsRemoved: sync.removed, docsAdded: sync.added },
    },
    memory: {
      workbooksHeapBytes: heapWorkbooks,
      indexAllMethodsHeapBytes: heapIndexAll,
      perMethod,
      structural: index.memoryEstimate(),
      peakRssKiB: process.resourceUsage().maxRSS,
    },
    methods: results,
  };
}

interface RegionRecordLike {
  bookPath: string;
  sheet: string;
  title?: string;
}

function parseList(value: string | undefined, fallback: number[]): number[] {
  return value ? value.split(',').map(Number) : fallback;
}

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  if (arg('--worker')) {
    const [books, regions, queries, iterations] = arg('--worker')!.split(',').map(Number);
    process.stdout.write(JSON.stringify(worker(books, regions, queries, iterations)));
    return;
  }
  const books = parseList(arg('--books'), [10, 100, 1000]);
  const regions = parseList(arg('--regions'), [1000, 10000, 100000]);
  const queries = Number(arg('--queries') ?? 200);
  const iterations = Number(arg('--iterations') ?? 3);
  const runs: unknown[] = [];
  for (const b of books) {
    for (const r of regions) {
      if (r < b) continue;
      process.stderr.write(`books=${b} regions=${r} ...\n`);
      const child = spawnSync(
        process.execPath,
        ['--expose-gc', '--max-old-space-size=6144', '--import', 'tsx', fileURLToPath(import.meta.url), '--worker', `${b},${r},${queries},${iterations}`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
      if (child.status !== 0) {
        runs.push({ books: b, regions: r, error: child.stderr.slice(-2000) });
        continue;
      }
      runs.push(JSON.parse(child.stdout));
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    kind: 'synthetic scale data (not the fictional business corpus)',
    environment: environment({ seed: SEED, iterations, queriesPerRun: queries, pageCache: 'warm (files just written)' }),
    runs,
  };
  const out = arg('--out');
  if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
