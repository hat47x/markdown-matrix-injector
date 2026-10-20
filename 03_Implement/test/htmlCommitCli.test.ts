import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { main } from '../src/cli/mmi.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const html = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);

async function fixture(action: (args: {
  root: string;
  source: string;
  plan: string;
}) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-commit-cli-'));
  const source = path.join(root, 'source.html');
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(source, html);
  const digest = createSourceIdentityFromBytes(Buffer.from(html, 'utf8')).digest;
  const parsed = readHtmlFragments(html, 'source.html', digest);
  fs.writeFileSync(plan, JSON.stringify({
    sourceDigest: digest,
    fragments: ['overview', 'api'].map((id) => ({
      id,
      output: `docs/${id}.html`,
      expectedFingerprint: selectHtmlFragmentById(parsed, id).candidate.fingerprint.digest,
    })),
  }));
  try {
    await action({ root, source, plan });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('CLI requires explicit --commit and does not write on implicit invocation', async () => {
  await fixture(async ({ root, source, plan }) => {
    assert.equal(await main(['html-commit', source, '--plan', plan, '--root', root]), 2);
    assert.deepEqual(fs.readdirSync(root).sort(), ['plan.json', 'source.html']);
  });
});

test('CLI html-commit --commit saves outputs, preserves source, and reports digests', async () => {
  await fixture(async ({ root, source, plan }) => {
    let captured = '';
    const oldWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    let exit: number;
    try {
      exit = await main([
        'html-commit', source, '--plan', plan, '--root', root,
        '--commit', '--json',
      ]);
    } finally {
      process.stdout.write = oldWrite;
    }
    assert.equal(exit, 0);
    const result = JSON.parse(captured);
    assert.equal(result.files.length, 2);
    assert.deepEqual(result.files.map((file: { status: string }) => file.status),
      ['written', 'written']);
    assert.match(
      fs.readFileSync(path.join(root, 'docs/overview.html'), 'utf8'),
      /href="api\.html#api"/u,
    );
    assert.equal(fs.readFileSync(source, 'utf8'), html);
    assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), true);
  });
});

test('CLI refuses missing approved sourceDigest and makes no changes', async () => {
  await fixture(async ({ root, source, plan }) => {
    const manifest = JSON.parse(fs.readFileSync(plan, 'utf8'));
    delete manifest.sourceDigest;
    fs.writeFileSync(plan, JSON.stringify(manifest));
    assert.equal(await main([
      'html-commit', source, '--plan', plan, '--root', root, '--commit',
    ]), 1);
    assert.equal(fs.existsSync(path.join(root, 'docs')), false);
  });
});
