import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeYamlUtf8,
  readYamlTree,
} from '../src/adapters/yamlTreeAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';
import { placeOf } from '../src/core/importLedger.js';

const sourceDigest = 'sha256:' + 'a'.repeat(64);

test('restricted YAML 1.2 mappings and sequences become observed deterministic Tree Candidates', () => {
  const document = readYamlTree(
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      '    - path: /refund',
      '      method: POST',
      'enabled: true',
      '',
    ].join('\n'),
    './data/service.yaml',
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
  assert.equal(root.candidate.provenance.algorithm, 'mmi.yaml-tree-adapter');
  assert.equal(
    root.candidate.fingerprint.representation,
    'yaml-subtree-canonical-v1',
  );
  assert.equal(candidateProblem(root.candidate), undefined);
});

test('YAML mapping order does not change subtree fingerprint while sequence order does', () => {
  const first = readYamlTree(
    'b: 2\na:\n  y: 1\n  x: 0\n',
    './data/a.yaml',
    sourceDigest,
  );
  const reordered = readYamlTree(
    'a:\n  x: 0\n  y: 1\nb: 2\n',
    './data/a.yaml',
    sourceDigest,
  );
  assert.equal(
    first.nodes[0].candidate.fingerprint.digest,
    reordered.nodes[0].candidate.fingerprint.digest,
  );

  const arrayA = readYamlTree(
    'values: [1, 2]\n',
    './data/a.yaml',
    sourceDigest,
  );
  const arrayB = readYamlTree(
    'values: [2, 1]\n',
    './data/a.yaml',
    sourceDigest,
  );
  assert.notEqual(
    arrayA.nodes[0].candidate.fingerprint.digest,
    arrayB.nodes[0].candidate.fingerprint.digest,
  );
});

test('YAML Tree rejects aliases, merge-shaped keys and multiple documents', () => {
  assert.throws(
    () => readYamlTree(
      'base: &base\n  a: 1\ncopy: *base\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /unsupported aliases or values/u,
  );

  assert.throws(
    () => readYamlTree(
      '"<<":\n  a: 1\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /must not use the << merge key/u,
  );

  assert.throws(
    () => readYamlTree(
      'a: 1\n---\nb: 2\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /exactly one document/u,
  );
});

test('YAML Tree rejects duplicate/non-string keys, custom tags and YAML 1.1', () => {
  assert.throws(
    () => readYamlTree(
      'a: 1\na: 2\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /invalid|unique|map keys|key/iu,
  );

  assert.throws(
    () => readYamlTree(
      '? [a, b]\n: value\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /invalid|string|key/iu,
  );

  assert.throws(
    () => readYamlTree(
      'value: !custom tagged\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /unsupported YAML features|tag/iu,
  );

  assert.throws(
    () => readYamlTree(
      '%YAML 1.1\n---\nflag: yes\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /must use YAML 1\.2/u,
  );
});

test('YAML Tree rejects non-finite scalars and malformed UTF-8', () => {
  assert.throws(
    () => readYamlTree(
      'value: .inf\n',
      './data/a.yaml',
      sourceDigest,
    ),
    /numbers must be finite/u,
  );

  assert.throws(
    () => decodeYamlUtf8(
      Uint8Array.from([0x76, 0x3a, 0x20, 0xff]),
    ),
    /YAML source must be valid UTF-8/u,
  );
});
