import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalJsonValue,
  readJsonTree,
  resolveJsonPointer,
} from '../src/adapters/jsonTreeAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';
import { placeOf } from '../src/core/importLedger.js';

const sourceDigest = 'sha256:' + 'a'.repeat(64);

test('JSON explicit containers become observed deterministic Tree Candidates', () => {
  const document = readJsonTree(
    JSON.stringify({
      service: {
        name: 'billing',
        endpoints: [
          { path: '/pay', method: 'POST' },
          { path: '/refund', method: 'POST' },
        ],
      },
      enabled: true,
    }),
    './data/service.json',
    sourceDigest,
  );

  assert.deepEqual(
    document.nodes.map((node) => node.pointer),
    ['', '/service', '/service/endpoints', '/service/endpoints/0', '/service/endpoints/1'],
  );

  const root = document.nodes[0];
  assert.equal(root.nodeType, 'object');
  assert.deepEqual(root.childPointers, ['/enabled', '/service']);
  assert.deepEqual(root.leafValues, ['/enabled=true']);
  assert.equal(root.candidate.kind, 'tree');
  assert.equal(root.candidate.status, 'observed');
  assert.equal(root.candidate.execution, 'deterministic');
  assert.equal(root.candidate.method, 'M0');
  assert.equal(root.candidate.locator.structuralPath, '');
  assert.equal(placeOf(root.candidate), 'path:');
  assert.equal(candidateProblem(root.candidate), undefined);

  const endpoints = document.nodes.find(
    (node) => node.pointer === '/service/endpoints',
  );
  assert.ok(endpoints);
  assert.equal(endpoints.nodeType, 'array');
  assert.deepEqual(
    endpoints.childPointers,
    ['/service/endpoints/0', '/service/endpoints/1'],
  );
});

test('JSON Pointer escaping and lookup preserve format-native structural identity', () => {
  const document = readJsonTree(
    JSON.stringify({ 'a/b': { '~key': [1, 2] } }),
    './data/escaped.json',
    sourceDigest,
  );

  assert.deepEqual(
    document.nodes.map((node) => node.pointer),
    ['', '/a~1b', '/a~1b/~0key'],
  );
  assert.deepEqual(
    resolveJsonPointer(document.value, '/a~1b/~0key'),
    [1, 2],
  );
  assert.equal(resolveJsonPointer(document.value, '/missing'), undefined);
});

test('Tree fingerprints ignore JSON object key order but preserve array order', () => {
  const first = readJsonTree(
    '{"b":2,"a":{"y":1,"x":0}}',
    './data/a.json',
    sourceDigest,
  );
  const reordered = readJsonTree(
    '{"a":{"x":0,"y":1},"b":2}',
    './data/a.json',
    sourceDigest,
  );
  assert.equal(
    first.nodes[0].candidate.fingerprint.digest,
    reordered.nodes[0].candidate.fingerprint.digest,
  );

  assert.notEqual(
    canonicalJsonValue([1, 2]),
    canonicalJsonValue([2, 1]),
  );
});


test('JSON Tree normalizes negative zero like JSON.stringify and rejects non-finite parsed numbers', () => {
  const negativeZero = readJsonTree(
    '{"value":-0}',
    './data/value.json',
    sourceDigest,
  );
  const zero = readJsonTree(
    '{"value":0}',
    './data/value.json',
    sourceDigest,
  );
  assert.equal(
    negativeZero.candidates[0].fingerprint.digest,
    zero.candidates[0].fingerprint.digest,
  );

  assert.throws(
    () => readJsonTree(
      '{"value":1e400}',
      './data/value.json',
      sourceDigest,
    ),
    /numbers must be finite/u,
  );
});


test('JSON Tree rejects unpaired UTF-16 surrogate escapes before fingerprinting', () => {
  assert.throws(
    () => readJsonTree(
      '{"value":"\\ud800"}',
      './data/value.json',
      sourceDigest,
    ),
    /unpaired UTF-16 surrogates/u,
  );
  assert.throws(
    () => readJsonTree(
      '{"\\udc00":"value"}',
      './data/value.json',
      sourceDigest,
    ),
    /unpaired UTF-16 surrogates/u,
  );

  assert.doesNotThrow(
    () => readJsonTree(
      '{"value":"\\ud83d\\ude00"}',
      './data/value.json',
      sourceDigest,
    ),
  );
});


test('JSON Tree rejects integers outside the portable safe-integer range', () => {
  assert.throws(
    () => readJsonTree(
      '{"value":9007199254740992}',
      './data/value.json',
      sourceDigest,
    ),
    /safe-integer range/u,
  );
  assert.doesNotThrow(
    () => readJsonTree(
      '{"value":9007199254740991}',
      './data/value.json',
      sourceDigest,
    ),
  );
});
