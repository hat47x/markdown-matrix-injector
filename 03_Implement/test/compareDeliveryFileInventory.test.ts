import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  observeDeliveryFiles,
} from '../src/application/deliveryFileObservation.js';
import {
  compareDeliveryFileInventory,
  DELIVERY_INVENTORY_COMPARISON_SCHEMA,
  type SourceInventoryProjectionV0,
} from '../src/application/compareDeliveryFileInventory.js';

function fixture(t: { after(callback: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-compare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  fs.mkdirSync(docs);
  fs.mkdirSync(excel);
  fs.writeFileSync(path.join(excel, 'a.xlsx'), 'source-a');
  fs.writeFileSync(path.join(excel, 'b.xlsx'), 'source-b');
  const markdownFilePath = path.join(docs, 'delivery.md');
  const observe = (markdownText: string) => observeDeliveryFiles({
    markdownText,
    markdownFilePath,
    workspaceRoot: root,
  });
  const inventory = (
    entries: SourceInventoryProjectionV0['entries'],
    status: SourceInventoryProjectionV0['status'] = 'complete',
    scope = 'excel',
  ): SourceInventoryProjectionV0 => ({
    contract: 'mmi.source-inventory/v0',
    scope,
    status,
    entries,
  });
  return { root, excel, observe, inventory };
}

test('matches the exact workbook paths and digests from two read-only observations', (t) => {
  const f = fixture(t);
  const delivery = f.observe('# Delivery\n## Design\n![[../excel/a.xlsx]]\n![[../excel/b.xlsx]]');
  const entries = delivery.references.map((item) => ({
    path: path.posix.basename(item.resolvedPath ?? ''),
    state: 'identified' as const,
    identity: { digest: item.digest ?? '' },
  }));
  const before = fs.readFileSync(path.join(f.excel, 'a.xlsx'));
  const report = compareDeliveryFileInventory(delivery, f.inventory(entries));
  assert.equal(report.schema, DELIVERY_INVENTORY_COMPARISON_SCHEMA);
  assert.equal(report.consistency, 'independent-observations');
  assert.equal(report.alignment, 'aligned');
  assert.equal(report.counts.matched, 2);
  assert.equal(report.counts['inventory-unreferenced'], 0);
  assert.deepEqual(report.findings.map((item) => [item.path, item.line]), [
    ['excel/a.xlsx', 3], ['excel/b.xlsx', 4],
  ]);
  assert.deepEqual(fs.readFileSync(path.join(f.excel, 'a.xlsx')), before);
});

test('reports missing declarations and physically present but unreferenced Excel separately', (t) => {
  const f = fixture(t);
  const delivery = f.observe('![[../excel/a.xlsx]]\n![[../excel/missing.xlsx]]');
  const report = compareDeliveryFileInventory(delivery, f.inventory([
    { path: 'a.xlsx', state: 'identified', identity: { digest: delivery.references[0].digest ?? '' } },
    { path: 'b.xlsx', state: 'identified', identity: { digest: 'sha256:deadbeef' } },
  ]));
  assert.equal(report.alignment, 'differences');
  assert.equal(report.counts['reference-missing'], 1);
  assert.equal(report.counts['inventory-unreferenced'], 1);
  assert.equal(report.counts.matched, 1);
  assert.deepEqual(report.findings.filter(x => x.relation === 'inventory-unreferenced').map(x => x.path), ['excel/b.xlsx']);
});

test('distinguishes inventory exclusions and digest drift from missing physical files', (t) => {
  const f = fixture(t);
  const delivery = f.observe('![[../excel/a.xlsx]]\n![[../excel/b.xlsx]]');
  const report = compareDeliveryFileInventory(delivery, f.inventory([
    { path: 'a.xlsx', state: 'identified', identity: { digest: 'sha256:different' } },
    { path: 'b.xlsx', state: 'excluded' },
  ], 'partial'));
  assert.equal(report.alignment, 'differences');
  assert.equal(report.counts['digest-mismatch'], 1);
  assert.equal(report.counts['inventory-unverifiable'], 1);
  assert.equal(report.counts['reference-missing'], 0);
});

test('respects narrower inventory scope without accusing out-of-scope files of being absent', (t) => {
  const f = fixture(t);
  const delivery = f.observe('![[../excel/a.xlsx]]\n![[../excel/b.xlsx]]');
  const report = compareDeliveryFileInventory(delivery, f.inventory([], 'complete', 'excel/subdirectory'));
  assert.equal(report.alignment, 'indeterminate');
  assert.equal(report.counts['reference-outside-inventory-scope'], 2);
  assert.equal(report.counts['reference-not-in-inventory'], 0);
});

test('a resolved declaration absent from inventory is distinct from a missing reference', (t) => {
  const f = fixture(t);
  const delivery = f.observe('![[../excel/a.xlsx]]');
  const report = compareDeliveryFileInventory(delivery, f.inventory([]));
  assert.equal(report.alignment, 'differences');
  assert.equal(report.counts['reference-not-in-inventory'], 1);
  assert.equal(report.counts['reference-missing'], 0);
});

test('partial inventory and empty declaration remain indeterminate, never a full delivery pass', (t) => {
  const f = fixture(t);
  const empty = f.observe('# Design\n![[../excel/a.xlsx#Sheet1|A1:B2]]');
  const emptyReport = compareDeliveryFileInventory(empty, f.inventory([]));
  assert.equal(emptyReport.alignment, 'indeterminate');
  const linked = f.observe('![[../excel/a.xlsx]]');
  const partial = compareDeliveryFileInventory(linked, f.inventory([
    { path: 'a.xlsx', state: 'identified', identity: { digest: linked.references[0].digest ?? '' } },
  ], 'partial'));
  assert.equal(partial.alignment, 'indeterminate');
  assert.equal(partial.counts.matched, 1);
});

test('rejects escaping paths and duplicate inventory entries rather than silently normalizing', (t) => {
  const f = fixture(t);
  const delivery = f.observe('![[../excel/a.xlsx]]');
  assert.throws(() => compareDeliveryFileInventory(delivery, f.inventory([], 'complete', '../escape')), /normalized relative path/u);
  assert.throws(() => compareDeliveryFileInventory(delivery, f.inventory([
    { path: 'a.xlsx', state: 'identified' },
    { path: 'a.xlsx', state: 'identified' },
  ])), /duplicate paths/u);
});
