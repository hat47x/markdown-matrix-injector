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

test('mmi review-basis previews, records explicitly and feeds the provenance report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-basis-cli-'));
  try {
    const source = path.join(root, 'data.csv');
    const document = path.join(root, 'doc.md');
    const sidecar = path.join(root, 'mmi-review-basis.json');
    fs.writeFileSync(source, 'item,value\nA,1\nB,2\n');
    fs.writeFileSync(document, '![[data.csv#Sheet1|A1:B2]]\n');

    const preview = run([
      'review-basis', document, '--root', root, '--review-basis', 'mmi-review-basis.json', '--json',
    ]);
    assert.equal(preview.status, 0, preview.stderr);
    const previewResult = JSON.parse(preview.stdout) as { written: boolean; records: unknown[] };
    assert.equal(previewResult.written, false);
    assert.equal(previewResult.records.length, 1);
    assert.equal(fs.existsSync(sidecar), false);

    const written = run([
      'review-basis', document, '--root', root, '--review-basis', 'mmi-review-basis.json', '--write', '--json',
    ]);
    assert.equal(written.status, 0, written.stderr);
    assert.equal((JSON.parse(written.stdout) as { written: boolean }).written, true);
    assert.equal(fs.existsSync(sidecar), true);

    const report = run([
      'provenance', document, '--root', root, '--ledger', 'mmi-ledger.json',
      '--review-basis', 'mmi-review-basis.json', '--json',
    ]);
    assert.equal(report.status, 0, report.stderr);
    const parsed = JSON.parse(report.stdout) as {
      review: { status: string; references: { status: string }[] };
      summary: { reviewStale: number };
    };
    assert.equal(parsed.review.status, 'recorded');
    assert.equal(parsed.review.references[0].status, 'fresh');

    fs.writeFileSync(source, 'item,value\nA,9\nB,2\n');
    const stale = run([
      'provenance', document, '--root', root, '--ledger', 'mmi-ledger.json',
      '--review-basis', 'mmi-review-basis.json', '--json',
    ]);
    assert.equal(stale.status, 0, stale.stderr);
    const staleReport = JSON.parse(stale.stdout) as {
      review: { references: { status: string }[] };
      summary: { reviewStale: number };
    };
    assert.equal(staleReport.review.references[0].status, 'stale');
    assert.equal(staleReport.summary.reviewStale, 1);
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
