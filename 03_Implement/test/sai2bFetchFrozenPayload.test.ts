import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(
  new URL('../scripts/sai2b-fetch-frozen-payload.mts', import.meta.url),
  'utf8',
);

test('offline fetch helper emits provenance-bound transport receipt fields', () => {
  for (const field of [
    'schema',
    'source_id',
    'request_url',
    'final_url',
    'redirect_chain',
    'http_status',
    'content_type',
    'byte_size',
    'sha256',
    'retrieved_at_utc',
    'workbook_semantic_inspection_performed',
  ]) {
    assert.match(script, new RegExp(field, 'u'));
  }

  assert.match(script, /--source-id/u);
  assert.match(script, /redirect:\s*'manual'/u);
  assert.match(script, /response\.arrayBuffer\(\)/u);
  assert.match(script, /createHash\('sha256'\)/u);
  assert.match(
    script,
    /workbook_semantic_inspection_performed:\s*false/u,
  );
  assert.doesNotMatch(script, /workbook\.xml/u);
  assert.doesNotMatch(script, /worksheet/u);
});

test('offline fetch helper does not substitute the request identity', () => {
  assert.match(script, /const requestUrl = args\.get\('url'\)/u);
  assert.match(script, /request_url: requestUrl/u);
  assert.doesNotMatch(script, /fallback/u);
  assert.doesNotMatch(script, /alternate/u);
});


test('offline fetch helper fail-closes before following a non-HTTPS redirect', () => {
  assert.match(
    script,
    /new URL\(nextUrl\)\.protocol !== 'https:'/u,
  );
  assert.match(script, /redirect_non_https_target/u);
});


test('offline fetch helper enforces the literal frozen receipt Content-Type pattern', () => {
  assert.match(script, /FROZEN_CONTENT_TYPE_PATTERN/u);
  assert.match(
    script,
    /application\\\/zip\|application\\\/octet-stream/u,
  );
  assert.doesNotMatch(script, /toLowerCase\(\)/u);
});
