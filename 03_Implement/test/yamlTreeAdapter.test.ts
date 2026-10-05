import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readYamlTree,
} from '../src/adapters/yamlTreeAdapter.js';
import { decodeYamlUtf8 } from '../src/core/yamlFormat.js';

const digest = 'sha256:' + 'c'.repeat(64);

test('YAML JSON-compatible structure becomes observed deterministic M0 Tree Candidates', () => {
  const tree = readYamlTree(
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      'enabled: true',
      '',
    ].join('\n'),
    './service.yaml',
    digest,
  );

  assert.deepEqual(
    tree.nodes.map((node) => node.pointer),
    ['', '/service', '/service/endpoints', '/service/endpoints/0'],
  );
  const service = tree.nodes[1].candidate;
  assert.equal(service.status, 'observed');
  assert.equal(service.execution, 'deterministic');
  assert.equal(service.method, 'M0');
  assert.equal(
    service.provenance.algorithm,
    'mmi.yaml-tree-adapter',
  );
  assert.equal(
    service.fingerprint.representation,
    'yaml-json-compatible-subtree-v1',
  );
});

test('YAML fingerprint is semantic across comments and mapping key order', () => {
  const first = readYamlTree(
    'a: 1\nb: [true, null, text]\n',
    './a.yaml',
    digest,
  );
  const second = readYamlTree(
    '# comment\nb: [true, null, text]\na: 1\n',
    './a.yaml',
    digest,
  );
  assert.equal(
    first.candidates[0].fingerprint.digest,
    second.candidates[0].fingerprint.digest,
  );
});

test('YAML Tree rejects anchors, aliases, merge keys and explicit tags', () => {
  const fixtures = [
    ['anchor', 'base: &base\n  x: 1\n'],
    ['alias', 'base: &base\n  x: 1\ncopy: *base\n'],
    ['merge', 'base:\n  x: 1\ncopy:\n  <<: { x: 1 }\n'],
    ['tag', 'value: !!str 1\n'],
  ] as const;
  for (const [name, source] of fixtures) {
    assert.throws(
      () => readYamlTree(source, './unsafe.yaml', digest),
      /not supported/u,
      name,
    );
  }
});

test('YAML Tree rejects non-string keys, YAML 1.1, non-finite and unsafe integers', () => {
  assert.throws(
    () => readYamlTree('1: value\n', './key.yaml', digest),
    /mapping keys must be strings/u,
  );
  assert.throws(
    () => readYamlTree(
      '%YAML 1.1\n---\nvalue: yes\n',
      './old.yaml',
      digest,
    ),
    /YAML 1\.2 only/u,
  );
  assert.throws(
    () => readYamlTree('value: .inf\n', './inf.yaml', digest),
    /numbers must be finite/u,
  );
  assert.throws(
    () => readYamlTree(
      'value: 9007199254740992\n',
      './unsafe-integer.yaml',
      digest,
    ),
    /safe-integer range/u,
  );
  assert.doesNotThrow(
    () => readYamlTree(
      'value: 9007199254740991\n',
      './safe-integer.yaml',
      digest,
    ),
  );
});

test('YAML source bytes must be valid UTF-8', () => {
  assert.throws(
    () => decodeYamlUtf8(
      Buffer.from([0x61, 0x3a, 0x20, 0xff, 0x0a]),
    ),
    /valid UTF-8/u,
  );
});
