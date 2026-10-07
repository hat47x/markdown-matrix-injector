/**
 * One-shot evidence runner for the frozen held-out v6 set and the experimental
 * local-embedding lane (issue-0115).
 *
 * Pre-registered before any v6 scoring: model `qwen3-embedding:0.6b` through
 * Ollama, no query prefix, headline threshold 0.6 (chosen on the consumed v4/v5
 * sweeps). The full threshold sweep is reported too, but the headline is the
 * pre-registered one. It refuses to run when the query blob changed, the Git
 * worktree is dirty, or the evidence file exists: the point is the first look.
 * Requires a running local Ollama with the model installed (nothing is pulled).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main as evaluate } from './evaluate.js';
import { main as semanticEval } from './semantic-eval.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

export const TEST6_QUERY_BLOB_SHA = '7ef9e68f9286d824cb6c467e02f3a00a4de17a9c';
export const TEST6_QUERY_COUNT = 60;
export const TEST6_CATEGORY_COUNTS: Readonly<Record<string, number>> = {
  exact: 6,
  abbreviation: 4,
  paraphrase: 30,
  typo: 2,
  duplicate: 4,
  unsupported: 7,
  none: 7,
};
export const TEST6_PREREGISTERED = { model: 'qwen3-embedding:0.6b', api: 'ollama', endpoint: 'http://127.0.0.1:11434', queryPrefix: '', minScore: 0.6 } as const;

const queryPath = path.join(here, 'queries.test6.json');
const defaultOutput = path.resolve(here, '../../artifacts/cpu-search-test6-first-run.json');

export function gitBlobSha(bytes: Uint8Array): string {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8')).update(bytes).digest('hex');
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

async function modelDigest(): Promise<string | undefined> {
  try {
    const response = await fetch(`${TEST6_PREREGISTERED.endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const body = (await response.json()) as { models?: Array<{ name: string; digest: string }> };
    return body.models?.find((model) => model.name === TEST6_PREREGISTERED.model)?.digest;
  } catch {
    return undefined;
  }
}

export async function runFirstTest6(output = defaultOutput): Promise<Record<string, unknown>> {
  if (fs.existsSync(output)) throw new Error(`First-run evidence already exists: ${output}. Refusing to overwrite it.`);
  const bytes = fs.readFileSync(queryPath);
  const actual = gitBlobSha(bytes);
  if (actual !== TEST6_QUERY_BLOB_SHA) throw new Error(`queries.test6.json is not the frozen blob: expected ${TEST6_QUERY_BLOB_SHA}, got ${actual}.`);
  const queries = JSON.parse(bytes.toString('utf8')) as Array<{ category: string }>;
  if (queries.length !== TEST6_QUERY_COUNT) throw new Error(`Frozen v6 query count changed: ${queries.length}.`);
  const counts: Record<string, number> = {};
  for (const query of queries) counts[query.category] = (counts[query.category] ?? 0) + 1;
  if (JSON.stringify(Object.entries(counts).sort()) !== JSON.stringify(Object.entries(TEST6_CATEGORY_COUNTS).sort())) {
    throw new Error(`Frozen v6 category counts changed: ${JSON.stringify(counts)}.`);
  }
  if (git('status', '--porcelain', '--untracked-files=all') !== '') throw new Error('Git worktree is not clean.');
  const digest = await modelDigest();
  if (!digest) throw new Error(`Ollama is not reachable, or ${TEST6_PREREGISTERED.model} is not installed (nothing is pulled).`);

  // One look: the product without the model (name + structural lanes), then the model lane.
  const withoutModel = evaluate(['--queries', 'test6', '--iterations', '1', '--methods', 'bm25']);
  const withModel = await semanticEval(['--queries', 'test6', '--model', TEST6_PREREGISTERED.model]);
  const evidence = {
    evidence: {
      kind: 'cpu-search-test6-first-run',
      gitCommit: git('rev-parse', 'HEAD'),
      cleanWorktree: true,
      queryBlobSha: TEST6_QUERY_BLOB_SHA,
      queryCount: TEST6_QUERY_COUNT,
      categoryCounts: TEST6_CATEGORY_COUNTS,
      preregistered: TEST6_PREREGISTERED,
      modelDigest: digest,
      headlineThreshold: TEST6_PREREGISTERED.minScore,
      command: 'npm run eval:cpu-search:test6:first',
    },
    withoutModel,
    withModel,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFirstTest6().then((evidence) => process.stdout.write(`${JSON.stringify(evidence.evidence, null, 2)}\n`), (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
