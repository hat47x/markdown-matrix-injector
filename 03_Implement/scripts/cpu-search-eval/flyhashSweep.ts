/**
 * FlyHash parameter sweep (input-assistance-cpu-search.md §4.2: m, s, k are
 * chosen by measurement, not taken from the paper or from biology).
 *
 *   node --expose-gc --import tsx scripts/cpu-search-eval/flyhashSweep.ts
 *        [--books 100] [--regions 10000] [--queries 300] [--out report.json]
 *
 * Isolates the hash's own job on the synthetic corpus written by scale.ts:
 * for each query, does FlyHash's result contain what exhaustive exact cosine
 * returns (agreement@5 with cosine top-5), how fast, how much memory -- with
 * and without the exact rerank. Cosine is the reference because FlyHash here
 * approximates cosine; the end-to-end quality comparison is in evaluate.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadWorkbook } from '../../src/core/workbookLoader.js';
import { requestFeatureBag } from '../../src/search/nlQuery/compiler.js';
import { parseQuery } from '../../src/search/nlQuery/parser.js';
import { RegionCatalog } from '../../src/search/regionCatalog.js';
import { FlyHashRetriever } from '../../src/search/retrievers.js';
import { RegionSearchIndex } from '../../src/search/searchIndex.js';
import { environment, percentile } from './evaluate.js';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const books = Number(arg('--books', '100'));
const regions = Number(arg('--regions', '10000'));
const queryCount = Number(arg('--queries', '300'));
const dir = path.join(os.tmpdir(), 'mmi-cpu-search-eval', 'scale', `b${books}-r${regions}`);
if (!fs.existsSync(path.join(dir, 'truth.json'))) {
  throw new Error(`Run scale.ts --books ${books} --regions ${regions} first (it writes ${dir}).`);
}
const truth: { file: string; title: string; headers: string[] }[] = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));

const catalog = new RegionCatalog();
for (const file of new Set(truth.map((region) => region.file))) {
  const full = path.join(dir, file);
  const stat = fs.statSync(full);
  catalog.setBook(full, { mtimeMs: stat.mtimeMs, size: stat.size }, loadWorkbook({ absolutePath: full }));
}
const index = new RegionSearchIndex(catalog, { methods: ['cosine'] });
index.sync();

let seed = 7;
const random = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const queries = Array.from({ length: queryCount }, (_, i) => {
  const region = truth[Math.floor(random() * truth.length)];
  const text = i % 2 === 0 ? `${region.title}を見せて` : `${region.title}の${region.headers[1]}`;
  return index.corpus.encodeQuery(requestFeatureBag(parseQuery(text)));
});
const reference = queries.map((query) => index.cosine.search(query, 5).map((hit) => hit.doc));

const heap = (): number => {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().heapUsed;
};
const round = (value: number, digits = 3): number => Number(value.toFixed(digits));

const rows: Record<string, unknown>[] = [];
const cosineTimes = queries.map((query) => {
  const start = performance.now();
  index.cosine.search(query, 5);
  return performance.now() - start;
});
rows.push({ method: 'cosine (exhaustive over postings)', agreementAt5: 1, p50: round(percentile(cosineTimes, 50)), p95: round(percentile(cosineTimes, 95)) });

for (const outputs of [1024, 4096, 16384]) {
  for (const connections of [4, 8, 16]) {
    for (const winners of [16, 32, 64]) {
      for (const rerank of [true, false]) {
        const before = heap();
        const fly = new FlyHashRetriever(index.corpus, index.cosine, { outputs, connections, winners, rerank, candidatePool: 100 });
        const buildStart = performance.now();
        fly.build();
        const buildMs = performance.now() - buildStart;
        const heapBytes = heap() - before;
        const times: number[] = [];
        let agree = 0;
        queries.forEach((query, i) => {
          const start = performance.now();
          const hits = fly.search(query, 5).map((hit) => hit.doc);
          times.push(performance.now() - start);
          agree += hits.filter((doc) => reference[i].includes(doc)).length / Math.max(1, reference[i].length);
        });
        rows.push({
          method: fly.name,
          agreementAt5: round(agree / queries.length),
          p50: round(percentile(times, 50)),
          p95: round(percentile(times, 95)),
          buildMs: round(buildMs),
          heapBytes,
        });
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  kind: 'synthetic scale data; FlyHash vs exhaustive cosine on identical features',
  environment: environment({ books, regions: index.size, queries: queryCount }),
  rows,
};
const out = arg('--out', '');
if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
