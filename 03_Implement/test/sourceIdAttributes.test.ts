import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';
import { matchSourceIds } from '../src/application/matchSourceIds.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-id-attributes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const selections = ['definition', 'reference'].map((role, index) => {
    const sheet: XLSX.WorkSheet = { '!ref': 'C5:F8',
      C5: { t: 's', v: 'ITEM-001' }, D5: { t: 's', v: 'TEXT' }, E5: index ? { t: 's', v: '10' } : { t: 'n', v: 10 },
      C6: { t: 's', v: 'ITEM-002' }, D6: index ? { t: 's', v: 'TEXT', f: '"TEXT"' } : { t: 's', v: 'TEXT' }, E6: { t: 'n', v: 20 },
      C7: { t: 's', v: 'ITEM-003' }, D7: { t: 's', v: '' }, E7: { t: 'b', v: false },
      F5: { t: 's', v: 'UNSELECTED-SECRET' }, D8: { t: 's', v: 'INVALID-ID-ROW-SECRET' } };
    const bytes = XLSX.write({ SheetNames: ['項目'], Sheets: { 項目: sheet } }, { type: 'buffer', bookType: 'xlsx' });
    const source = `${role}.xlsx`; fs.writeFileSync(path.join(root, source), bytes);
    return { source, sheet: '項目', range: 'C5:C8', role, namespace: '申請項目',
      expectedSourceDigest: createSourceIdentityFromBytes(bytes).digest, attributes: { type: 'D', length: 'E' } };
  });
  return { root, selections };
}
test('attribute comparisons retain typed variants, exact locators and missing evidence without leaking other cells', (t) => {
  const { root, selections } = fixture(t);
  const before = selections.map((s) => fs.readFileSync(path.join(root, s.source)));
  const result = matchSourceIds(selections, root);
  const comparisons = (id: string) => result.matches.find((m) => m.id === id)!.attributeComparisons!;
  assert.equal(comparisons('ITEM-001')[0].status, 'equal-values');
  const length = comparisons('ITEM-001')[1]; assert.equal(length.status, 'different-values');
  assert.deepEqual(length.variants.map((v) => [v.type, v.value]), [['n', 10], ['s', '10']]);
  const occurrence = result.occurrences[length.variants[1].occurrences[0]];
  assert.equal(occurrence.attributes![1].address, 'E5');
  assert.equal(result.selections[occurrence.selection].source, 'reference.xlsx');
  assert.equal(comparisons('ITEM-002')[0].status, 'insufficient-observations');
  assert.deepEqual(comparisons('ITEM-002')[0].unavailable, [{ occurrence: 4, reason: 'not-literal-or-unobserved' }]);
  assert.equal(comparisons('ITEM-003')[0].status, 'equal-values');
  assert.equal(comparisons('ITEM-003')[0].variants[0].value, '');
  assert.equal(comparisons('ITEM-003')[1].variants[0].value, false);
  assert.equal(result.status, 'needs-review'); assert.equal(result.gaps.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|\"formula\"/);
  assert.equal(result.selections[0].range, 'C5:C8'); assert.equal(result.selections[0].observationRange, 'C5:E8');
  selections.forEach((s, i) => assert.deepEqual(fs.readFileSync(path.join(root, s.source)), before[i]));
});
test('unselected attributes are explicit gaps, not proof that one observed value is consistent', (t) => {
  const { root, selections } = fixture(t); const { attributes, ...reference } = selections[1];
  const result = matchSourceIds([selections[0], reference], root);
  assert.ok(result.matches.every((m) => m.attributeComparisons!.every((a) => a.status === 'insufficient-observations' && a.incomplete)));
  assert.equal(result.matches[0].attributeComparisons![0].unavailable[0].reason, 'not-selected');
});
test('attribute selection rejects invalid columns, ID overlap, multi-column IDs and envelope overflow', (t) => {
  const { root, selections } = fixture(t); const selection = selections[0];
  for (const attributes of [{}, { x: 'XFE' }, { x: 'D5' }, { x: 'C' }, { x: 'D', y: 'D' }, { ' ': 'D' }, []]) {
    assert.throws(() => matchSourceIds([{ ...selection, attributes }], root), /attributes/);
  }
  assert.throws(() => matchSourceIds([{ ...selection, range: 'C5:D8' }], root), /single ID column/);
  assert.throws(() => matchSourceIds([{ ...selection, attributes: { remote: 'XFD' } }], root), /max-cells/);
  assert.throws(() => matchSourceIds([selection, { ...selection, range: 'E5:E8', attributes: { other: 'F' } }], root), /overlap/);
});
test('compiled CLI reports attribute differences with review exit code, requiring explicit value disclosure', (t) => {
  const { root, selections } = fixture(t); const manifest = path.join(root, 'selections.json');
  fs.writeFileSync(manifest, JSON.stringify(selections));
  const args = ['dist/src/cli/bootstrap.js', 'match-ids', manifest, '--root', root, '--json'];
  const hidden = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(hidden.status, 2); assert.equal(hidden.stdout, '');
  const result = spawnSync(process.execPath, [...args, '--include-values'], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).matches[0].attributeComparisons[1].status, 'different-values');
});
