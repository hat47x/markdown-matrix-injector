import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { spawnSync } from 'node:child_process';
import { observeSourceCells } from '../src/application/observeSourceCells.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';
import { inventoryDesignSources } from '../src/application/designSourceInventory.js';

function sourceBytes(): Buffer {
  const sheet: XLSX.WorkSheet = {
    '!ref': 'C5:H8', '!merges': [XLSX.utils.decode_range('C5:D5'), XLSX.utils.decode_range('E5:H5')],
    C5: { t: 's', v: '識別情報' }, E5: { t: 's', v: '処理情報' },
    C6: { t: 's', v: 'コード' }, D6: { t: 's', v: '表示名' }, E6: { t: 's', v: '保存値' }, F6: { t: 's', v: '空文字' }, G6: { t: 's', v: '未計算' }, H6: { t: 's', v: '日付' },
    C7: { t: 's', v: '001' }, D7: { t: 's', v: '秘密の本文' },
    E7: { t: 'n', v: 2, f: '1+1', z: '0.00' },
    F7: { t: 's', v: '', f: 'IF(TRUE,"","x")' },
    G7: { t: 'n', f: '1+2' }, H7: { t: 'd', v: new Date('2026-01-02T00:00:00Z'), z: 'yyyy-mm-dd' },
    C8: { t: 'z', s: { numFmt: '0' } },
  };
  return XLSX.write({ SheetNames: ['項目'], Sheets: { 項目: sheet } }, { type: 'buffer', bookType: 'xlsx' });
}
const observe = (extra: Partial<Parameters<typeof observeSourceCells>[0]> = {}) => observeSourceCells({ source: '設計.xlsx', bytes: sourceBytes(), sheet: '項目', range: 'C5:H8', ...extra });

test('default observations preserve offset coordinates and merge evidence without values', () => {
  const result = observe();
  assert.equal(result.range, 'C5:H8'); assert.equal(result.usedRange, 'C5:H8'); assert.equal(result.cells.length, 24);
  assert.equal(result.cells[0].address, 'C5'); assert.equal(result.cells[0].mergeRole, 'anchor');
  assert.equal(result.cells.find((c) => c.address === 'D5')?.mergeRole, 'covered');
  assert.equal(result.cells.find((c) => c.address === 'D5')?.payload, undefined);
  assert.doesNotMatch(JSON.stringify(result), /秘密の本文|識別情報|1\+1|IF\(TRUE/);
  assert.equal(result.valuesIncluded, false);
  assert.ok(result.cells.every((cell) => cell.payload === undefined));
});
test('explicit values distinguish raw value, display value, text codes and saved formulas', () => {
  const result = observe({ includeValues: true });
  const cell = (a: string) => result.cells.find((c) => c.address === a)!;
  assert.equal(cell('C7').type, 's'); assert.equal(cell('C7').payload?.value, '001');
  assert.equal(cell('E7').payload?.value, 2); assert.equal(cell('E7').payload?.text, '2.00');
  assert.equal(cell('E7').payload?.formula, '1+1'); assert.equal(cell('E7').valueOrigin, 'saved-formula-cache');
  assert.equal(cell('F7').payload?.value, ''); assert.equal(cell('F7').valueOrigin, 'saved-formula-cache');
  assert.equal(cell('H7').type, 'd'); assert.match(JSON.stringify(cell('H7')), /2026-01-02/);
});
test('missing and style-only cells are not promoted to business empty/null semantics', () => {
  const result = observe({ includeValues: true });
  for (const address of ['C8', 'D8']) {
    const cell = result.cells.find((c) => c.address === address)!;
    assert.equal(cell.presence, 'not-represented'); assert.equal(cell.valueOrigin, 'unobserved'); assert.equal(cell.payload, undefined);
  }
  assert.ok(result.limitations.includes('absent-and-style-only-cells-are-not-distinguished'));
  const missingCache = result.cells.find((c) => c.address === 'G7')!;
  // If the existing loader retains the formula, it must not fabricate its result.
  if (missingCache.presence === 'represented') {
    assert.equal(missingCache.valueOrigin, 'formula-cache-unavailable'); assert.equal(missingCache.payload?.value, null);
  } else assert.equal(missingCache.valueOrigin, 'unobserved');
});
test('a merge anchor outside selection is identified but never read into selected cells', () => {
  const result = observe({ range: 'D5:D6', includeValues: true });
  assert.equal(result.cells.length, 2); assert.equal(result.merges[0].anchor, 'C5');
  assert.equal(result.merges[0].anchorOutsideSelection, true);
  assert.doesNotMatch(JSON.stringify(result), /識別情報/);
});
test('multirow header selection is a caller annotation, not inferred or accepted meaning', () => {
  const result = observe({ headerRange: 'c5:h6' });
  assert.deepEqual(result.headerSelection, { range: 'C5:H6', basis: 'caller-specified' });
  assert.throws(() => observe({ headerRange: 'A1:B2' }), /inside/);
});
test('geometry and maximum output are checked before parsing any workbook', () => {
  for (const range of ['A0', 'A1:B2:C3', 'A2:A1', 'B1:A1', 'XFE1', 'A1048577', 'A90071992547409930']) assert.throws(() => observe({ range }), /range/);
  assert.throws(() => observe({ bytes: Buffer.from('not a workbook'), range: 'A1:XFD1048576' }), /max-cells/);
  for (const maxCells of [0, NaN, 4097]) assert.throws(() => observe({ maxCells }), /max-cells/);
  assert.throws(() => observe({ range: 'C5:D5', maxCells: 1 }), /max-cells/);
  assert.throws(() => observe({ sheet: 'toString' }), /sheet/);
});
test('identity is bound to exactly the parsed bytes, and an inventory mismatch is rejected', () => {
  const bytes = sourceBytes(); const digest = createSourceIdentityFromBytes(bytes).digest;
  const result = observe({ bytes, expectedSourceDigest: digest });
  assert.equal(result.sourceIdentity.digest, digest);
  assert.throws(() => observe({ bytes, expectedSourceDigest: `sha256:${'0'.repeat(64)}` }), /mismatch/);
  assert.throws(() => observe({ expectedSourceDigest: 'not-a-source-digest' }), /SHA-256/);
});
test('CSV explicit empty fields remain literal strings, without inferring business meaning', () => {
  const result = observe({ source: 'data.csv', bytes: Buffer.from('Code,Name\n001,""\n'), sheet: 'Sheet1', range: 'A1:B2', includeValues: true });
  assert.equal(result.cells[2].payload?.value, '001');
  assert.equal(result.cells[3].payload?.value, ''); assert.equal(result.cells[3].valueOrigin, 'literal');
  assert.deepEqual(result.merges, []);
});
function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cells-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, '設計.xlsx'); fs.writeFileSync(source, sourceBytes()); return { root, source };
}
const cli = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/bootstrap.ts', ...args], { encoding: 'utf8' });
test('CLI observes the inventoried source and refuses stale input while preserving source bytes', (t) => {
  const { root, source } = fixture(t); const before = fs.readFileSync(source);
  const inventory = inventoryDesignSources({ workspaceRoot: root, directory: root });
  const args = ['inspect', source, '--root', root, '--cells', '--sheet', '項目', '--range', 'C5:H8', '--json'];
  const result = cli([...args, '--expected-source-digest', inventory.entries[0].identity!.digest]);
  assert.equal(result.status, 0, result.stderr); assert.doesNotMatch(result.stdout, /秘密の本文/);
  assert.equal(JSON.parse(result.stdout).sourceIdentity.digest, inventory.entries[0].identity!.digest);
  const stale = cli([...args, '--expected-source-digest', `sha256:${'0'.repeat(64)}`]);
  assert.equal(stale.status, 2); assert.equal(stale.stdout, ''); assert.match(stale.stderr, /mismatch/);
  assert.deepEqual(fs.readFileSync(source), before);
});
test('CLI rejects out-of-root sources, symlink bypasses and output overwrite', (t) => {
  const { root, source } = fixture(t); const child = path.join(root, 'inner'); fs.mkdirSync(child);
  const args = ['inspect', source, '--cells', '--sheet', '項目', '--range', 'C5:D5', '--json'];
  assert.equal(cli([...args, '--root', child]).status, 2);
  assert.equal(cli([...args, '--root', root, '-o', source]).status, 2);
  try { fs.symlinkSync(source, path.join(child, 'alias.xlsx')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EPERM') { t.skip('symlink privilege unavailable'); return; } throw e; }
  const viaLink = cli(['inspect', path.join(child, 'alias.xlsx'), '--root', child, '--cells', '--sheet', '項目', '--range', 'C5:D5', '--json']);
  assert.equal(viaLink.status, 2);
});

test('bounded reader refuses named pipes without blocking the CLI', (t) => {
  if (process.platform === 'win32') { t.skip('POSIX named-pipe fixture'); return; }
  const { root } = fixture(t); const pipe = path.join(root, 'pipe.xlsx');
  const mkfifo = spawnSync('mkfifo', [pipe]);
  if (mkfifo.error) { t.skip('mkfifo is unavailable'); return; }
  assert.equal(mkfifo.status, 0);
  const script = "import {readBoundedSourceBytes} from './dist/src/core/readBoundedSourceBytes.js'; try { readBoundedSourceBytes(process.argv[1], 100); process.exit(1); } catch(e) { if(e.message !== 'not-regular-file') throw e; }";
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, pipe], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
});
