/**
 * Quality + latency evaluation on the fictional business corpus
 * (input-assistance-cpu-search.md §5). CPU only, no network.
 *
 *   node --import tsx scripts/cpu-search-eval/evaluate.ts [--queries dev|test|all]
 *        [--iterations 30] [--corpus <dir>] [--out <report.json>] [--no-dictionary]
 *
 * Every method gets the same corpus, features, candidate pool (30) and
 * candidate count (5). Region queries report Recall@5 / top-1 / column+grep
 * correctness; reject queries report rejection accuracy. Timings are split
 * into cold load, region detection, index build, diff update, warm compile
 * and compile + exact re-verification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorkbookCache } from '../../src/cache/workbookCache.js';
import { loadWorkbook, readSnapshot, type WorkbookData } from '../../src/core/workbookLoader.js';
import { compileQuery, requestFeatureBag, type CompileResult } from '../../src/search/nlQuery/compiler.js';
import { RegionCatalog } from '../../src/search/regionCatalog.js';
import { detectRegions } from '../../src/search/regionDetector.js';
import { Bm25Retriever, CosineRetriever, ExactTokenRetriever, FlyHashRetriever } from '../../src/search/retrievers.js';
import { RegionSearchIndex, RETRIEVAL_METHODS, type RetrievalMethod } from '../../src/search/searchIndex.js';
import { verifyRegion } from '../../src/search/verify.js';
import { IT_ACRONYM_GROUPS } from '../../src/search/lexicon/itAcronyms.js';
import { DEFAULT_CORPUS_DIR, writeCorpus, type ManifestRegion } from './corpus.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface EvalQuery {
  id: string;
  text: string;
  category: string;
  expect: { regions?: string[]; columns?: string[]; grep?: string; allOf?: boolean; reject?: 'unsupported' | 'no-match' };
}

interface Args {
  queries: string;
  iterations: number;
  corpus: string;
  out?: string;
  dictionary: boolean;
  /** `--no-paraphrase`: ablation of the paraphrase lane. */
  paraphrase: boolean;
  /** `--no-lexicon`: ablation of the built-in abbreviation lexicon (ADR-0023). */
  lexicon: boolean;
  methods: RetrievalMethod[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { queries: 'dev', iterations: 30, corpus: DEFAULT_CORPUS_DIR, dictionary: true, paraphrase: true, lexicon: true, methods: [...RETRIEVAL_METHODS] };
  for (let i = 0; i < argv.length; i += 1) {
    const next = (): string => argv[++i];
    switch (argv[i]) {
      case '--queries': args.queries = next(); break;
      case '--iterations': args.iterations = Number(next()); break;
      case '--corpus': args.corpus = next(); break;
      case '--out': args.out = next(); break;
      case '--no-dictionary': args.dictionary = false; break;
      case '--no-paraphrase': args.paraphrase = false; break;
      case '--no-lexicon': args.lexicon = false; break;
      case '--methods': args.methods = next().split(',') as RetrievalMethod[]; break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));
const now = (): number => performance.now();

export function environment(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const cpus = os.cpus();
  return {
    cpuModel: cpus[0]?.model,
    logicalCores: cpus.length,
    totalMemGiB: round(os.totalmem() / 2 ** 30, 1),
    os: `${os.type()} ${os.release()}`,
    wsl: /microsoft/iu.test(os.release()),
    node: process.version,
    gpuUsed: false,
    network: 'none (no external calls in this harness)',
    ...extra,
  };
}

function loadQueries(which: string): EvalQuery[] {
  const read = (name: string): EvalQuery[] => JSON.parse(fs.readFileSync(path.join(here, `queries.${name}.json`), 'utf8'));
  if (which === 'all') return [...read('dev'), ...read('test')];
  if (/^[a-z0-9]+$/u.test(which)) return read(which);
  return JSON.parse(fs.readFileSync(which, 'utf8'));
}

interface Judged {
  id: string;
  category: string;
  kind: 'region' | 'reject';
  recall5: boolean;
  top1: boolean;
  allOffered: boolean;
  exactNotation: boolean;
  rejected: boolean;
  status: string;
  top?: string;
}

function judge(query: EvalQuery, result: CompileResult): Judged {
  const ids = result.candidates.map((candidate) => regionKey(candidate.region.bookPath, candidate.region.sheet, candidate.region.a1));
  const rejected = result.candidates.length === 0;
  const base = { id: query.id, category: query.category, status: result.status, top: result.candidates[0]?.markdown, rejected };
  if (query.expect.reject) {
    return { ...base, kind: 'reject', recall5: false, top1: false, allOffered: false, exactNotation: false };
  }
  const allowed = new Set(query.expect.regions ?? []);
  const recall5 = ids.some((id) => allowed.has(id));
  const top1 = ids.length > 0 && allowed.has(ids[0]);
  const allOffered = query.expect.allOf ? [...allowed].every((id) => ids.includes(id)) : recall5;
  const hit = result.candidates.find((candidate) => allowed.has(regionKey(candidate.region.bookPath, candidate.region.sheet, candidate.region.a1)));
  const expectColumns = query.expect.columns ?? [];
  const exactNotation =
    hit !== undefined &&
    hit.columns.map((column) => column.header).join('\u0000') === expectColumns.join('\u0000') &&
    (hit.markdown.includes('grep=') ? query.expect.grep !== undefined : query.expect.grep === undefined) &&
    (query.expect.grep === undefined || result.ir.contains[0]?.term.raw === query.expect.grep);
  return { ...base, kind: 'region', recall5, top1, allOffered, exactNotation };
}

function regionKey(bookPath: string, sheet: string, a1: string): string {
  return `${path.basename(bookPath)}#${sheet}!${a1}`;
}

function summarize(judged: Judged[]): Record<string, unknown> {
  const region = judged.filter((j) => j.kind === 'region');
  const reject = judged.filter((j) => j.kind === 'reject');
  const rate = (list: Judged[], pick: (j: Judged) => boolean): number => (list.length === 0 ? Number.NaN : round(list.filter(pick).length / list.length));
  const byCategory: Record<string, { n: number; recall5?: number; top1?: number; rejection?: number }> = {};
  for (const category of [...new Set(judged.map((j) => j.category))]) {
    const items = judged.filter((j) => j.category === category);
    byCategory[category] = items[0].kind === 'region'
      ? { n: items.length, recall5: rate(items, (j) => j.recall5), top1: rate(items, (j) => j.top1) }
      : { n: items.length, rejection: rate(items, (j) => j.rejected) };
  }
  return {
    regionQueries: region.length,
    rejectQueries: reject.length,
    recallAt5: rate(region, (j) => j.recall5),
    top1: rate(region, (j) => j.top1),
    duplicatesAllOffered: rate(region.filter((j) => j.category === 'duplicate'), (j) => j.allOffered),
    exactNotation: rate(region, (j) => j.exactNotation),
    falseRejections: region.filter((j) => j.rejected).length,
    rejectionAccuracy: rate(reject, (j) => j.rejected),
    automaticConfirmations: 0,
    byCategory,
    failures: judged
      .filter((j) => (j.kind === 'region' ? !j.recall5 : !j.rejected))
      .map((j) => ({ id: j.id, category: j.category, status: j.status, top: j.top })),
  };
}

export function main(argv = process.argv.slice(2)): Record<string, unknown> {
  const args = parseArgs(argv);
  if (!fs.existsSync(path.join(args.corpus, 'manifest.json'))) {
    const manifest = writeCorpus(args.corpus);
    fs.writeFileSync(path.join(args.corpus, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const manifest: ManifestRegion[] = JSON.parse(fs.readFileSync(path.join(args.corpus, 'manifest.json'), 'utf8'));
  const queries = loadQueries(args.queries);
  const known = new Set(manifest.map((region) => region.id));
  const badIds = queries.flatMap((q) => (q.expect.regions ?? []).filter((id) => !known.has(id)).map((id) => `${q.id}: ${id}`));
  if (badIds.length > 0) throw new Error(`Queries reference unknown regions:\n${badIds.join('\n')}`);
  const dictionary = JSON.parse(fs.readFileSync(path.join(here, 'dictionary.json'), 'utf8'));
  const synonyms: string[][] = [...(args.dictionary ? dictionary.groups : []), ...(args.lexicon ? IT_ACRONYM_GROUPS.map((group) => [...group]) : [])];
  const queryAliases = args.dictionary ? (dictionary.queryAliases ?? []) : [];

  const files = [...new Set(manifest.map((region) => region.file))].map((file) => path.resolve(args.corpus, file));

  // --- cold load and detection, measured separately ----------------------
  const loadMs: number[] = [];
  const detectMs: number[] = [];
  const workbooks = new Map<string, WorkbookData>();
  for (const file of files) {
    let start = now();
    const workbook = loadWorkbook({ absolutePath: file });
    loadMs.push(now() - start);
    workbooks.set(file, workbook);
    start = now();
    for (const [name, sheet] of Object.entries(workbook.sheets)) detectRegions(name, sheet);
    detectMs.push(now() - start);
  }
  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);

  // --- catalog + index -----------------------------------------------------
  const cache = new WorkbookCache<WorkbookData>();
  const catalog = new RegionCatalog();
  const statFile = (file: string) => {
    const stat = fs.statSync(file);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  };
  const load = (file: string) => loadWorkbook({ absolutePath: file, cache });
  for (const file of files) catalog.setBook(file, statFile(file), load(file));

  const detection = { manifest: manifest.length, detected: catalog.regionCount, exact: 0, headerLikely: 0 };
  const detectedIds = new Map(catalog.regions().map((region) => [regionKey(region.bookPath, region.sheet, region.a1), region]));
  for (const region of manifest) {
    const found = detectedIds.get(region.id);
    if (found && (found.title ?? '') === (region.title ?? '')) detection.exact += 1;
    if (found?.headerConfidence === 'likely') detection.headerLikely += 1;
  }

  const index = new RegionSearchIndex(catalog, { methods: args.methods });
  let start = now();
  index.sync();
  const fullSyncMs = now() - start;
  const buildMs: Record<string, number> = {};
  for (const method of args.methods) {
    const retriever =
      method === 'exact' ? new ExactTokenRetriever(index.corpus)
      : method === 'bm25' ? new Bm25Retriever(index.corpus)
      : method === 'cosine' ? new CosineRetriever(index.corpus)
      : new FlyHashRetriever(index.corpus, index.cosine);
    start = now();
    retriever.build();
    buildMs[method] = round(now() - start);
  }

  // --- quality ---------------------------------------------------------------
  const relativePath = (bookPath: string): string => `./${path.basename(bookPath)}`;
  const quality: Record<string, unknown> = {};
  const judgedByMethod: Record<string, Judged[]> = {};
  for (const method of args.methods) {
    const judged = queries.map((query) => judge(query, compileQuery(query.text, { index, method, relativePath, synonyms, queryAliases, paraphrase: args.paraphrase })));
    judgedByMethod[method] = judged;
    quality[method] = summarize(judged);
  }

  // --- warm latency: retrieval only, compile, compile + exact verification ---
  const latency: Record<string, unknown> = {};
  for (const method of args.methods) {
    const retrieval: number[] = [];
    const compile: number[] = [];
    const verified: number[] = [];
    let staleCandidates = 0;
    for (let iteration = 0; iteration < args.iterations; iteration += 1) {
      for (const query of queries) {
        let t = now();
        const result = compileQuery(query.text, { index, method, relativePath, synonyms, queryAliases, paraphrase: args.paraphrase });
        compile.push(now() - t);

        t = now();
        const again = compileQuery(query.text, { index, method, relativePath, synonyms, queryAliases, paraphrase: args.paraphrase });
        for (const candidate of again.candidates) {
          const snapshot = readSnapshot(candidate.region.bookPath);
          const workbook = cache.get(candidate.region.bookPath, snapshot) ?? load(candidate.region.bookPath);
          if (!verifyRegion(candidate.region, workbook.sheets[candidate.region.sheet]).ok) staleCandidates += 1;
        }
        verified.push(now() - t);

        if (result.ir.unsupported.length === 0) {
          const bag = requestFeatureBag(result.ir, synonyms, queryAliases);
          t = now();
          index.search(method, bag, 30);
          retrieval.push(now() - t);
        }
      }
    }
    latency[method] = {
      samples: compile.length,
      retrievalP50: round(percentile(retrieval, 50)),
      retrievalP95: round(percentile(retrieval, 95)),
      compileP50: round(percentile(compile, 50)),
      compileP95: round(percentile(compile, 95)),
      withVerificationP50: round(percentile(verified, 50)),
      withVerificationP95: round(percentile(verified, 95)),
      staleCandidates,
    };
  }

  // --- diff update: one book changes -----------------------------------------
  const changed = files[0];
  const bump = new Date(Date.now() + 1000);
  fs.utimesSync(changed, bump, bump);
  start = now();
  let reloaded = 0;
  for (const file of files) {
    const stat = statFile(file);
    if (catalog.needsUpdate(file, stat)) {
      catalog.setBook(file, stat, load(file));
      reloaded += 1;
    }
  }
  const sync = index.sync();
  const diffUpdateMs = now() - start;

  const report = {
    generatedAt: new Date().toISOString(),
    environment: environment({ iterations: args.iterations, flyhashSeed: 20260924, corpusSeed: 20260924 }),
    corpus: {
      kind: 'fictional business data (not synthetic scale data)',
      books: files.length,
      totalBytes,
      regions: catalog.regionCount,
      vocabulary: index.corpus.vocabularySize,
    },
    queries: { set: args.queries, count: queries.length, dictionary: args.dictionary ? dictionary.version : 'disabled' },
    detection,
    timingsMs: {
      coldLoadPerBookP50: round(percentile(loadMs, 50)),
      coldLoadPerBookP95: round(percentile(loadMs, 95)),
      coldLoadTotal: round(loadMs.reduce((a, b) => a + b, 0)),
      detectPerBookP50: round(percentile(detectMs, 50)),
      detectPerBookP95: round(percentile(detectMs, 95)),
      fullIndexSync: round(fullSyncMs),
      retrieverBuild: buildMs,
      diffUpdate: { ms: round(diffUpdateMs), reloadedBooks: reloaded, docsRemoved: sync.removed, docsAdded: sync.added },
    },
    memoryBytes: index.memoryEstimate(),
    quality,
    latency,
    perQuery: judgedByMethod,
  };
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = main() as { quality: Record<string, Record<string, unknown>>; latency: Record<string, Record<string, unknown>> } & Record<string, unknown>;
  const { perQuery: _omit, ...rest } = report as Record<string, unknown>;
  console.log(JSON.stringify(rest, null, 2));
}
