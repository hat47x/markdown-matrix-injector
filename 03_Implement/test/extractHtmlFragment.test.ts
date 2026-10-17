import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../src/adapters/htmlFragmentAdapter.js';
import { extractHtmlFragment } from '../src/application/extractHtmlFragment.js';
import { readLedger } from '../src/core/importLedger.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const fixture = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);
const digest = (text: string): string =>
  createSourceIdentityFromBytes(Buffer.from(text, 'utf8')).digest;
const fingerprint = (text: string, id: string): string =>
  selectHtmlFragmentById(readHtmlFragments(text, './source.html', digest(text)), id).candidate.fingerprint.digest;

function inWorkspace(run: (options: {
  sourcePath: string;
  workspaceRoot: string;
  outDir: string;
  ledgerPath: string;
}) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-extract-'));
  const options = {
    sourcePath: path.join(root, 'source.html'),
    workspaceRoot: root,
    outDir: path.join(root, 'assets', 'html'),
    ledgerPath: path.join(root, 'mmi-ledger.json'),
  };
  fs.writeFileSync(options.sourcePath, fixture);
  try {
    run(options);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('extracts one reviewed normalized HTML fragment and records source, output and ledger', () => {
  inWorkspace((options) => {
    const before = fs.readFileSync(options.sourcePath);
    const selectedFingerprint = fingerprint(fixture, 'sequence');
    const result = extractHtmlFragment({
      ...options,
      id: 'sequence',
      expectedFingerprint: selectedFingerprint,
    });
    assert.equal(result.status, 'written');
    assert.equal(result.fragmentFingerprint, selectedFingerprint);
    assert.equal(result.sourceDigest, digest(fixture));
    assert.deepEqual(result.externalLinks, []);
    const file = fs.readFileSync(result.path, 'utf8');
    assert.match(file, /sequenceDiagram/u);
    assert.match(file, /<figcaption>図2 申請登録シーケンス<\/figcaption>/u);
    assert.doesNotMatch(file, /id="site-header"/u);
    assert.equal(result.outputDigest,
      `sha256:${createHash('sha256').update(file, 'utf8').digest('hex')}`);
    const ledger = readLedger(options.ledgerPath);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].kind, 'diagram');
    assert.equal(ledger.entries[0].reviewState, 'accepted');
    assert.equal(ledger.entries[0].fingerprint.digest, selectedFingerprint);
    assert.equal(ledger.entries[0].outputDigest, result.outputDigest);
    assert.deepEqual(fs.readFileSync(options.sourcePath), before);

    const repeated = extractHtmlFragment({
      ...options,
      id: 'sequence',
      expectedFingerprint: selectedFingerprint,
    });
    assert.equal(repeated.status, 'unchanged');
    assert.equal(repeated.path, result.path);
    assert.equal(readLedger(options.ledgerPath).entries.length, 1);
  });
});

test('preserves a full selected main containing its internal anchor and external hyperlink', () => {
  inWorkspace((options) => {
    const result = extractHtmlFragment({
      ...options,
      id: 'spec',
      expectedFingerprint: fingerprint(fixture, 'spec'),
    });
    assert.equal(result.externalLinks.length, 1);
    assert.equal(result.externalLinks[0], 'https://example.invalid/external');
    const html = fs.readFileSync(result.path, 'utf8');
    assert.match(html, /href="#api"/u);
    assert.match(html, /id="api"/u);
  });
});

test('fails closed for links outside selected section and stale review fingerprint', () => {
  inWorkspace((options) => {
    assert.throws(() => extractHtmlFragment({
      ...options,
      id: 'overview',
      expectedFingerprint: fingerprint(fixture, 'overview'),
    }), /MMI_HTML_UNRESOLVED_ANCHOR/u);
    assert.equal(fs.existsSync(options.ledgerPath), false);

    const old = fingerprint(fixture, 'api');
    fs.writeFileSync(options.sourcePath, fixture.replace('申請登録', '申請新規登録'));
    assert.throws(() => extractHtmlFragment({
      ...options,
      id: 'api',
      expectedFingerprint: old,
    }), /MMI_HTML_FRAGMENT_CHANGED/u);
    assert.equal(fs.existsSync(options.ledgerPath), false);
  });
});

test('rejects active script and event handlers before writing an asset', () => {
  inWorkspace((options) => {
    const altered = fixture.replace(
      '<figcaption>図2',
      '<script>console.log("side effect")</script><figcaption>図2',
    );
    fs.writeFileSync(options.sourcePath, altered);
    assert.throws(() => extractHtmlFragment({
      ...options,
      id: 'sequence',
      expectedFingerprint: fingerprint(altered, 'sequence'),
    }), /MMI_HTML_ACTIVE_CONTENT/u);
    assert.equal(fs.existsSync(options.ledgerPath), false);

    const event = fixture.replace('<figure id="sequence">', '<figure id="sequence" onclick="run()">');
    fs.writeFileSync(options.sourcePath, event);
    assert.throws(() => extractHtmlFragment({
      ...options,
      id: 'sequence',
      expectedFingerprint: fingerprint(event, 'sequence'),
    }), /MMI_HTML_ACTIVE_CONTENT/u);
    assert.equal(fs.existsSync(options.ledgerPath), false);
  });
});

test('does not write outside workspace even when output parent is a symlink', (t) => {
  inWorkspace((options) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-outside-'));
    try {
      fs.mkdirSync(path.join(options.workspaceRoot, 'assets'));
      try {
        fs.symlinkSync(outside, options.outDir, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        t.skip('filesystem does not permit creating test symlinks');
        return;
      }
      assert.throws(() => extractHtmlFragment({
        ...options,
        id: 'api',
        expectedFingerprint: fingerprint(fixture, 'api'),
      }), /MMI_HTML_SYMLINK_PATH/u);
      assert.equal(fs.readdirSync(outside).length, 0);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});


test('does not overwrite an existing same-name asset with unexpected content', () => {
  inWorkspace((options) => {
    const expectedFingerprint = fingerprint(fixture, 'sequence');
    const first = extractHtmlFragment({ ...options, id: 'sequence', expectedFingerprint });
    fs.writeFileSync(first.path, 'changed outside MMI');
    assert.throws(() => extractHtmlFragment({
      ...options, id: 'sequence', expectedFingerprint,
    }), /MMI_HTML_OUTPUT_COLLISION/u);
    assert.equal(fs.readFileSync(first.path, 'utf8'), 'changed outside MMI');
  });
});

test('rolls back an output file created by this operation if the ledger update fails', () => {
  inWorkspace((options) => {
    const damagedLedger = '{ not valid JSON';
    fs.writeFileSync(options.ledgerPath, damagedLedger);
    assert.throws(() => extractHtmlFragment({
      ...options,
      id: 'sequence',
      expectedFingerprint: fingerprint(fixture, 'sequence'),
    }));
    assert.equal(fs.readFileSync(options.ledgerPath, 'utf8'), damagedLedger);
    assert.equal(fs.readdirSync(options.outDir).length, 0);
  });
});

test('rejects source paths outside the workspace before reading them', () => {
  inWorkspace((options) => {
    const external = path.join(os.tmpdir(), 'mmi-other-place.html');
    assert.throws(() => extractHtmlFragment({
      ...options,
      sourcePath: external,
      id: 'sequence',
      expectedFingerprint: fingerprint(fixture, 'sequence'),
    }), /MMI_HTML_OUTSIDE_ROOT/u);
    assert.equal(fs.existsSync(options.ledgerPath), false);
  });
});
