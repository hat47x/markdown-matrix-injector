import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkExtractedProvenanceFreshness } from '../src/application/detachFreshness.js';
import { extractTabularHierarchyTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-tabular-tree-'),
  );
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  return {
    root,
    source: path.join(data, 'hierarchy.csv'),
    doc: path.join(docs, 'spec.md'),
    ledger: path.join(root, 'mmi-ledger.json'),
    assets: path.join(docs, 'assets'),
  };
}

const config = {
  mode: 'parent-id' as const,
  idHeader: 'ID',
  parentHeader: 'Parent',
  labelHeader: 'Name',
};

function csv(otherRoot = 'Operations', child = 'Create'): string {
  return [
    'ID,Parent,Name',
    'A,,Account',
    `A-1,A,${child}`,
    `B,,${otherRoot}`,
    'B-1,B,Deploy',
  ].join('\n');
}

test('tabular Tree extraction records reviewed provenance and survives unrelated source changes', () => {
  const ws = workspace();
  fs.writeFileSync(ws.source, csv(), 'utf8');

  const result = extractTabularHierarchyTree({
    sourcePath: ws.source,
    pointer: 'table-hierarchy:parent-id:id:A',
    outDir: ws.assets,
    fromDocument: ws.doc,
    ledgerPath: ws.ledger,
    sheet: 'Sheet1',
    config,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(
    result.extracted.markdown,
    /- Account\n  - Create/u,
  );
  assert.match(
    result.extracted.markdown,
    /projection="tabular-hierarchy-nested-list-v1"/u,
  );
  assert.match(
    result.extracted.markdown,
    /sheet-uri="Sheet1"/u,
  );
  assert.match(
    result.extracted.markdown,
    /hierarchy-mode="parent-id"/u,
  );

  const ledger = readLedger(ws.ledger);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'tree');
  assert.equal(ledger.entries[0].sheet, 'Sheet1');
  assert.equal(
    ledger.entries[0].place,
    'path:table-hierarchy:parent-id:id:A',
  );
  assert.equal(
    ledger.entries[0].conversion.mode,
    'tabular-hierarchy-nested-list-v1',
  );

  fs.writeFileSync(
    ws.doc,
    `# Spec\n\n${result.extracted.markdown}\n`,
    'utf8',
  );

  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: ws.doc,
      workspaceRoot: ws.root,
      ledgerPath: ws.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );

  fs.writeFileSync(
    ws.source,
    csv('Operations updated'),
    'utf8',
  );
  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: ws.doc,
      workspaceRoot: ws.root,
      ledgerPath: ws.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );
});

test('tabular Tree freshness rejects a changed reviewed subtree', () => {
  const ws = workspace();
  fs.writeFileSync(ws.source, csv(), 'utf8');

  const result = extractTabularHierarchyTree({
    sourcePath: ws.source,
    pointer: 'table-hierarchy:parent-id:id:A',
    outDir: ws.assets,
    fromDocument: ws.doc,
    ledgerPath: ws.ledger,
    sheet: 'Sheet1',
    config,
  });
  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  fs.writeFileSync(
    ws.doc,
    `# Spec\n\n${result.extracted.markdown}\n`,
    'utf8',
  );

  fs.writeFileSync(
    ws.source,
    csv('Operations', 'Create account'),
    'utf8',
  );
  const freshness = checkExtractedProvenanceFreshness({
    markdownFilePath: ws.doc,
    workspaceRoot: ws.root,
    ledgerPath: ws.ledger,
  });

  assert.equal(freshness.errors, 1);
  assert.equal(
    freshness.problems[0].code,
    'MMI_DETACH_EXTRACTED_STALE',
  );
  assert.equal(freshness.problems[0].ledgerState, 'changed');
  assert.equal(
    freshness.problems[0].place,
    'path:table-hierarchy:parent-id:id:A',
  );
});

test('tabular Tree extraction fails closed when the reviewed fingerprint changed', () => {
  const ws = workspace();
  fs.writeFileSync(ws.source, csv(), 'utf8');

  const initial = extractTabularHierarchyTree({
    sourcePath: ws.source,
    pointer: 'table-hierarchy:parent-id:id:A',
    outDir: ws.assets,
    sheet: 'Sheet1',
    config,
  });
  assert.ok(initial.extracted);

  fs.writeFileSync(
    ws.source,
    csv('Operations', 'Create account'),
    'utf8',
  );
  const changed = extractTabularHierarchyTree({
    sourcePath: ws.source,
    pointer: 'table-hierarchy:parent-id:id:A',
    outDir: ws.assets,
    sheet: 'Sheet1',
    config,
    expectedCandidateFingerprint:
      initial.extracted.candidateFingerprint,
  });

  assert.equal(changed.extracted, undefined);
  assert.equal(changed.problems.length, 1);
  assert.equal(
    changed.problems[0].code,
    'MMI_TREE_CANDIDATE_CHANGED',
  );
});


test('tabular Tree provenance round-trips quoted and Unicode header names', () => {
  const ws = workspace();
  fs.writeFileSync(
    ws.source,
    [
      '"識別""子","親 列","表示名"',
      'A,,アカウント',
      'A-1,A,作成',
    ].join('\n'),
    'utf8',
  );

  const specialConfig = {
    mode: 'parent-id' as const,
    idHeader: '識別"子',
    parentHeader: '親 列',
    labelHeader: '表示名',
  };
  const result = extractTabularHierarchyTree({
    sourcePath: ws.source,
    pointer: 'table-hierarchy:parent-id:id:A',
    outDir: ws.assets,
    fromDocument: ws.doc,
    ledgerPath: ws.ledger,
    sheet: 'Sheet1',
    config: specialConfig,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(
    result.extracted.markdown,
    /id-header-uri="%E8%AD%98%E5%88%A5%22%E5%AD%90"/u,
  );
  fs.writeFileSync(
    ws.doc,
    `# Spec\n\n${result.extracted.markdown}\n`,
    'utf8',
  );

  assert.deepEqual(
    checkExtractedProvenanceFreshness({
      markdownFilePath: ws.doc,
      workspaceRoot: ws.root,
      ledgerPath: ws.ledger,
    }),
    { checked: 1, errors: 0, problems: [] },
  );
});
