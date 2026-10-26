import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { commitHtmlDecomposition } from '../src/application/commitHtmlDecomposition.js';
import { extractHtmlFragment } from '../src/application/extractHtmlFragment.js';
import { main } from '../src/cli/mmi.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const originalHtml = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url), 'utf8',
);
const digest = createSourceIdentityFromBytes(Buffer.from(originalHtml, 'utf8')).digest;

async function inWorkspace(
  action: (context: {
    root: string;
    source: string;
    plan: string;
    ledger: string;
    selections: { id: string; output: string; expectedFingerprint: string }[];
  }) => Promise<void>,
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-audit-cli-'));
  const source = path.join(root, 'source.html');
  const plan = path.join(root, 'reviewed.json');
  const ledger = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(source, originalHtml);
  const parsed = readHtmlFragments(originalHtml, 'source.html', digest);
  const selections = ['overview', 'api'].map((id) => ({
    id,
    output: `docs/${id}.html`,
    expectedFingerprint: selectHtmlFragmentById(parsed, id).candidate.fingerprint.digest,
  }));
  fs.writeFileSync(plan, JSON.stringify({ sourceDigest: digest, fragments: selections }));
  try {
    await action({ root, source, plan, ledger, selections });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function invoke(args: string[]): Promise<{ code: number; output: string }> {
  let output = '';
  const oldWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  let code: number;
  try {
    code = await main(args);
  } finally {
    process.stdout.write = oldWrite;
  }
  return { code, output };
}

test('read-only CLI html-audit reports complete reviewed outputs and preserves bytes', async () => {
  await inWorkspace(async ({ root, source, plan, ledger, selections }) => {
    commitHtmlDecomposition({
      workspaceRoot: root, sourcePath: source, ledgerPath: ledger,
      selections, expectedSourceDigest: digest,
    });
    const before = [source, plan, ledger,
      path.join(root, 'docs/overview.html'), path.join(root, 'docs/api.html')]
      .map((file) => fs.readFileSync(file));
    const result = await invoke([
      'html-audit', source, '--plan', plan, '--root', root, '--json',
    ]);
    assert.equal(result.code, 0);
    const report = JSON.parse(result.output);
    assert.equal(report.status, 'complete');
    assert.equal(report.consistentAtObservation, true);
    assert.deepEqual(report.files.map((file: { file: string; ledger: string }) =>
      [file.file, file.ledger]), [['matching', 'matching'], ['matching', 'matching']]);
    const after = [source, plan, ledger,
      path.join(root, 'docs/overview.html'), path.join(root, 'docs/api.html')]
      .map((file) => fs.readFileSync(file));
    assert.deepEqual(after, before);
  });
});

test('CLI html-audit reports missing output and nonzero exit without recreating it', async () => {
  await inWorkspace(async ({ root, source, plan, ledger, selections }) => {
    commitHtmlDecomposition({
      workspaceRoot: root, sourcePath: source, ledgerPath: ledger,
      selections, expectedSourceDigest: digest,
    });
    const absent = path.join(root, 'docs/api.html');
    fs.unlinkSync(absent);
    const beforeLedger = fs.readFileSync(ledger);
    const result = await invoke(['html-audit', source, '--plan', plan, '--root', root]);
    assert.equal(result.code, 1);
    assert.match(result.output, /status: incomplete/u);
    assert.match(result.output, /api\.html: output=missing ledger=matching/u);
    assert.equal(fs.existsSync(absent), false);
    assert.deepEqual(fs.readFileSync(ledger), beforeLedger);
  });
});

test('CLI html-audit treats a modified original source as stale rather than complete', async () => {
  await inWorkspace(async ({ root, source, plan }) => {
    fs.appendFileSync(source, '<!-- content drift -->');
    const result = await invoke([
      'html-audit', source, '--plan', plan, '--root', root, '--json',
    ]);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.output);
    assert.equal(report.status, 'stale');
    assert.deepEqual(report.files, []);
    assert.deepEqual(fs.readdirSync(root).sort(), ['reviewed.json', 'source.html']);
  });
});

test('CLI html-audit reports blocked unselected links without creating any output', async () => {
  await inWorkspace(async ({ root, source, plan }) => {
    const original = JSON.parse(fs.readFileSync(plan, 'utf8'));
    original.fragments = original.fragments.slice(0, 1);
    fs.writeFileSync(plan, JSON.stringify(original));
    const result = await invoke([
      'html-audit', source, '--plan', plan, '--root', root, '--json',
    ]);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.output);
    assert.equal(report.status, 'blocked');
    assert.ok(report.problems.includes('MMI_HTML_UNRESOLVED_ANCHOR'));
    assert.deepEqual(fs.readdirSync(root).sort(), ['reviewed.json', 'source.html']);
  });
});

test('CLI html-audit requires reviewed inputs and refuses unsupported writes', async () => {
  await inWorkspace(async ({ root, source, plan }) => {
    const bad = await invoke(['html-audit', source, '--plan', plan, '--root', root, '--commit']);
    assert.equal(bad.code, 2);
    const empty = await invoke(['html-audit', source, '--root', root]);
    assert.equal(empty.code, 2);
    const malformed = JSON.parse(fs.readFileSync(plan, 'utf8'));
    delete malformed.sourceDigest;
    fs.writeFileSync(plan, JSON.stringify(malformed));
    const missing = await invoke(['html-audit', source, '--plan', plan, '--root', root, '--json']);
    assert.equal(missing.code, 1);
    assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
  });
});

test('single-fragment extraction to the same ledger invalidates the earlier batch receipt', async () => {
  await inWorkspace(async ({ root, source, plan, ledger, selections }) => {
    commitHtmlDecomposition({
      workspaceRoot: root, sourcePath: source, ledgerPath: ledger,
      selections, expectedSourceDigest: digest,
    });
    // Ledger v1 records the latest projection per Candidate occurrence. A later
    // single extraction legitimately replaces the API occurrence's batch entry.
    extractHtmlFragment({
      workspaceRoot: root, sourcePath: source, ledgerPath: ledger,
      outDir: path.join(root, 'assets'),
      id: 'api',
      expectedFingerprint: selections[1].expectedFingerprint,
    });
    const result = await invoke([
      'html-audit', source, '--plan', plan, '--root', root, '--json',
    ]);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.output);
    assert.equal(report.status, 'incomplete');
    assert.equal(report.files[1].file, 'matching');
    assert.equal(report.files[1].ledger, 'changed');
    assert.equal(fs.existsSync(path.join(root, 'docs/api.html')), true);
  });
});
