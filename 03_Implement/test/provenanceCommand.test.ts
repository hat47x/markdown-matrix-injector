import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli/mmi.ts', import.meta.url));
const cwd = path.dirname(path.dirname(cli));

function run(args: readonly string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', cli, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      status: failure.status ?? 1,
    };
  }
}

test('mmi provenance emits the JSON report and human-readable form', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-provenance-cli-'));
  try {
    fs.writeFileSync(path.join(root, 'data.csv'), 'item,value\nA,1\n');
    fs.writeFileSync(path.join(root, 'doc.md'), '![[data.csv#Sheet1|A1:B2]]\n');
    const json = run([
      'provenance', path.join(root, 'doc.md'),
      '--root', root,
      '--ledger', 'mmi-ledger.json',
      '--json',
    ]);
    assert.equal(json.status, 0, json.stderr);
    const report = JSON.parse(json.stdout) as {
      schema: string;
      summary: { linked: number };
      linked: { source: string; status: string }[];
      review: { status: string };
    };
    assert.equal(report.schema, 'mmi.provenance-report/v1');
    assert.equal(report.summary.linked, 1);
    assert.deepEqual([report.linked[0].source, report.linked[0].status], ['data.csv', 'resolved']);
    assert.equal(report.review.status, 'not-configured');

    const text = run([
      'provenance', path.join(root, 'doc.md'),
      '--root', root,
      '--ledger', 'mmi-ledger.json',
    ]);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^# 出典報告: doc\.md/mu);
    assert.match(text.stdout, /## Linked参照/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('mmi schema exposes the provenance report contract', () => {
  const result = run(['schema', 'provenance-report']);
  assert.equal(result.status, 0, result.stderr);
  const schema = JSON.parse(result.stdout) as { $id: string; required: string[] };
  assert.equal(schema.$id, 'mmi.provenance-report/v1');
  assert.ok(schema.required.includes('extracted'));
});
