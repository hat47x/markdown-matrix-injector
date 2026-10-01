import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  gitBlobSha,
  TEST4_CATEGORY_COUNTS,
  TEST4_DICTIONARY_BLOB_SHA,
  TEST4_DICTIONARY_VERSION,
  TEST4_QUERY_BLOB_SHA,
  TEST4_QUERY_COUNT,
} from '../scripts/cpu-search-eval/test4-first-run.js';

const queryUrl = new URL('../scripts/cpu-search-eval/queries.test4.json', import.meta.url);
const dictionaryUrl = new URL('../scripts/cpu-search-eval/dictionary.json', import.meta.url);

test('frozen CPU search v4 evidence inputs retain their exact Git blobs', () => {
  const queryBytes = fs.readFileSync(queryUrl);
  const dictionaryBytes = fs.readFileSync(dictionaryUrl);
  assert.equal(gitBlobSha(queryBytes), TEST4_QUERY_BLOB_SHA);
  assert.equal(gitBlobSha(dictionaryBytes), TEST4_DICTIONARY_BLOB_SHA);

  const queries = JSON.parse(queryBytes.toString('utf8')) as Array<{ category: string }>;
  assert.equal(queries.length, TEST4_QUERY_COUNT);
  const counts: Record<string, number> = {};
  for (const query of queries) counts[query.category] = (counts[query.category] ?? 0) + 1;
  assert.deepEqual(counts, TEST4_CATEGORY_COUNTS);

  const dictionary = JSON.parse(dictionaryBytes.toString('utf8')) as { version?: string };
  assert.equal(dictionary.version, TEST4_DICTIONARY_VERSION);
});
