import test from 'node:test';
import assert from 'node:assert/strict';

import { candidateProblem } from '../src/core/candidate.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import {
  readTabularHierarchy,
  type TabularHierarchyConfig,
} from '../src/adapters/tabularHierarchyAdapter.js';

const digest = 'sha256:' + 'b'.repeat(64);

function read(rows: string[][], config: TabularHierarchyConfig) {
  return readTabularHierarchy({
    source: './data/hierarchy.csv',
    sourceDigest: digest,
    sheetName: 'Sheet1',
    sheet: sheetSourceFromMatrix(rows),
    config,
  });
}

test('parent-ID columns preserve source values as M0 and infer only hierarchy as M1', () => {
  const result = read([
    ['ID', 'Parent', 'Name'],
    ['A', '', 'Account'],
    ['A-1', 'A', 'Create'],
    ['A-2', 'A', 'Disable'],
    ['A-2-a', 'A-2', 'Reason'],
  ], {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
    labelHeader: 'Name',
  });

  assert.equal(result.status, 'inferred');
  assert.deepEqual(result.resolvedColumns, {
    id: 0,
    parent: 1,
    label: 2,
  });
  assert.deepEqual(
    result.nodes.map((node) => ({
      key: node.key,
      parentKey: node.parentKey,
      depth: node.depth,
      children: node.childKeys,
      path: node.structuralPath,
    })),
    [
      {
        key: 'A',
        parentKey: undefined,
        depth: 0,
        children: ['A-1', 'A-2'],
        path: 'table-hierarchy:parent-id:id:A',
      },
      {
        key: 'A-1',
        parentKey: 'A',
        depth: 1,
        children: [],
        path: 'table-hierarchy:parent-id:id:A-1',
      },
      {
        key: 'A-2',
        parentKey: 'A',
        depth: 1,
        children: ['A-2-a'],
        path: 'table-hierarchy:parent-id:id:A-2',
      },
      {
        key: 'A-2-a',
        parentKey: 'A-2',
        depth: 2,
        children: [],
        path: 'table-hierarchy:parent-id:id:A-2-a',
      },
    ],
  );

  const child = result.nodes[1].candidate;
  assert.equal(candidateProblem(child), undefined);
  assert.equal(child.status, 'inferred');
  assert.equal(child.execution, 'deterministic');
  assert.equal(child.method, 'M1');
  assert.equal(child.locator.sheet, 'Sheet1');
  assert.equal(
    child.claims.find((claim) => claim.aspect === 'node-key')?.status,
    'observed',
  );
  assert.equal(
    child.claims.find((claim) => claim.aspect === 'parent-key-source')?.method,
    'M0',
  );
  assert.equal(
    child.claims.find((claim) => claim.aspect === 'parent-node')?.status,
    'inferred',
  );
  assert.equal(
    child.provenance.algorithm,
    'mmi.tabular-hierarchy.parent-id',
  );
});

test('level column infers nearest preceding parent without pretending level semantics are observed relationships', () => {
  const result = read([
    ['Level', 'Name'],
    ['1', 'Overview'],
    ['2', 'Scope'],
    ['2', 'Data'],
    ['3', 'Field'],
    ['1', 'Operations'],
    ['2', 'Deploy'],
  ], {
    mode: 'level',
    levelHeader: 'Level',
    labelHeader: 'Name',
  });

  assert.equal(result.status, 'inferred');
  assert.deepEqual(
    result.nodes.map((node) => [
      node.label,
      node.parentKey ?? null,
      node.depth,
    ]),
    [
      ['Overview', null, 0],
      ['Scope', 'row:3', 1],
      ['Data', 'row:3', 1],
      ['Field', 'row:5', 2],
      ['Operations', null, 0],
      ['Deploy', 'row:7', 1],
    ],
  );

  const field = result.nodes[3].candidate;
  assert.equal(
    field.claims.find((claim) => claim.aspect === 'hierarchy-level-source')?.status,
    'observed',
  );
  assert.equal(
    field.claims.find((claim) => claim.aspect === 'parent-node')?.method,
    'M1',
  );
  assert.equal(
    field.provenance.algorithm,
    'mmi.tabular-hierarchy.level',
  );
});

test('parent-ID adapter abstains on duplicate IDs, missing parents, self-parent and cycles', () => {
  const config: TabularHierarchyConfig = {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
  };
  const fixtures: Array<[string, string[][], string]> = [
    ['duplicate', [
      ['ID', 'Parent'],
      ['A', ''],
      ['A', ''],
    ], 'tabular-hierarchy-id-duplicate'],
    ['missing parent', [
      ['ID', 'Parent'],
      ['A', 'Z'],
    ], 'tabular-hierarchy-parent-missing'],
    ['self parent', [
      ['ID', 'Parent'],
      ['A', 'A'],
    ], 'tabular-hierarchy-self-parent'],
    ['cycle', [
      ['ID', 'Parent'],
      ['A', 'B'],
      ['B', 'A'],
    ], 'tabular-hierarchy-cycle'],
  ];

  for (const [name, rows, reason] of fixtures) {
    const result = read(rows, config);
    assert.equal(result.status, 'abstained', name);
    assert.equal(result.reasonCode, reason, name);
    assert.equal(result.nodes.length, 0, name);
    assert.equal(result.candidates.length, 1, name);
    assert.equal(result.candidates[0].status, 'abstained', name);
    assert.equal(candidateProblem(result.candidates[0]), undefined, name);
  }
});

test('level adapter abstains on non-numeric levels, missing labels and depth jumps', () => {
  const config: TabularHierarchyConfig = {
    mode: 'level',
    levelHeader: 'Level',
    labelHeader: 'Name',
  };
  const fixtures: Array<[string[][], string]> = [
    [[
      ['Level', 'Name'],
      ['root', 'Overview'],
    ], 'tabular-hierarchy-level-invalid'],
    [[
      ['Level', 'Name'],
      ['1', ''],
    ], 'tabular-hierarchy-label-missing'],
    [[
      ['Level', 'Name'],
      ['1', 'Overview'],
      ['3', 'Too deep'],
    ], 'tabular-hierarchy-level-jump'],
  ];

  for (const [rows, reason] of fixtures) {
    const result = read(rows, config);
    assert.equal(result.status, 'abstained');
    assert.equal(result.reasonCode, reason);
    assert.equal(result.candidates[0].status, 'abstained');
  }
});

test('missing or duplicate configured headers abstain instead of guessing another column', () => {
  const missing = read([
    ['ID', 'Name'],
    ['A', 'Account'],
  ], {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
    labelHeader: 'Name',
  });
  assert.equal(missing.status, 'abstained');
  assert.equal(
    missing.reasonCode,
    'tabular-hierarchy-header-missing',
  );

  const duplicate = read([
    ['ID', 'Parent', 'Parent'],
    ['A', '', ''],
  ], {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
  });
  assert.equal(duplicate.status, 'abstained');
  assert.equal(
    duplicate.reasonCode,
    'tabular-hierarchy-header-duplicate',
  );
});

test('explicit header row supports title and note rows above a hierarchy table', () => {
  const result = read([
    ['Hierarchy export', '', ''],
    ['Generated for review', '', ''],
    ['ID', 'Parent', 'Name'],
    ['A', '', 'Account'],
    ['A-1', 'A', 'Create'],
  ], {
    mode: 'parent-id',
    headerRow: 2,
    idHeader: 'ID',
    parentHeader: 'Parent',
    labelHeader: 'Name',
  });

  assert.equal(result.status, 'inferred');
  assert.deepEqual(
    result.nodes.map((node) => [node.key, node.parentKey ?? null]),
    [
      ['A', null],
      ['A-1', 'A'],
    ],
  );
  assert.equal(
    result.nodes[0].candidate.provenance.run.config.headerRow,
    2,
  );
  assert.equal(
    result.nodes[0].candidate.claims.find(
      (claim) => claim.aspect === 'source-row',
    )?.value,
    '4',
  );
});

test('configured header row outside the used range abstains instead of falling back', () => {
  const result = read([
    ['ID', 'Parent'],
    ['A', ''],
  ], {
    mode: 'parent-id',
    headerRow: 5,
    idHeader: 'ID',
    parentHeader: 'Parent',
  });

  assert.equal(result.status, 'abstained');
  assert.equal(
    result.reasonCode,
    'tabular-hierarchy-header-row-invalid',
  );
  assert.equal(
    result.candidates[0].claims
      .flatMap((claim) => claim.evidence ?? [])
      .some((evidence) =>
        evidence.code === 'configured-header-row-out-of-range'),
    true,
  );
});

test('parent-ID subtree fingerprint survives row movement while source-row evidence changes', () => {
  const config: TabularHierarchyConfig = {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
    labelHeader: 'Name',
  };
  const first = read([
    ['ID', 'Parent', 'Name'],
    ['A', '', 'Account'],
    ['A-1', 'A', 'Create'],
  ], config);
  const moved = read([
    ['ID', 'Parent', 'Name'],
    ['', '', ''],
    ['A', '', 'Account'],
    ['A-1', 'A', 'Create'],
  ], config);

  const before = first.nodes.find((node) => node.key === 'A')!.candidate;
  const after = moved.nodes.find((node) => node.key === 'A')!.candidate;
  assert.equal(before.fingerprint.digest, after.fingerprint.digest);
  assert.equal(
    before.locator.structuralPath,
    after.locator.structuralPath,
  );
  assert.notEqual(
    before.claims.find((claim) => claim.aspect === 'source-row')?.value,
    after.claims.find((claim) => claim.aspect === 'source-row')?.value,
  );
});

test('changing a parent relation stales relationship evidence even when the moved node content identity remains stable', () => {
  const config: TabularHierarchyConfig = {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
    labelHeader: 'Name',
  };
  const first = read([
    ['ID', 'Parent', 'Name'],
    ['A', '', 'A'],
    ['B', '', 'B'],
    ['X', 'A', 'X'],
  ], config);
  const moved = read([
    ['ID', 'Parent', 'Name'],
    ['A', '', 'A'],
    ['B', '', 'B'],
    ['X', 'B', 'X'],
  ], config);

  const before = first.nodes.find((node) => node.key === 'X')!.candidate;
  const after = moved.nodes.find((node) => node.key === 'X')!.candidate;
  assert.equal(before.fingerprint.digest, after.fingerprint.digest);
  assert.notDeepEqual(
    before.claims.find((claim) => claim.aspect === 'parent-node'),
    after.claims.find((claim) => claim.aspect === 'parent-node'),
  );
  assert.notEqual(
    first.nodes.find((node) => node.key === 'A')!.candidate.fingerprint.digest,
    moved.nodes.find((node) => node.key === 'A')!.candidate.fingerprint.digest,
  );
});
