import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildCandidateReviewInventory } from '../src/application/candidateReviewInventory.js';

function fixture(contents: string): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-hierarchy-review-'),
  );
  const source = path.join(root, 'hierarchy.csv');
  fs.writeFileSync(source, contents, 'utf8');
  return source;
}

test('hierarchy-only review inventory exposes configured parent-ID Tree Candidates', () => {
  const source = fixture([
    'ID,Parent,Name',
    'A,,Account',
    'A-1,A,Create',
    'B,,Operations',
  ].join('\n'));

  const inventory = buildCandidateReviewInventory(
    source,
    'hierarchy.csv',
    {
      tabularHierarchy: {
        sheet: 'Sheet1',
        config: {
          mode: 'parent-id',
          idHeader: 'ID',
          parentHeader: 'Parent',
          labelHeader: 'Name',
        },
      },
      hierarchyOnly: true,
    },
  );

  assert.equal(inventory.imageDiagnostics.length, 0);
  assert.deepEqual(
    inventory.items.map((item) => ({
      kind: item.kind,
      format: item.kind === 'tree' ? item.format : undefined,
      pointer: item.kind === 'tree' ? item.pointer : undefined,
      status: item.candidate.status,
      method: item.candidate.method,
      sheet: item.kind === 'tree' ? item.sheet : undefined,
    })),
    [
      {
        kind: 'tree',
        format: 'tabular',
        pointer: 'table-hierarchy:parent-id:id:A',
        status: 'inferred',
        method: 'M1',
        sheet: 'Sheet1',
      },
      {
        kind: 'tree',
        format: 'tabular',
        pointer: 'table-hierarchy:parent-id:id:A-1',
        status: 'inferred',
        method: 'M1',
        sheet: 'Sheet1',
      },
      {
        kind: 'tree',
        format: 'tabular',
        pointer: 'table-hierarchy:parent-id:id:B',
        status: 'inferred',
        method: 'M1',
        sheet: 'Sheet1',
      },
    ],
  );
  assert.equal(
    inventory.items.every(
      (item) =>
        item.kind === 'tree'
        && item.tabularHierarchy?.mode === 'parent-id',
    ),
    true,
  );
});

test('hierarchy review surfaces abstention when configured columns cannot form a hierarchy', () => {
  const source = fixture([
    'ID,Parent',
    'A,Z',
  ].join('\n'));

  const inventory = buildCandidateReviewInventory(
    source,
    'hierarchy.csv',
    {
      tabularHierarchy: {
        sheet: 'Sheet1',
        config: {
          mode: 'parent-id',
          idHeader: 'ID',
          parentHeader: 'Parent',
        },
      },
      hierarchyOnly: true,
    },
  );

  assert.deepEqual(inventory.items, []);
  assert.equal(
    inventory.tabularHierarchyAbstention?.reasonCode,
    'tabular-hierarchy-parent-missing',
  );
  assert.equal(
    inventory.tabularHierarchyAbstention?.evidence.some(
      (item) => item.includes('parent-id-missing'),
    ),
    true,
  );
});

test('hierarchy review reports subtree leaf counts instead of a constant placeholder', () => {
  const source = fixture([
    'ID,Parent,Name',
    'A,,Account',
    'A-1,A,Create',
    'A-2,A,Disable',
    'A-2-a,A-2,Reason',
  ].join('\n'));

  const inventory = buildCandidateReviewInventory(
    source,
    'hierarchy.csv',
    {
      tabularHierarchy: {
        sheet: 'Sheet1',
        config: {
          mode: 'parent-id',
          idHeader: 'ID',
          parentHeader: 'Parent',
          labelHeader: 'Name',
        },
      },
      hierarchyOnly: true,
    },
  );

  const trees = inventory.items.filter(
    (item) => item.kind === 'tree',
  );
  const root = trees.find(
    (item) => item.kind === 'tree'
      && item.pointer === 'table-hierarchy:parent-id:id:A',
  );
  const branch = trees.find(
    (item) => item.kind === 'tree'
      && item.pointer === 'table-hierarchy:parent-id:id:A-2',
  );
  assert.ok(root && root.kind === 'tree');
  assert.ok(branch && branch.kind === 'tree');
  assert.equal(root.childCount, 2);
  assert.equal(root.leafCount, 2);
  assert.equal(branch.childCount, 1);
  assert.equal(branch.leafCount, 1);
});
