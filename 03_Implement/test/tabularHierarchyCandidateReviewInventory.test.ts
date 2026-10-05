import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';

import { buildCandidateReviewInventory } from '../src/application/candidateReviewInventory.js';
import { extractTabularHierarchyTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

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


test('reviewed tabular Tree metadata round-trips through extract and the shared ledger', () => {
  const source = fixture([
    'ID,Parent,Name',
    'A,,Account',
    'A-1,A,Create',
    'A-2,A,Close',
    'B,,Operations',
  ].join('\n'));
  const root = path.dirname(source);
  const assets = path.join(root, 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const doc = path.join(root, 'spec.md');

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
  const account = inventory.items.find(
    (item) =>
      item.kind === 'tree'
      && item.format === 'tabular'
      && item.pointer === 'table-hierarchy:parent-id:id:A',
  );
  assert.ok(account && account.kind === 'tree' && account.format === 'tabular');
  assert.ok(account.sheet);
  assert.ok(account.tabularHierarchy);

  const extracted = extractTabularHierarchyTree({
    sourcePath: source,
    pointer: account.pointer,
    outDir: assets,
    fromDocument: doc,
    sourceLabel: 'hierarchy.csv',
    ledgerPath,
    expectedCandidateFingerprint: account.candidate.fingerprint.digest,
    sheet: account.sheet,
    config: account.tabularHierarchy,
  });

  assert.deepEqual(extracted.problems, []);
  assert.ok(extracted.extracted);
  assert.match(extracted.extracted.markdown, /- Account\n  - Create\n  - Close/u);
  assert.match(
    extracted.extracted.markdown,
    /projection="tabular-hierarchy-nested-list-v1"/u,
  );

  const ledger = readLedger(ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'tree');
  assert.equal(ledger.entries[0].sheet, 'Sheet1');
  assert.equal(
    ledger.entries[0].place,
    'path:table-hierarchy:parent-id:id:A',
  );
});

test('legacy XLS hierarchy sources use the same explicit review contract', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-hierarchy-review-xls-'),
  );
  const source = path.join(root, 'hierarchy.xls');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ID', 'Parent', 'Name'],
    ['A', '', 'Account'],
    ['A-1', 'A', 'Create'],
    ['B', '', 'Operations'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hierarchy');
  fs.writeFileSync(
    source,
    XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }),
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'hierarchy.xls',
    {
      tabularHierarchy: {
        sheet: 'Hierarchy',
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

  assert.deepEqual(inventory.imageDiagnostics, []);
  assert.deepEqual(
    inventory.items
      .filter((item) => item.kind === 'tree')
      .map((item) => item.kind === 'tree' ? item.pointer : ''),
    [
      'table-hierarchy:parent-id:id:A',
      'table-hierarchy:parent-id:id:A-1',
      'table-hierarchy:parent-id:id:B',
    ],
  );
});
