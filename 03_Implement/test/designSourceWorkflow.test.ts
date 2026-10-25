import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';
import { compareAttributes, type AttributeSelectionInput } from '../src/application/sourceIdAttributes.js';

test('compiled CLI carries inventory identities through cells and three-source comparison, without accepting missing attribute selections', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-design-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'sources'); fs.mkdirSync(directory);
  const names = ['data.xlsx', 'function.xlsx', 'business.xlsx'];
  const before = names.map((name) => {
    const sheet: XLSX.WorkSheet = { '!ref': 'C5:F5', C5: { t: 's', v: 'ITEM-001' },
      D5: { t: 's', v: 'STRING' }, E5: { t: 'n', v: 10 }, F5: { t: 's', v: 'UNSELECTED-PRIVATE-TEXT' } };
    const bytes = XLSX.write({ SheetNames: ['項目'], Sheets: { 項目: sheet } }, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(path.join(directory, name), bytes); return bytes;
  });
  const cli = (args: string[]) => spawnSync(process.execPath, ['dist/src/cli/bootstrap.js', ...args, '--root', root, '--json'], { encoding: 'utf8', timeout: 30000 });
  const inventory = cli(['inventory', directory]); assert.equal(inventory.status, 0, inventory.stderr);
  const manifest = JSON.parse(inventory.stdout);
  assert.equal(manifest.entries.length, 3); assert.doesNotMatch(inventory.stdout, /UNSELECTED-PRIVATE-TEXT/);
  const selections = names.map((name, index) => ({ source: `sources/${name}`, sheet: '項目', range: 'C5:C5',
    namespace: '申請項目', role: index ? 'reference' : 'definition',
    expectedSourceDigest: manifest.entries.find((entry: { path: string }) => entry.path === name).identity.digest,
    attributes: { 型: 'D', 桁数: 'E' } }));
  const cells = cli(['inspect', path.join(directory, names[0]), '--cells', '--sheet', '項目', '--range', 'C5:E5', '--expected-source-digest', selections[0].expectedSourceDigest]);
  assert.equal(cells.status, 0, cells.stderr); assert.equal(JSON.parse(cells.stdout).valuesIncluded, false);
  assert.doesNotMatch(cells.stdout, /ITEM-001|STRING|UNSELECTED-PRIVATE-TEXT/);
  const selectionPath = path.join(root, 'selection.json');
  fs.writeFileSync(selectionPath, JSON.stringify(selections));
  const matched = cli(['match-ids', selectionPath, '--include-values']); assert.equal(matched.status, 0, matched.stderr);
  const result = JSON.parse(matched.stdout); assert.equal(result.occurrences.length, 3);
  assert.ok(result.attributes.every((a: { status: string; values: unknown[] }) => a.status === 'equal' && a.values.length === 3));
  assert.equal(result.selections[0].sourceIdentity.digest, selections[0].expectedSourceDigest);
  assert.doesNotMatch(matched.stdout, /UNSELECTED-PRIVATE-TEXT/);
  // Omitting the third source's column mapping must not turn two observations into full agreement.
  const partial = selections.map((selection, index) => {
    if (index !== 2) return selection;
    const { attributes, ...withoutAttributes } = selection; return withoutAttributes;
  });
  fs.writeFileSync(selectionPath, JSON.stringify(partial));
  const incomplete = cli(['match-ids', selectionPath, '--include-values']);
  assert.equal(incomplete.status, 1, incomplete.stdout);
  const review = JSON.parse(incomplete.stdout); assert.equal(review.status, 'needs-review');
  assert.ok(review.attributes.every((a: { status: string; gaps: { selection: number; address: string; reason: string }[] }) =>
    a.status === 'insufficient' && a.gaps.some((gap) => gap.selection === 2 && gap.address === 'C5' && gap.reason === 'attribute-not-selected')));
  names.forEach((name, i) => assert.deepEqual(fs.readFileSync(path.join(directory, name)), before[i]));
  // A changed source requires a fresh inventory and must never emit a partially matched report.
  fs.appendFileSync(path.join(directory, names[1]), Buffer.from('changed'));
  const output = path.join(root, 'stale-result.json');
  const stale = cli(['match-ids', selectionPath, '--include-values', '-o', output]);
  assert.equal(stale.status, 2); assert.equal(stale.stdout, ''); assert.match(stale.stderr, /digest mismatch/);
  assert.equal(fs.existsSync(output), false);
});

test('coverage is scoped to each matched ID and namespace; absent observations also retain the expected locator', () => {
  const selections: AttributeSelectionInput[] = [{ attributes: { 型: 'D' } }, {}, { attributes: { 条件: 'E' } }];
  const occurrences = [0, 1, 2].map((selection) => ({ selection, address: 'C5', id: 'ID', row: 5 }));
  const groups = [{ namespace: 'data', id: 'ID', definitions: [0], references: [1] },
    { namespace: 'business', id: 'ID', definitions: [2], references: [] }];
  const result = compareAttributes(selections, occurrences, [], groups);
  assert.deepEqual(result.map((entry) => [entry.namespace, entry.attribute]), [['data', '型'], ['business', '条件']]);
  assert.deepEqual(result[0].gaps.map((gap) => [gap.address, gap.reason]), [['D5', 'not-observed'], ['C5', 'attribute-not-selected']]);
  assert.ok(result.every((entry) => entry.status === 'insufficient'));
});
