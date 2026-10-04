import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';

test('Candidate review inventory exposes inferred flat-text Tree nodes without workbook parsing', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-flat-tree-'),
  );
  const source = path.join(root, 'outline.txt');
  fs.writeFileSync(
    source,
    [
      '1. Overview',
      '1.1 Scope',
      '1.2 Data',
      '2. Operations',
      '2.1 Deploy',
    ].join('\n'),
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'outline.txt',
  );

  assert.deepEqual(inventory.imageDiagnostics, []);
  const trees = inventory.items.filter(
    (item) => item.kind === 'tree',
  );
  assert.equal(trees.length, 5);
  assert.equal(
    trees.every(
      (item) =>
        item.kind === 'tree'
        && item.format === 'text'
        && item.method === 'heading-number'
        && item.nodeType === 'text-node'
        && item.candidate.kind === 'tree'
        && item.candidate.status === 'inferred'
        && item.candidate.execution === 'deterministic'
        && item.candidate.method === 'M1',
    ),
    true,
  );

  const scope = trees.find(
    (item) =>
      item.kind === 'tree'
      && item.pointer === 'text:heading-number:line:2',
  );
  assert.ok(scope && scope.kind === 'tree');
  assert.equal(scope.childCount, 0);
  assert.equal(scope.leafCount, 1);
});

test('Candidate review inventory does not turn an abstained flat-text rule into an actionable item', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-flat-tree-'),
  );
  const source = path.join(root, 'outline.txt');
  fs.writeFileSync(
    source,
    [
      '1. Root',
      '1.1 Child',
      '2.1 Orphan',
    ].join('\n'),
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'outline.txt',
  );

  assert.deepEqual(inventory.items, []);
  assert.deepEqual(inventory.imageDiagnostics, []);
});
