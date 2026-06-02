import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEmbedQueries, parseEmbedSyntax } from '../src/parser/embedSyntax.js';

test('parseEmbedSyntax extracts filepath, target, range and params', () => {
  const parsed = parseEmbedSyntax('![[docs/sample.xlsx#Sheet1|A1:C3?header=first&mode=table]]');

  assert.ok(parsed);
  assert.equal(parsed.filepath, 'docs/sample.xlsx');
  assert.equal(parsed.target, 'Sheet1');
  assert.equal(parsed.range, 'A1:C3');
  assert.equal(parsed.params.get('header'), 'first');
  assert.equal(parsed.params.get('mode'), 'table');
});

test('extractEmbedQueries finds inline embeds inside a sentence', () => {
  const parsed = extractEmbedQueries('before ![[docs/sample.csv#Sheet1|A1:B2?mode=table]] after');

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.filepath, 'docs/sample.csv');
});

test('parseEmbedSyntax supports query-only embeds without range delimiters', () => {
  const parsed = parseEmbedSyntax('![[docs/sample.csv?grep=AUTH]]');

  assert.ok(parsed);
  assert.equal(parsed.filepath, 'docs/sample.csv');
  assert.equal(parsed.range, undefined);
  assert.equal(parsed.params.get('grep'), 'AUTH');
});

test('parseEmbedSyntax returns null for non-embed text', () => {
  assert.equal(parseEmbedSyntax('[link](example)'), null);
});
