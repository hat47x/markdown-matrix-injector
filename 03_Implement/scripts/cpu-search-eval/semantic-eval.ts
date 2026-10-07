/**
 * Measures the experimental semantic lane with a local embedding runtime that
 * is already running (nothing is downloaded or installed here).
 *
 *   node --import tsx scripts/cpu-search-eval/semantic-eval.ts --queries test5 \
 *        --api ollama --endpoint http://127.0.0.1:11434 --model <name> \
 *        [--query-prefix "query: "] [--document-prefix "passage: "] [--out report.json]
 *
 * Every request first goes through the name lane and the structural paraphrase
 * lane (as the product does). Only requests that found nothing reach the
 * model; their scores are computed once and swept over thresholds, so a person
 * can pick `search.semantic.minScore` from measured recall AND false
 * acceptance. The headline numbers are for the reported threshold list, never
 * for one tuned on the very set being reported: use a set that was not used to
 * choose the threshold (a fresh held-out set), and record the model/runtime.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseCognitiveArtifactManifest,
  resolveCognitiveArtifact,
  type CognitiveArtifactManifestV0,
  type CognitiveArtifactProvider,
} from '../../src/core/cognitiveArtifact.js';
import { loadWorkbook } from '../../src/core/workbookLoader.js';
import {
  cognitiveArtifactEvaluationObservation,
  cognitiveArtifactNotMeasured,
  type CognitiveArtifactEvaluationObservation,
} from '../../src/evaluation/cognitiveArtifactEvaluation.js';
import { createEmbeddingProvider, type EmbeddingApi } from '../../src/search/semantic/embeddingProvider.js';
import {
  discoverLocalEmbeddingModels,
  runtimeManagedArtifactFromEmbeddingModel,
  type DiscoveredEmbeddingModel,
} from '../../src/search/semantic/runtimeDiscovery.js';
import { SemanticRegionRanker } from '../../src/search/semantic/semanticLane.js';
import { describableRequest, SOFT_UNSUPPORTED_CONSTRUCTS } from '../../src/search/nlQuery/compiler.js';
import { WorkspaceRegionIndex } from '../../src/search/workspaceRegionIndex.js';
import { DEFAULT_CORPUS_DIR, writeCorpus, type ManifestRegion } from './corpus.js';
import type { EvalQuery } from './evaluate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const THRESHOLDS = [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];

interface Args {
  queries: string;
  api: EmbeddingApi;
  endpoint: string;
  model: string;
  queryPrefix: string;
  documentPrefix: string;
  window: number;
  artifactManifest?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { queries: 'test5', api: 'ollama', endpoint: 'http://127.0.0.1:11434', model: '', queryPrefix: '', documentPrefix: '', window: 0.08 };
  for (let i = 0; i < argv.length; i += 1) {
    const next = (): string => argv[++i];
    switch (argv[i]) {
      case '--queries': args.queries = next(); break;
      case '--api': args.api = next() as EmbeddingApi; break;
      case '--endpoint': args.endpoint = next(); break;
      case '--model': args.model = next(); break;
      case '--query-prefix': args.queryPrefix = next(); break;
      case '--document-prefix': args.documentPrefix = next(); break;
      case '--window': args.window = Number(next()); break;
      case '--artifact-manifest': args.artifactManifest = next(); break;
      case '--out': args.out = next(); break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (args.model === '') throw new Error('--model is required (a model already available in your local runtime).');
  return args;
}


function normalizedEndpoint(value: string): string {
  return value.replace(/\/+$/u, '');
}

export async function resolveSemanticEvaluationArtifact(
  manifest: CognitiveArtifactManifestV0,
  provider: CognitiveArtifactProvider,
  selection: {
    api: EmbeddingApi;
    endpoint: string;
    model: string;
  },
  discoveredModels: readonly DiscoveredEmbeddingModel[],
): Promise<CognitiveArtifactEvaluationObservation> {
  const selected = discoveredModels.filter(
    (model) =>
      model.api === selection.api
      && normalizedEndpoint(model.endpoint)
        === normalizedEndpoint(selection.endpoint)
      && model.model === selection.model,
  );
  if (selected.length === 0) {
    throw new Error(
      'artifact manifest was supplied, but the selected runtime model could not be rediscovered with a verifiable runtime identity',
    );
  }

  const cacheRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-semantic-eval-artifact-'),
  );
  try {
    const resolution = await resolveCognitiveArtifact(manifest, {
      provider,
      cacheRoot,
      offline: true,
      runtimeArtifacts: selected.map(
        runtimeManagedArtifactFromEmbeddingModel,
      ),
    });
    const observed = cognitiveArtifactEvaluationObservation(
      manifest,
      provider,
      resolution,
    );
    if (
      resolution.status !== 'available'
      || resolution.location.kind !== 'runtime-managed'
    ) {
      const detail = resolution.status === 'unavailable'
        ? resolution.reason
        : resolution.status;
      throw new Error(
        `selected semantic runtime is not cryptographically bound to the supplied artifact manifest (${detail})`,
      );
    }
    return observed;
  } finally {
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  }
}

async function discoverSelectedRuntimeModels(
  args: Pick<Args, 'api' | 'endpoint'>,
): Promise<DiscoveredEmbeddingModel[]> {
  const unreachable = 'http://127.0.0.1:9';
  return discoverLocalEmbeddingModels(undefined, {
    timeoutMs: 1_500,
    ollamaEndpoint: args.api === 'ollama'
      ? args.endpoint
      : unreachable,
    lmStudioEndpoint: args.api === 'openai-compatible'
      ? args.endpoint
      : unreachable,
  });
}

const keyOf = (bookPath: string, sheet: string, a1: string): string => `${path.basename(bookPath)}#${sheet}!${a1}`;

export async function main(argv = process.argv.slice(2)): Promise<Record<string, unknown>> {
  const args = parseArgs(argv);
  const corpusDir = DEFAULT_CORPUS_DIR;
  if (!fs.existsSync(path.join(corpusDir, 'manifest.json'))) {
    const manifest = writeCorpus(corpusDir);
    fs.writeFileSync(path.join(corpusDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const manifest: ManifestRegion[] = JSON.parse(fs.readFileSync(path.join(corpusDir, 'manifest.json'), 'utf8'));
  const queries: EvalQuery[] = JSON.parse(fs.readFileSync(path.join(here, `queries.${args.queries}.json`), 'utf8'));
  const files = [...new Set(manifest.map((region) => path.resolve(corpusDir, region.file)))];

  const index = new WorkspaceRegionIndex({
    statFile: (file) => ({ mtimeMs: fs.statSync(file).mtimeMs, size: fs.statSync(file).size }),
    loadWorkbook: (file) => loadWorkbook({ absolutePath: file }),
  });
  await index.refresh(files);

  const provider = createEmbeddingProvider({ api: args.api, endpoint: args.endpoint, model: args.model, queryPrefix: args.queryPrefix, documentPrefix: args.documentPrefix });
  const artifactEvaluation = args.artifactManifest
    ? await resolveSemanticEvaluationArtifact(
        parseCognitiveArtifactManifest(
          fs.readFileSync(path.resolve(args.artifactManifest), 'utf8'),
        ),
        {
          id: provider.descriptor.id,
          version: provider.descriptor.version,
        },
        {
          api: args.api,
          endpoint: args.endpoint,
          model: args.model,
        },
        await discoverSelectedRuntimeModels(args),
      )
    : cognitiveArtifactNotMeasured(
        'no --artifact-manifest was supplied',
      );
  const ranker = new SemanticRegionRanker(provider);
  const regions = index.allRegionsForEvaluation();
  const relativePath = (file: string): string => `./${path.basename(file)}`;

  const started = Date.now();
  const rows = [] as Array<{ id: string; category: string; reject: boolean; allowed: Set<string>; nameLane: 'candidates' | 'other'; nameHit: boolean; ranked?: Array<{ key: string; score: number }>; eligible: boolean }>;
  for (const query of queries) {
    const result = index.query(query.text, relativePath);
    const allowed = new Set(query.expect.regions ?? []);
    const nameLane = result.status === 'candidates' ? 'candidates' : 'other';
    const nameHit = result.candidates.some((candidate) => allowed.has(keyOf(candidate.region.bookPath, candidate.region.sheet, candidate.region.a1)));
    let ranked: Array<{ key: string; score: number }> | undefined;
    const eligible = nameLane === 'other' && describableRequest(result.ir, SOFT_UNSUPPORTED_CONSTRUCTS);
    if (eligible) {
      const scored = await ranker.rank(result.ir.input, regions);
      if (!scored) throw new Error('The embedding runtime is unavailable (is it running, and is the model installed?).');
      ranked = scored.map((item) => ({ key: keyOf(item.region.bookPath, item.region.sheet, item.region.a1), score: item.score }));
    }
    rows.push({ id: query.id, category: query.category, reject: Boolean(query.expect.reject), allowed, nameLane, nameHit, ranked, eligible });
  }

  const sweep = THRESHOLDS.map((threshold) => {
    const outcome = rows.map((row) => {
      const offered: string[] = [];
      if (row.nameLane === 'candidates') return { row, offered, viaName: true };
      if (row.ranked && row.ranked.length > 0 && row.ranked[0].score >= threshold) {
        const best = row.ranked[0].score;
        for (const item of row.ranked) {
          if (offered.length >= 3 || item.score < threshold || best - item.score > args.window) break;
          offered.push(item.key);
        }
      }
      return { row, offered, viaName: false };
    });
    const region = outcome.filter(({ row }) => !row.reject);
    const reject = outcome.filter(({ row }) => row.reject);
    const hit = (item: (typeof outcome)[number]): boolean => (item.viaName ? item.row.nameHit : item.offered.some((key) => item.row.allowed.has(key)));
    const byCategory: Record<string, string> = {};
    for (const category of [...new Set(rows.map((row) => row.category))]) {
      const items = outcome.filter(({ row }) => row.category === category);
      byCategory[category] = items[0].row.reject
        ? `${items.filter((item) => item.offered.length === 0 && !item.viaName).length}/${items.length} rejected`
        : `${items.filter(hit).length}/${items.length}`;
    }
    return {
      threshold,
      recallAt5: Number((region.filter(hit).length / region.length).toFixed(3)),
      rejectionAccuracy: Number((reject.filter((item) => item.offered.length === 0 && !item.viaName).length / Math.max(1, reject.length)).toFixed(3)),
      falseAcceptances: reject.filter((item) => item.offered.length > 0).map((item) => item.row.id),
      byCategory,
    };
  });

  const report = {
    kind: 'cpu-search-semantic-eval',
    generatedAt: new Date().toISOString(),
    provider: { ...provider.descriptor, model: args.model, api: args.api, endpointHost: new URL(args.endpoint).host },
    artifactEvaluation,
    queries: args.queries,
    window: args.window,
    regions: regions.length,
    requestsReachingModel: rows.filter((row) => row.eligible).length,
    elapsedMs: Date.now() - started,
    note: 'Choose the threshold on one set and report on another. Candidates are inferred and always need a person to choose.',
    sweep,
  };
  if (args.out) fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`), (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
