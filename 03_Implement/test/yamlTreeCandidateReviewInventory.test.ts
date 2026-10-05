import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';

test('Candidate review inventory exposes restricted YAML Tree nodes', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-yaml-tree-'),
  );
  const source = path.join(root, 'service.yaml');
  fs.writeFileSync(
    source,
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      'enabled: true',
      '',
    ].join('\n'),
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'service.yaml',
  );

  assert.deepEqual(inventory.imageDiagnostics, []);
  assert.deepEqual(
    inventory.items.map((item) =>
      item.kind === 'tree' ? item.pointer : item.kind),
    ['', '/service', '/service/endpoints', '/service/endpoints/0'],
  );
  assert.equal(
    inventory.items.every(
      (item) =>
        item.kind === 'tree'
        && item.format === 'yaml'
        && item.candidate.kind === 'tree'
        && item.candidate.status === 'observed'
        && item.candidate.execution === 'deterministic'
        && item.candidate.provenance.algorithm === 'mmi.yaml-tree-adapter',
    ),
    true,
  );

  const service = inventory.items.find(
    (item) => item.kind === 'tree' && item.pointer === '/service',
  );
  assert.ok(service && service.kind === 'tree');
  assert.equal(service.nodeType, 'object');
  assert.equal(service.childCount, 2);
  assert.equal(service.leafCount, 1);
});

test('Candidate review inventory rejects YAML alias semantics instead of flattening them', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-yaml-tree-'),
  );
  const source = path.join(root, 'service.yml');
  fs.writeFileSync(
    source,
    'base: &base\n  name: billing\ncopy: *base\n',
  );

  assert.throws(
    () => buildCandidateReviewInventory(source, 'service.yml'),
    /unsupported aliases or values/u,
  );
});
