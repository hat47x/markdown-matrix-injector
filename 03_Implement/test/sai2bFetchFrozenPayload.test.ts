import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(
  new URL('../scripts/sai2b-fetch-frozen-payload.mts', import.meta.url),
  'utf8',
);

test('offline fetch helper is transport-only and emits handoff receipt fields', () => {
  for (const field of [
    'request_url',
    'final_url',
    'redirect_chain',
    'http_status',
    'content_type',
    'retrieved_at_utc',
  ]) {
    assert.match(script, new RegExp(field, 'u'));
  }

  assert.match(script, /redirect:\s*'manual'/u);
  assert.match(script, /response\.arrayBuffer\(\)/u);
  assert.doesNotMatch(script, /workbook\.xml/u);
  assert.doesNotMatch(script, /worksheet/u);
  assert.doesNotMatch(script, /sha256/u);
});

test('offline fetch helper does not substitute the request identity', () => {
  assert.match(script, /const requestUrl = args\.get\('url'\)/u);
  assert.match(script, /request_url: requestUrl/u);
  assert.doesNotMatch(script, /fallback/u);
  assert.doesNotMatch(script, /alternate/u);
});
