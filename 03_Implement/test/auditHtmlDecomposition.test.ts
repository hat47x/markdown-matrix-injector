import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { auditHtmlDecomposition } from '../src/application/auditHtmlDecomposition.js';
import { commitHtmlDecomposition, type CommitHtmlDecompositionOptions } from '../src/application/commitHtmlDecomposition.js';
import { readLedger } from '../src/core/importLedger.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const html = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);
const sha = (value: string): string =>
  createSourceIdentityFromBytes(Buffer.from(value, 'utf8')).digest;

function workspace(action: (options: CommitHtmlDecompositionOptions) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-audit-'));
  const sourcePath = path.join(root, 'source.html');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(sourcePath, html);
  const parsed = readHtmlFragments(html, 'source.html', sha(html));
  const options: CommitHtmlDecompositionOptions = {
    workspaceRoot: root,
    sourcePath,
    ledgerPath,
    expectedSourceDigest: sha(html),
    selections: ['overview', 'api'].map((id) => ({
      id,
      output: `docs/${id}.html`,
      expectedFingerprint: selectHtmlFragmentById(parsed, id).candidate.fingerprint.digest,
    })),
  };
  try {
    action(options);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('reports an approved two-file batch as mechanically complete without writing', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const root = options.workspaceRoot;
    const before = {
      ledger: fs.readFileSync(options.ledgerPath),
      source: fs.readFileSync(options.sourcePath),
      overview: fs.readFileSync(path.join(root, 'docs/overview.html')),
      api: fs.readFileSync(path.join(root, 'docs/api.html')),
      names: fs.readdirSync(root).sort(),
    };
    const report = auditHtmlDecomposition(options);
    assert.equal(report.status, 'complete');
    assert.equal(report.consistentAtObservation, true);
    assert.equal(report.problems.length, 0);
    assert.deepEqual(report.files.map((item) => [item.file, item.ledger]), [
      ['matching', 'matching'],
      ['matching', 'matching'],
    ]);
    assert.deepEqual(fs.readFileSync(options.sourcePath), before.source);
    assert.deepEqual(fs.readFileSync(options.ledgerPath), before.ledger);
    assert.deepEqual(fs.readFileSync(path.join(root, 'docs/overview.html')), before.overview);
    assert.deepEqual(fs.readFileSync(path.join(root, 'docs/api.html')), before.api);
    assert.deepEqual(fs.readdirSync(root).sort(), before.names);
  });
});

test('detects outputs published before a crash left the ledger absent', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    fs.unlinkSync(options.ledgerPath);
    const report = auditHtmlDecomposition(options);
    assert.equal(report.status, 'incomplete');
    assert.deepEqual(report.files.map((file) => [file.file, file.ledger]), [
      ['matching', 'missing'],
      ['matching', 'missing'],
    ]);
    assert.ok(report.problems.includes('MMI_HTML_LEDGER_MISSING'));
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs/overview.html')), true);
    assert.equal(fs.existsSync(options.ledgerPath), false); // no auto-heal
  });
});

test('detects partial publication and does not remove valid existing assets', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    fs.unlinkSync(path.join(options.workspaceRoot, 'docs/api.html'));
    const report = auditHtmlDecomposition(options);
    assert.equal(report.status, 'incomplete');
    assert.deepEqual(report.files.map((file) => file.file), ['matching', 'missing']);
    assert.deepEqual(report.files.map((file) => file.ledger), ['matching', 'matching']);
    assert.equal(fs.existsSync(path.join(options.workspaceRoot, 'docs/overview.html')), true);
    assert.equal(readLedger(options.ledgerPath).entries.length, 2);
  });
});

test('flags tampered output instead of trusting an accepted ledger state', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const output = path.join(options.workspaceRoot, 'docs/overview.html');
    fs.writeFileSync(output, '<section id="overview">tampered</section>');
    const report = auditHtmlDecomposition(options);
    assert.equal(report.status, 'incomplete');
    assert.equal(report.files[0].file, 'changed');
    assert.equal(report.files[0].ledger, 'matching');
    assert.ok(report.problems.includes('MMI_HTML_OUTPUT_CHANGED'));
    assert.match(fs.readFileSync(output, 'utf8'), /tampered/u);
  });
});

test('flags a modified ledger even when output bytes still match', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const ledger = readLedger(options.ledgerPath);
    ledger.entries[0].reviewState = 'modified';
    fs.writeFileSync(options.ledgerPath, JSON.stringify(ledger));
    const report = auditHtmlDecomposition(options);
    assert.equal(report.status, 'incomplete');
    assert.equal(report.files[0].file, 'matching');
    assert.equal(report.files[0].ledger, 'changed');
    assert.ok(report.problems.includes('MMI_HTML_LEDGER_CHANGED'));
  });
});

test('does not classify stale source or unresolved plan as complete', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    fs.appendFileSync(options.sourcePath, '<!-- outside fragment changed -->');
    const stale = auditHtmlDecomposition(options);
    assert.equal(stale.status, 'stale');
    assert.equal(stale.files.length, 0);
    assert.ok(stale.problems.includes('MMI_HTML_SOURCE_CHANGED'));
  });

  workspace((options) => {
    const blocked = auditHtmlDecomposition({
      ...options,
      selections: options.selections.slice(0, 1),
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.files.length, 0);
    assert.ok(blocked.problems.includes('MMI_HTML_UNRESOLVED_ANCHOR'));
  });
});

test('never follows an output symlink or repairs a potentially unsafe path', (t) => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const out = path.join(options.workspaceRoot, 'docs/overview.html');
    const other = path.join(options.workspaceRoot, 'secret.txt');
    fs.writeFileSync(other, 'secret source');
    fs.unlinkSync(out);
    try {
      fs.symlinkSync(other, out, 'file');
    } catch {
      t.skip('symlink creation is unavailable');
      return;
    }
    const report = auditHtmlDecomposition(options);
    assert.equal(report.status, 'incomplete');
    assert.equal(report.files[0].file, 'unsafe');
    assert.equal(fs.readFileSync(other, 'utf8'), 'secret source');
  });
});

test('detects tampered claim provenance even if output bytes and main fingerprint still match', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const ledger = readLedger(options.ledgerPath);
    const basis = ledger.entries[0].claimBasis;
    assert.ok(basis && basis.length > 0);
    basis[0].digest = 'sha256:' + '0'.repeat(64);
    fs.writeFileSync(options.ledgerPath, JSON.stringify(ledger));
    const result = auditHtmlDecomposition(options);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.files[0].file, 'matching');
    assert.equal(result.files[0].ledger, 'changed');
    assert.ok(result.problems.includes('MMI_HTML_LEDGER_CHANGED'));
  });
});

test('detects changed duplicated output digest in conversion metadata', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const ledger = readLedger(options.ledgerPath);
    ledger.entries[0].conversion = {
      ...ledger.entries[0].conversion,
      outputDigest: 'sha256:' + '1'.repeat(64),
    };
    fs.writeFileSync(options.ledgerPath, JSON.stringify(ledger));
    const result = auditHtmlDecomposition(options);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.files[0].file, 'matching');
    assert.equal(result.files[0].ledger, 'changed');
  });
});

test('classifies a corrupted ledger separately from intact output files', () => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    fs.writeFileSync(options.ledgerPath, '{broken json');
    const result = auditHtmlDecomposition(options);
    assert.equal(result.status, 'incomplete');
    assert.ok(result.files.every((file) => file.file === 'matching' && file.ledger === 'invalid'));
    assert.ok(result.problems.includes('MMI_HTML_LEDGER_INVALID'));
    assert.equal(fs.readFileSync(options.ledgerPath, 'utf8'), '{broken json');
  });
});

test('does not follow a symlinked ledger, including one pointing outside workspace', (t) => {
  workspace((options) => {
    commitHtmlDecomposition(options);
    const ledgerContents = fs.readFileSync(options.ledgerPath);
    const other = path.join(options.workspaceRoot, 'unexpected-ledger.json');
    fs.writeFileSync(other, ledgerContents);
    fs.unlinkSync(options.ledgerPath);
    try {
      fs.symlinkSync(other, options.ledgerPath, 'file');
    } catch {
      t.skip('symlink creation is unavailable');
      return;
    }
    assert.throws(() => auditHtmlDecomposition(options), /MMI_HTML_SYMLINK_PATH/u);
    assert.deepEqual(fs.readFileSync(other), ledgerContents);
  });
});
