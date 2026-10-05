import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-tabular-tree-'));
  const source = path.join(root, 'hierarchy.csv');
  fs.writeFileSync(
    source,
    [
      'ID,Parent,Name,Owner',
      'A,,Account,Team A',
      'A-1,A,Create,Team A',
      'A-2,A,Close,Team B',
      'B,,Operations,Team C',
      'B-1,B,Deploy,Team C',
    ].join('\n'),
    'utf8',
  );
  return { root, source };
}

const parentConfig = {
  mode: 'parent-id' as const,
  idHeader: 'ID',
  parentHeader: 'Parent',
  labelHeader: 'Name',
};

test('normal Candidate review does not infer tabular Tree column meaning', () => {
  const { source } = workspace();

  const inventory = buildCandidateReviewInventory(source, 'hierarchy.csv');

  assert.equal(
    inventory.items.some((item) => item.kind === 'tree'),
    false,
  );
  assert.equal(
    inventory.items.some((item) => item.kind === 'table'),
    true,
  );
});

test('explicit hierarchy columns add tabular Tree Candidates to review inventory', () => {
  const { source } = workspace();

  const inventory = buildCandidateReviewInventory(
    source,
    'hierarchy.csv',
    {
      tabularHierarchies: [{
        sheet: 'Sheet1',
        config: parentConfig,
      }],
    },
  );

  const trees = inventory.items.filter(
    (item) => item.kind === 'tree',
  );
  assert.equal(trees.length, 5);
  assert.equal(
    trees.every(
      (item) =>
        item.kind === 'tree'
        && item.format === 'tabular'
        && item.nodeType === 'table-node'
        && item.sheet === 'Sheet1'
        && item.candidate.kind === 'tree'
        && item.candidate.status === 'inferred'
        && item.candidate.execution === 'deterministic'
        && item.candidate.method === 'M1',
    ),
    true,
  );

  const account = trees.find(
    (item) =>
      item.kind === 'tree'
      && item.pointer === 'table-hierarchy:parent-id:id:A',
  );
  assert.ok(account && account.kind === 'tree' && account.format === 'tabular');
  assert.equal(account.childCount, 2);
  assert.equal(account.leafCount, 0);
  assert.deepEqual(account.tabularConfig, parentConfig);

  const create = trees.find(
    (item) =>
      item.kind === 'tree'
      && item.pointer === 'table-hierarchy:parent-id:id:A-1',
  );
  assert.ok(create && create.kind === 'tree' && create.format === 'tabular');
  assert.equal(create.childCount, 0);
  assert.equal(create.leafCount, 1);
});

test('explicit level and label columns expose the same review surface', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-tabular-level-'));
  const source = path.join(root, 'levels.csv');
  fs.writeFileSync(
    source,
    [
      'Level,Label,Note',
      '1,Account,root',
      '2,Create,child',
      '2,Close,child',
      '1,Operations,root',
    ].join('\n'),
    'utf8',
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'levels.csv',
    {
      tabularHierarchies: [{
        sheet: 'Sheet1',
        config: {
          mode: 'level',
          levelHeader: 'Level',
          labelHeader: 'Label',
        },
      }],
    },
  );

  const trees = inventory.items.filter(
    (item) => item.kind === 'tree',
  );
  assert.equal(trees.length, 4);
  assert.equal(
    trees.every(
      (item) =>
        item.kind === 'tree'
        && item.format === 'tabular'
        && item.tabularConfig.mode === 'level',
    ),
    true,
  );
});

test('an invalid explicit hierarchy mapping fails instead of silently changing meaning', () => {
  const { source } = workspace();

  assert.throws(
    () => buildCandidateReviewInventory(
      source,
      'hierarchy.csv',
      {
        tabularHierarchies: [{
          sheet: 'Sheet1',
          config: {
            mode: 'parent-id',
            idHeader: 'ID',
            parentHeader: 'MissingParent',
            labelHeader: 'Name',
          },
        }],
      },
    ),
    /tabular hierarchy could not be established.*header-missing/u,
  );
});
