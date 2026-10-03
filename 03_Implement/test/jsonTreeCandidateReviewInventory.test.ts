import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';

test('Candidate review inventory exposes explicit JSON Tree nodes without workbook parsing', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-json-tree-'),
  );
  const source = path.join(root, 'service.json');
  fs.writeFileSync(
    source,
    JSON.stringify({
      service: {
        name: 'billing',
        endpoints: [
          { path: '/pay', method: 'POST' },
        ],
      },
      enabled: true,
    }, null, 2),
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'service.json',
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
        && item.candidate.kind === 'tree'
        && item.candidate.status === 'observed'
        && item.candidate.execution === 'deterministic',
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
