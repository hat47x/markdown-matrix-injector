/**
 * One-shot evidence runner for the frozen CPU-search held-out v5 set.
 *
 * This deliberately refuses to run when the frozen query/dictionary blobs no
 * longer match, the Git worktree is dirty, or the evidence file already
 * exists. The point is to preserve the *first* observation, not to provide a
 * convenient tuning loop.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main as evaluate } from './evaluate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

export const TEST5_QUERY_BLOB_SHA = '9383c1cc341e29456d94e0b7819295fa2b9ad7b8';
export const TEST5_DICTIONARY_BLOB_SHA = 'dc418c576d800dba64442a3acabdb26b8e80f34d';
export const TEST5_DICTIONARY_VERSION = 'dev-2';
export const TEST5_QUERY_COUNT = 60;

export const TEST5_CATEGORY_COUNTS: Readonly<Record<string, number>> = {
  exact: 8,
  abbreviation: 6,
  paraphrase: 22,
  typo: 4,
  duplicate: 6,
  unsupported: 7,
  none: 7,
};

const queryPath = path.join(here, 'queries.test5.json');
const dictionaryPath = path.join(here, 'dictionary.json');
const defaultOutput = path.resolve(here, '../../artifacts/cpu-search-test5-first-run.json');

export function gitBlobSha(bytes: Uint8Array): string {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function assertFrozenFile(file: string, expected: string, label: string): Buffer {
  const bytes = fs.readFileSync(file);
  const actual = gitBlobSha(bytes);
  if (actual !== expected) {
    throw new Error(`${label} is not the frozen blob: expected ${expected}, got ${actual}.`);
  }
  return bytes;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function parseOutput(argv: readonly string[]): string {
  let output = defaultOutput;
  let seenOut = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--out') throw new Error(`Unknown argument: ${argv[i]}`);
    if (seenOut) throw new Error('--out may be specified only once.');
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error('--out requires a file path.');
    output = value;
    seenOut = true;
    i += 1;
  }
  return path.resolve(output);
}

export function runFirstTest4(argv = process.argv.slice(2)): Record<string, unknown> {
  const output = parseOutput(argv);
  if (fs.existsSync(output)) {
    throw new Error(`First-run evidence already exists: ${output}. Refusing to overwrite it.`);
  }

  const queryBytes = assertFrozenFile(queryPath, TEST5_QUERY_BLOB_SHA, 'queries.test5.json');
  const dictionaryBytes = assertFrozenFile(dictionaryPath, TEST5_DICTIONARY_BLOB_SHA, 'dictionary.json');
  const queries = JSON.parse(queryBytes.toString('utf8')) as Array<{ category: string }>;
  const dictionary = JSON.parse(dictionaryBytes.toString('utf8')) as { version?: string };

  if (queries.length !== TEST5_QUERY_COUNT) {
    throw new Error(`Frozen test5 query count changed: expected ${TEST5_QUERY_COUNT}, got ${queries.length}.`);
  }
  const categoryCounts: Record<string, number> = {};
  for (const query of queries) categoryCounts[query.category] = (categoryCounts[query.category] ?? 0) + 1;
  const actualCategories = Object.keys(categoryCounts).sort();
  const expectedCategories = Object.keys(TEST5_CATEGORY_COUNTS).sort();
  const countsMatch =
    actualCategories.length === expectedCategories.length &&
    actualCategories.every(
      (category, i) =>
        category === expectedCategories[i] &&
        categoryCounts[category] === TEST5_CATEGORY_COUNTS[category],
    );
  if (!countsMatch) {
    throw new Error(`Frozen test5 category counts changed: ${JSON.stringify(categoryCounts)}.`);
  }
  if (dictionary.version !== TEST5_DICTIONARY_VERSION) {
    throw new Error(`Frozen dictionary version changed: expected ${TEST5_DICTIONARY_VERSION}, got ${dictionary.version ?? 'missing'}.`);
  }

  const status = git('status', '--porcelain', '--untracked-files=all');
  if (status !== '') throw new Error('Git worktree is not clean. Commit or remove local changes before recording first-run evidence.');
  const commit = git('rev-parse', 'HEAD');

  // One look, two configurations: the paraphrase lane on (the product) and off (the ablation).
  const report = evaluate(['--queries', 'test5', '--iterations', '30']);
  const reportWithoutParaphrase = evaluate(['--queries', 'test5', '--iterations', '30', '--no-paraphrase']);
  const evidence = {
    evidence: {
      kind: 'cpu-search-test5-first-run',
      gitCommit: commit,
      cleanWorktree: true,
      queryBlobSha: TEST5_QUERY_BLOB_SHA,
      queryCount: TEST5_QUERY_COUNT,
      categoryCounts: TEST5_CATEGORY_COUNTS,
      dictionaryBlobSha: TEST5_DICTIONARY_BLOB_SHA,
      dictionaryVersion: TEST5_DICTIONARY_VERSION,
      methods: ['exact', 'bm25', 'cosine', 'flyhash'],
      iterations: 30,
      command: 'npm run eval:cpu-search:test5:first',
    },
    report,
    reportWithoutParaphrase,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidence = runFirstTest4();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
