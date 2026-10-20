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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ids-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (source: string, ids: string[]) => {
    const sheet = XLSX.utils.aoa_to_sheet([['ID', 'Private'], ...ids.map((id) => [id, 'SECRET'])]);
    fs.writeFileSync(path.join(root, source), XLSX.write({ SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } }, { type: 'buffer', bookType: 'xlsx' }));
  };
  put('definitions.xlsx', ['001', 'REQ-A', 'DUP', 'DUP']);
  put('references.xlsx', ['001', 'DUP', 'MISSING', 'req-a', ' 001']);
  const selection = (source: string, range: string, role: 'definition' | 'reference', namespace = 'requirements') => ({
    source, range, role, namespace, sheet: 'Sheet1',
    expectedSourceDigest: createSourceIdentityFromBytes(fs.readFileSync(path.join(root, source))).digest,
  });
  const selections = [selection('definitions.xlsx', 'A2:A5', 'definition'), selection('references.xlsx', 'A2:A6', 'reference')];
  return { root, put, selection, selections };
}
test('matches exact tokens with all source locations; preserves duplicate and missing definitions', (t) => {
  const { root, selections } = fixture(t);
  const before = fs.readFileSync(path.join(root, 'definitions.xlsx'));
  const result = matchSourceIds(selections, root);
  const match = (id: string) => result.matches.find((m) => m.id === id)!;
  assert.equal(match('001').status, 'unique-token-match');
  assert.equal(match('DUP').status, 'ambiguous'); assert.equal(match('DUP').definitions.length, 2);
  assert.equal(match('REQ-A').status, 'definition-only');
  for (const id of ['MISSING', 'req-a', ' 001']) assert.equal(match(id).status, 'missing-definition');
  const ref = result.occurrences[match('001').references[0]];
  assert.equal(ref.address, 'A2'); assert.equal(result.selections[ref.selection].source, 'references.xlsx');
  assert.equal(result.selections[0].sourceIdentity.digest, selections[0].expectedSourceDigest);
  assert.equal(result.status, 'needs-review'); assert.deepEqual(result.gaps, []);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'definitions.xlsx')), before);
});
test('caller namespaces isolate equal tokens and overlapping selections fail instead of inflating duplicates', (t) => {
  const { root, selection } = fixture(t);
  const a = selection('definitions.xlsx', 'A2', 'definition');
  const b = selection('references.xlsx', 'A2', 'reference', 'other');
  assert.deepEqual(matchSourceIds([a, b], root).matches.map((m) => m.status), ['definition-only', 'missing-definition']);
  assert.throws(() => matchSourceIds([a, { ...a, role: 'reference' }], root), /overlap/);
});
test('literal string IDs only; merged, numeric, formula, blank and unrepresented cells remain gaps', (t) => {
  const { root, selection } = fixture(t);
  const sheet: XLSX.WorkSheet = { '!ref': 'C5:D11', '!merges': [XLSX.utils.decode_range('C5:D5')],
    C5: { t: 's', v: 'MERGED' }, C6: { t: 'n', v: 1, z: '000' }, C7: { t: 's', v: 'REQ-A', f: '"REQ-A"' },
    C8: { t: 's', v: '001' }, C9: { t: 's', v: '' }, C10: { t: 's', v: '   ' } };
  fs.writeFileSync(path.join(root, 'types.xlsx'), XLSX.write({ SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } }, { type: 'buffer', bookType: 'xlsx' }));
  const result = matchSourceIds([selection('types.xlsx', 'C5:C11', 'definition')], root);
  assert.deepEqual(result.matches.map((m) => m.id), ['001']);
  assert.equal(result.gaps.length, 6); assert.equal(result.gaps[0].reason, 'merged-cell');
  assert.equal(result.gaps[1].reason, 'not-string'); assert.equal(result.gaps[2].reason, 'not-literal-or-unobserved');
  assert.equal(result.gaps[5].address, 'C11'); assert.equal(result.status, 'needs-review');
  assert.doesNotMatch(JSON.stringify(result), /MERGED|REQ-A/);
});
test('rejects stale sources, invalid manifest fields, root escapes and aggregate cell overflow', (t) => {
  const { root, selections, put, selection } = fixture(t);
  for (const invalid of [[], Array(17).fill(selections[0]), [{ ...selections[0], extra: true }],
    [{ ...selections[0], source: 'trimmed.csv' }], [{ ...selections[0], role: 'guessed' }], [{ ...selections[0], source: '../escape.csv' }],
    [{ ...selections[0], expectedSourceDigest: 'bad' }]]) assert.throws(() => matchSourceIds(invalid, root));
  assert.throws(() => matchSourceIds([selection('definitions.xlsx', 'A1:A4096', 'definition'), selections[1]], root), /max-cells/);
  put('definitions.xlsx', ['Changed']); assert.throws(() => matchSourceIds(selections, root), /mismatch/);
});
const cli = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/bootstrap.ts', ...args], { encoding: 'utf8' });
test('CLI requires disclosure, reports review status and refuses overwriting or ignored options', (t) => {
  const { root, selections, selection } = fixture(t); const manifest = path.join(root, 'selection.json');
  fs.writeFileSync(manifest, JSON.stringify(selections));
  const args = ['match-ids', manifest, '--root', root, '--json'];
  const hidden = cli(args); assert.equal(hidden.status, 2); assert.equal(hidden.stdout, '');
  const result = cli([...args, '--include-values']); assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).matches.length, 6); assert.doesNotMatch(result.stdout, /SECRET/);
  assert.equal(cli([...args, '--include-values', '-o', manifest]).status, 2);
  assert.equal(cli([...args, '--include-values', '--expected-fingerprint', 'ignored']).status, 2);
  fs.writeFileSync(manifest, JSON.stringify([selection('definitions.xlsx', 'A2', 'definition'), selection('references.xlsx', 'A2', 'reference')]));
  const ok = cli([...args, '--include-values']); assert.equal(ok.status, 0, ok.stderr);
  const output = path.join(root, 'report.json'); assert.equal(cli([...args, '--include-values', '-o', output]).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).status, 'observed');
});
test('CLI rejects manifests outside root, oversized manifests and linked sources outside root', (t) => {
  const { root, selections } = fixture(t); const inner = path.join(root, 'inner'); fs.mkdirSync(inner);
  const manifest = path.join(root, 'selection.json'); fs.writeFileSync(manifest, JSON.stringify(selections));
  const args = ['match-ids', manifest, '--root', inner, '--json', '--include-values'];
  assert.equal(cli(args).status, 2);
  const inside = path.join(inner, 'selection.json'); fs.writeFileSync(inside, ' '.repeat(65537));
  assert.equal(cli(['match-ids', inside, '--root', inner, '--json', '--include-values']).status, 2);
  const link = path.join(inner, 'linked.xlsx');
  try { fs.symlinkSync(path.join(root, selections[0].source), link); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('symlink privilege unavailable'); return; } throw error; }
  fs.writeFileSync(inside, JSON.stringify([{ ...selections[0], source: 'linked.xlsx' }]));
  const result = cli(['match-ids', inside, '--root', inner, '--json', '--include-values']);
  assert.equal(result.status, 2); assert.equal(result.stdout, '');
});
