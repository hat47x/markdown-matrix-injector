/**
 * One-shot evidence runner for the frozen CPU-search held-out v4 set.
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

export const TEST4_QUERY_BLOB_SHA = '34f9dfc205f10b18f1fd13927c67f7e6a44bd72f';
export const TEST4_DICTIONARY_BLOB_SHA = 'dc418c576d800dba64442a3acabdb26b8e80f34d';
export const TEST4_DICTIONARY_VERSION = 'dev-2';
export const TEST4_QUERY_COUNT = 40;

export const TEST4_CATEGORY_COUNTS: Readonly<Record<string, number>> = {
  exact: 8,
  abbreviation: 6,
  paraphrase: 8,
  typo: 4,
  duplicate: 4,
  unsupported: 5,
  none: 5,
};

const queryPath = path.join(here, 'queries.test4.json');
const dictionaryPath = path.join(here, 'dictionary.json');
const defaultOutput = path.resolve(here, '../../artifacts/cpu-search-test4-first-run.json');

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

function argValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

export function runFirstTest4(argv = process.argv.slice(2)): Record<string, unknown> {
  const unknown = argv.filter((arg, i) => !(arg === '--out' || (i > 0 && argv[i - 1] === '--out')));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);

  const output = path.resolve(argValue(argv, '--out') ?? defaultOutput);
  if (fs.existsSync(output)) {
    throw new Error(`First-run evidence already exists: ${output}. Refusing to overwrite it.`);
  }

  const queryBytes = assertFrozenFile(queryPath, TEST4_QUERY_BLOB_SHA, 'queries.test4.json');
  const dictionaryBytes = assertFrozenFile(dictionaryPath, TEST4_DICTIONARY_BLOB_SHA, 'dictionary.json');
  const queries = JSON.parse(queryBytes.toString('utf8')) as Array<{ category: string }>;
  const dictionary = JSON.parse(dictionaryBytes.toString('utf8')) as { version?: string };

  if (queries.length !== TEST4_QUERY_COUNT) {
    throw new Error(`Frozen test4 query count changed: expected ${TEST4_QUERY_COUNT}, got ${queries.length}.`);
  }
  const categoryCounts: Record<string, number> = {};
  for (const query of queries) categoryCounts[query.category] = (categoryCounts[query.category] ?? 0) + 1;
  if (JSON.stringify(categoryCounts) !== JSON.stringify(TEST4_CATEGORY_COUNTS)) {
    throw new Error(`Frozen test4 category counts changed: ${JSON.stringify(categoryCounts)}.`);
  }
  if (dictionary.version !== TEST4_DICTIONARY_VERSION) {
    throw new Error(`Frozen dictionary version changed: expected ${TEST4_DICTIONARY_VERSION}, got ${dictionary.version ?? 'missing'}.`);
  }

  const status = git('status', '--porcelain', '--untracked-files=all');
  if (status !== '') throw new Error('Git worktree is not clean. Commit or remove local changes before recording first-run evidence.');
  const commit = git('rev-parse', 'HEAD');

  const report = evaluate(['--queries', 'test4', '--iterations', '30']);
  const evidence = {
    evidence: {
      kind: 'cpu-search-test4-first-run',
      gitCommit: commit,
      cleanWorktree: true,
      queryBlobSha: TEST4_QUERY_BLOB_SHA,
      queryCount: TEST4_QUERY_COUNT,
      categoryCounts: TEST4_CATEGORY_COUNTS,
      dictionaryBlobSha: TEST4_DICTIONARY_BLOB_SHA,
      dictionaryVersion: TEST4_DICTIONARY_VERSION,
      methods: ['exact', 'bm25', 'cosine', 'flyhash'],
      iterations: 30,
      command: 'npm run eval:cpu-search:test4:first',
    },
    report,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidence = runFirstTest4();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
