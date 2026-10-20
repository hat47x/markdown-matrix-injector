import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { commitHtmlDecomposition } from '../src/application/commitHtmlDecomposition.js';
import type { HtmlPlanSelection } from '../src/application/htmlDecompositionPlan.js';
import { readLedger } from '../src/core/importLedger.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const html = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);
const sha = (s: string) => createSourceIdentityFromBytes(Buffer.from(s, 'utf8')).digest;

function workspace(action: (opts: {
  workspaceRoot: string;
  sourcePath: string;
  ledgerPath: string;
  expectedSourceDigest: string;
  selections: HtmlPlanSelection[];
}) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-batch-'));
  const sourcePath = path.join(root, 'source.html');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(sourcePath, html);
  const parsed = readHtmlFragments(html, 'source.html', sha(html));
  const selections: HtmlPlanSelection[] = ['overview', 'api'].map((id) => ({
    id,
    output: `docs/${id}.html`,
    expectedFingerprint: selectHtmlFragmentById(parsed, id).candidate.fingerprint.digest,
  }));
  try {
    action({
      workspaceRoot: root,
      sourcePath,
      ledgerPath,
      expectedSourceDigest: sha(html),
      selections,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('commits two reviewed fragments and rewrites only their internal navigation', () => {
  workspace((options) => {
    const sourceBefore = fs.readFileSync(options.sourcePath);
    const result = commitHtmlDecomposition(options);
    assert.equal(result.files.length, 2);
    assert.deepEqual(result.files.map((file) => file.status), ['written', 'written']);
    const overview = fs.readFileSync(path.join(options.workspaceRoot, 'docs/overview.html'), 'utf8');
    const api = fs.readFileSync(path.join(options.workspaceRoot, 'docs/api.html'), 'utf8');
    assert.match(overview, /href="api\.html#api"/u);
    assert.match(api, /id="api"/u);
    assert.deepEqual(fs.readFileSync(options.sourcePath), sourceBefore);

    const ledger = readLedger(options.ledgerPath);
    assert.equal(ledger.entries.length, 2);
    assert.equal(ledger.entries.every((entry) =>
      entry.reviewState === 'accepted' && entry.outputDigest?.startsWith('sha256:')), true);
    assert.deepEqual(
      ledger.entries.map((entry) => entry.conversion.projection),
      [
        'normalized-html-with-reviewed-anchor-rewrites-v0',
        'normalized-html-with-reviewed-anchor-rewrites-v0',
      ],
    );

    const again = commitHtmlDecomposition(options);
    assert.deepEqual(again.files.map((file) => file.status), ['unchanged', 'unchanged']);
    assert.equal(readLedger(options.ledgerPath).entries.length, 2);
  });
});

test('fails before creating an output directory when the reviewed source is stale', () => {
  workspace((options) => {
    fs.appendFileSync(options.sourcePath, '<!-- changed outside reviewed fragments -->');
    assert.throws(() => commitHtmlDecomposition(options), /MMI_HTML_SOURCE_CHANGED/u);
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs')), false);
    assert.equal(fs.existsSync(options.ledgerPath), false);
  });
});

test('preflights all outputs and refuses a conflicting second destination without partial publication', () => {
  workspace((options) => {
    fs.mkdirSync(path.join(options.workspaceRoot, 'docs'));
    const second = path.join(options.workspaceRoot, 'docs/api.html');
    fs.writeFileSync(second, 'external file');
    assert.throws(() => commitHtmlDecomposition(options), /MMI_HTML_OUTPUT_COLLISION/u);
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs/overview.html')), false);
    assert.equal(fs.readFileSync(second, 'utf8'), 'external file');
    assert.equal(fs.existsSync(options.ledgerPath), false);
  });
});

test('refuses a blocked reference plan without publishing any outputs', () => {
  workspace((options) => {
    assert.throws(() => commitHtmlDecomposition({
      ...options,
      selections: options.selections.slice(0, 1),
    }), /MMI_HTML_PLAN_BLOCKED/u);
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs')), false);
    assert.equal(fs.existsSync(options.ledgerPath), false);
  });
});

test('refuses an invalid existing ledger before making any output files', () => {
  workspace((options) => {
    fs.writeFileSync(options.ledgerPath, '{broken json');
    assert.throws(() => commitHtmlDecomposition(options));
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs')), false);
    assert.equal(fs.readFileSync(options.ledgerPath, 'utf8'), '{broken json');
  });
});

test('refuses a symlinked destination and never writes outside the workspace', (t) => {
  workspace((options) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-batch-outside-'));
    try {
      try {
        fs.symlinkSync(outside, path.join(options.workspaceRoot, 'docs'),
          process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        t.skip('symlink creation is unavailable in this environment');
        return;
      }
      assert.throws(() => commitHtmlDecomposition(options), /MMI_HTML_SYMLINK_PATH/u);
      assert.deepEqual(fs.readdirSync(outside), []);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('recovers only newly created output files if the shared ledger lock is occupied', () => {
  workspace((options) => {
    const lock = path.join(
      options.workspaceRoot,
      '.mmi-ledger.json.lock',
    );
    fs.writeFileSync(lock, 'another operation owns the ledger lock');
    assert.throws(() => commitHtmlDecomposition(options), /already being updated/u);
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs/overview.html')), false);
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs/api.html')), false);
    assert.equal(fs.existsSync(options.ledgerPath), false);
    assert.equal(fs.readFileSync(lock, 'utf8'), 'another operation owns the ledger lock');
  });
});
