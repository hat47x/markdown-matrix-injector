import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inventoryDesignSources } from '../src/application/designSourceInventory.js';
function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'sources'); fs.mkdirSync(directory);
  const csv = path.join(directory, '項目.csv');
  fs.writeFileSync(csv, 'ID,項目\nF01,秘密の本文\n');
  return { root, directory, csv };
}
const cli = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/bootstrap.ts', ...args], { encoding: 'utf8' });
test('stable collection identities preserve duplicate locations and omit contents', (t) => {
  const { root, directory, csv } = fixture(t); fs.copyFileSync(csv, path.join(directory, 'copy.csv'));
  const run = () => inventoryDesignSources({ workspaceRoot: root, directory });
  const first = run(); assert.deepEqual(first, run()); assert.equal(first.status, 'complete');
  assert.equal(first.inspectionRequested, false); assert.equal(first.consistency, 'per-file-observation');
  assert.equal(first.entries.length, 2); assert.equal(first.entries[0].identity?.digest, first.entries[1].identity?.digest);
  assert.doesNotMatch(JSON.stringify(first), /秘密の本文/);
  const bytes = fs.readFileSync(csv); fs.writeFileSync(csv, 'changed'); assert.notEqual(run().collectionDigest, first.collectionDigest);
  fs.writeFileSync(csv, bytes); assert.equal(run().collectionDigest, first.collectionDigest);
});
test('configured exclusions, size limits and unsupported parsing are explicit gaps', (t) => {
  const { root, directory } = fixture(t); fs.mkdirSync(path.join(directory, 'node_modules'));
  fs.writeFileSync(path.join(directory, 'node_modules/secret.csv'), 'not read');
  fs.writeFileSync(path.join(directory, 'large.csv'), 'x'.repeat(501));
  fs.writeFileSync(path.join(directory, 'drawing.pdf'), 'opaque'); fs.writeFileSync(path.join(directory, 'skip.csv'), 'skip');
  let calls = 0;
  const report = inventoryDesignSources({ workspaceRoot: root, directory, maxBytes: 500, exclude: ['skip.csv'], inspect: () => { calls++; return { candidateCounts: {}, diagnosticCodes: [] }; } });
  assert.equal(report.status, 'partial'); assert.equal(calls, 1); assert.equal(report.summary.excluded, 3);
  assert.equal(report.summary.unsupported, 1); assert.equal(report.summary.inspected, 1);
  assert.equal(report.entries.find((e) => e.path === 'large.csv')?.identity, undefined);
  assert.ok(report.entries.find((e) => e.path === 'drawing.pdf')?.identity);
  assert.ok(!report.entries.some((e) => e.path.includes('secret.csv')));
});
test('symlinks including intermediate scope components are not followed', (t) => {
  const { root, directory } = fixture(t); const target = path.join(root, 'other.csv'); fs.writeFileSync(target, 'outside');
  try { fs.symlinkSync(target, path.join(directory, 'alias.csv')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EPERM') { t.skip('symlink privilege unavailable'); return; } throw e; }
  assert.equal(inventoryDesignSources({ workspaceRoot: root, directory }).entries.find((e) => e.path === 'alias.csv')?.reason, 'symlink');
  fs.mkdirSync(path.join(directory, 'inner')); fs.symlinkSync(directory, path.join(root, 'alias'), 'junction');
  assert.throws(() => inventoryDesignSources({ workspaceRoot: root, directory: path.join(root, 'alias/inner') }), /symlink/);
});
test('outside roots, invalid limits and escaping exclusions are rejected', (t) => {
  const { root, directory } = fixture(t); assert.throws(() => inventoryDesignSources({ workspaceRoot: directory, directory: root }), /outside/);
  for (const maxBytes of [0, -1, 0.5, NaN, 268435457]) assert.throws(() => inventoryDesignSources({ workspaceRoot: root, directory, maxBytes }), /max-bytes/);
  assert.throws(() => inventoryDesignSources({ workspaceRoot: root, directory, exclude: ['../escape'] }), /exclude/);
});
test('parser failures retain identity without leaking exception contents', (t) => {
  const { root, directory } = fixture(t); fs.writeFileSync(path.join(directory, 'bad.json'), '{broken');
  const report = inventoryDesignSources({ workspaceRoot: root, directory, inspect: (file) => { if (file.endsWith('.json')) throw new Error('raw source secret'); return { candidateCounts: {}, diagnosticCodes: [] }; } });
  assert.equal(report.status, 'partial'); assert.equal(report.summary.failed, 1); assert.equal(report.summary.inspected, 1);
  assert.ok(report.entries.find((e) => e.path === 'bad.json')?.identity); assert.doesNotMatch(JSON.stringify(report), /raw source secret/);
});
test('changes during parsing discard current inspection claims', (t) => {
  const { root, directory, csv } = fixture(t);
  const report = inventoryDesignSources({ workspaceRoot: root, directory, inspect: () => { fs.appendFileSync(csv, 'changed'); return { candidateCounts: { table: 99 }, diagnosticCodes: [] }; } });
  assert.equal(report.status, 'partial'); assert.equal(report.entries[0].state, 'changed'); assert.equal(report.entries[0].inspection, undefined);
});
test('diagnostics prevent complete coverage claims', (t) => {
  const { root, directory } = fixture(t);
  const report = inventoryDesignSources({ workspaceRoot: root, directory, inspect: () => ({ candidateCounts: {}, diagnosticCodes: ['UNSUPPORTED'] }) });
  assert.equal(report.status, 'partial'); assert.deepEqual(report.entries[0].inspection?.diagnosticCodes, ['UNSUPPORTED']);
});
test('real CLI inspection preserves bytes and does not emit Claim values', (t) => {
  const { root, directory, csv } = fixture(t); const before = fs.readFileSync(csv);
  const result = cli(['inventory', directory, '--root', root, '--inspect', '--json']); assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.summary.inspected, 1);
  assert.ok(report.entries[0].inspection.candidateCounts['table-range'] >= 1);
  assert.doesNotMatch(result.stdout, /秘密の本文/); assert.deepEqual(fs.readFileSync(csv), before);
});
test('CLI returns partial JSON for malformed and unsupported sources', (t) => {
  const { root, directory } = fixture(t); fs.writeFileSync(path.join(directory, 'bad.json'), '{broken'); fs.writeFileSync(path.join(directory, 'drawing.pdf'), 'opaque');
  const result = cli(['inventory', directory, '--root', root, '--inspect', '--json']); assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.summary.failed, 1); assert.equal(report.summary.unsupported, 1); assert.equal(report.summary.inspected, 1);
});
test('CLI refuses input-tree output and never overwrites an existing output', (t) => {
  const { root, directory, csv } = fixture(t); const before = fs.readFileSync(csv);
  assert.equal(cli(['inventory', directory, '--root', root, '-o', csv]).status, 2);
  const inside = path.join(directory, 'report.json'); assert.equal(cli(['inventory', directory, '--root', root, '-o', inside]).status, 2); assert.equal(fs.existsSync(inside), false);
  const output = path.join(root, 'report.json'); assert.equal(cli(['inventory', directory, '--root', root, '--json', '-o', output]).status, 0);
  assert.equal(cli(['inventory', directory, '--root', root, '--json', '-o', output]).status, 2); assert.deepEqual(fs.readFileSync(csv), before);
});
