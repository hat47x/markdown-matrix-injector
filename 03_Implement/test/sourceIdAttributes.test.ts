import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { matchSourceIds } from '../src/application/matchSourceIds.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

type Cell = XLSX.CellObject;
const s = (v: string, extra: Partial<Cell> = {}): Cell => ({ t: 's', v, ...extra });
const n = (v: number): Cell => ({ t: 'n', v });

function write(root: string, name: string, sheet: XLSX.WorkSheet): void {
  fs.writeFileSync(path.join(root, name), XLSX.write({ SheetNames: ['S'], Sheets: { S: sheet } }, { type: 'buffer', bookType: 'xlsx' }));
}
function selection(root: string, source: string, range: string, role: 'definition' | 'reference', attributes: Record<string, string>) {
  return { source, sheet: 'S', range, namespace: 'req', role, attributes,
    expectedSourceDigest: createSourceIdentityFromBytes(fs.readFileSync(path.join(root, source))).digest };
}
function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-attrs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // definitions: ID in A, type in B, digits in C
  write(root, 'def.xlsx', { '!ref': 'A2:C5',
    A2: s('REQ-1'), B2: s('文字列'), C2: n(10),
    A3: s('REQ-2'), B3: s('数値'), C3: n(8),
    A4: s('REQ-3'), B4: s('日付'), C4: s('SECRET-C4'),
    A5: s('REQ-4'), B5: s('文字列'), C5: n(5) });
  write(root, 'ref.xlsx', { '!ref': 'A2:C5',
    A2: s('REQ-1'), B2: s('文字列'), C2: s('10'),       // same digits but a string: different
    A3: s('REQ-2'), B3: s('数値'), C3: n(8),            // equal
    A4: s('REQ-3'), B4: s('日付'), C4: s('x', { f: '"x"' }), // formula: insufficient
    A5: s('REQ-9'), B5: s('文字列'), C5: n(5) });         // no definition
  return root;
}
const find = (report: ReturnType<typeof matchSourceIds>, id: string, attribute: string) =>
  report.attributes!.find((entry) => entry.id === id && entry.attribute === attribute)!;

test('values are compared with their types: number 10 and string "10" are different, with both sources kept', (t) => {
  const root = fixture(t);
  const report = matchSourceIds([
    selection(root, 'def.xlsx', 'A2:A5', 'definition', { 型: 'B', 桁数: 'C' }),
    selection(root, 'ref.xlsx', 'A2:A5', 'reference', { 型: 'B', 桁数: 'C' }),
  ], root);
  const digits = find(report, 'REQ-1', '桁数');
  assert.equal(digits.status, 'different');
  assert.deepEqual(digits.values.map((v) => [v.selection, v.address, v.type, v.value]), [[0, 'C2', 'n', 10], [1, 'C2', 's', '10']]);
  assert.equal(find(report, 'REQ-1', '型').status, 'equal');
  assert.equal(find(report, 'REQ-2', '桁数').status, 'equal');
  assert.equal(report.status, 'needs-review');
});

test('formula, merged and unrepresented attribute cells are insufficient, never equal, and carry the reason', (t) => {
  const root = fixture(t);
  const report = matchSourceIds([
    selection(root, 'def.xlsx', 'A2:A5', 'definition', { 桁数: 'C' }),
    selection(root, 'ref.xlsx', 'A2:A5', 'reference', { 桁数: 'C' }),
  ], root);
  const formula = find(report, 'REQ-3', '桁数');
  assert.equal(formula.status, 'insufficient');
  assert.deepEqual(formula.gaps.map((g) => [g.address, g.reason]), [['C4', 'not-literal-or-unobserved']]);
  assert.equal(formula.values.length, 1, 'the observable value is still reported');
  // an ID with a single occurrence cannot be compared either
  assert.equal(find(report, 'REQ-4', '桁数').status, 'insufficient');
});

test('only the selected attribute columns of ID rows are output; other columns and rows without an ID are not', (t) => {
  const root = fixture(t);
  // D holds text the caller did not select; row 6 has an attribute value but no ID.
  write(root, 'x.xlsx', { '!ref': 'A2:D6', A2: s('REQ-1'), B2: s('文字列'), D2: s('UNSELECTED-D2'),
    A3: s('REQ-2'), B3: n(7), D3: s('UNSELECTED-D3'), B6: s('ORPHAN-B6'), D6: s('UNSELECTED-D6') });
  const report = matchSourceIds([selection(root, 'x.xlsx', 'A2:A6', 'definition', { 型: 'B' })], root);
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /UNSELECTED/u, 'columns the caller did not name are never read into the output');
  assert.deepEqual(report.attributes!.map((entry) => entry.id).sort(), ['REQ-1', 'REQ-2']);
  assert.equal(report.gaps.length, 3, 'rows 4 to 6 have no literal ID (they are gaps), so nothing is output for them');
  assert.doesNotMatch(text, /ORPHAN-B6/u, 'the attribute of a row whose ID did not hold is not output');
});

test('empty string and an unrepresented cell are different observations', (t) => {
  const root = fixture(t);
  write(root, 'e.xlsx', { '!ref': 'A2:C3', A2: s('REQ-1'), B2: s(''), A3: s('REQ-2') });
  const report = matchSourceIds([selection(root, 'e.xlsx', 'A2:A3', 'definition', { 備考: 'B' })], root);
  const empty = find(report, 'REQ-1', '備考');
  assert.equal(empty.values[0].type, 's');
  assert.equal(empty.values[0].value, '');
  const absent = find(report, 'REQ-2', '備考');
  assert.deepEqual(absent.gaps.map((g) => g.reason), ['not-literal-or-unobserved']);
  assert.equal(absent.values.length, 0);
});

test('attribute cells count toward the 4096-cell cap and the overlap check; invalid shapes are rejected', (t) => {
  const root = fixture(t);
  assert.throws(() => matchSourceIds([selection(root, 'def.xlsx', 'A2:A2049', 'definition', { a: 'B', b: 'C', c: 'D' })], root), /max-cells/u);
  assert.throws(() => matchSourceIds([selection(root, 'def.xlsx', 'A2:A5', 'definition', { 型: 'A' })], root), /overlap/u, 'an attribute column equal to the ID column');
  assert.throws(() => matchSourceIds([selection(root, 'def.xlsx', 'A2:B5', 'definition', { 型: 'C' })], root), /single ID column/u);
  assert.throws(() => matchSourceIds([selection(root, 'def.xlsx', 'A2:A5', 'definition', {})], root), /attributes must map/u);
  assert.throws(() => matchSourceIds([selection(root, 'def.xlsx', 'A2:A5', 'definition', { 型: 'B2' })], root), /attributes must map/u);
});

test('selections without attributes keep the existing output shape', (t) => {
  const root = fixture(t);
  const plain = { source: 'def.xlsx', sheet: 'S', range: 'A2:A5', namespace: 'req', role: 'definition' as const,
    expectedSourceDigest: createSourceIdentityFromBytes(fs.readFileSync(path.join(root, 'def.xlsx'))).digest };
  const report = matchSourceIds([plain], root);
  assert.equal('attributes' in report, false);
  assert.equal(report.status, 'observed');
});
