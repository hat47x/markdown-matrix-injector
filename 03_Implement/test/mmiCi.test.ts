import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ci = await import(new URL('../scripts/ci/mmi-ci.mjs', import.meta.url).href) as {
  discoverMarkdown: (targets: string[], root: string) => string[];
  evaluate: (input: unknown) => {
    failed: boolean;
    failures: string[];
    summary: Record<string, number>;
  };
  renderSummary: (result: unknown) => string;
  runMmiCi: (options: Record<string, unknown>) => number;
  parseArgs: (argv: string[]) => Record<string, unknown>;
};

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ci-'));
}

test('discoverMarkdown walks directories, ignores skipped directories and does not follow symlinks', () => {
  const root = workspace();
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# A\n');
    fs.writeFileSync(path.join(root, 'docs', 'b.txt'), 'b\n');
    fs.writeFileSync(path.join(root, 'node_modules', 'ignored.md'), '# ignored\n');
    assert.deepEqual(
      ci.discoverMarkdown(['.'], root).map((file) => path.relative(root, file).split(path.sep).join('/')),
      ['docs/a.md'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('evaluate fails only for the selected conditions and renders no source values', () => {
  const result = ci.evaluate({
    check: {
      errors: 1,
      problems: [{ file: 'doc.md', line: 2, column: 1, severity: 'error', code: 'MMI_X', message: 'bad ref' }],
    },
    documents: ['doc.md'],
    failOn: ['review-stale'],
    reports: [{
      document: 'doc.md',
      data: {
        summary: { stale: 0, reviewStale: 1, reviewUnrecorded: 0, missingSources: 0 },
        diagnostics: [],
        extracted: [],
        review: { references: [{ reference: '![[data.csv#S|A1]]', status: 'stale' }] },
      },
    }],
  });
  assert.equal(result.failed, true);
  assert.deepEqual(result.failures, ['review-stale']);
  const markdown = ci.renderSummary(result);
  assert.match(markdown, /Linked prose needing review \| 1/u);
  assert.match(markdown, /!\[\[data\.csv#S\|A1\]\]/u);
  assert.ok(!markdown.includes('cell-value'));
});

test('runMmiCi invokes the CLI, aggregates provenance and fails the opt-in gate', () => {
  const root = workspace();
  try {
    fs.writeFileSync(path.join(root, 'doc.md'), '![[data.csv#Sheet1|A1]]\n');
    const fake = path.join(root, 'fake-mmi.mjs');
    fs.writeFileSync(fake, `
      const command = process.argv[2];
      if (command === 'check') {
        console.log(JSON.stringify({ errors: 0, problems: [] }));
        process.exit(0);
      }
      if (command === 'provenance') {
        console.log(JSON.stringify({
          summary: { linked: 1, extracted: 0, diagnostics: 0, stale: 0, missingSources: 0, reviewStale: 1, reviewUnrecorded: 0 },
          diagnostics: [],
          extracted: [],
          review: { references: [{ reference: '![[data.csv#Sheet1|A1]]', status: 'stale' }] },
        }));
        process.exit(0);
      }
      process.exit(2);
    `);
    const summary = path.join(root, 'summary.md');
    const previous = process.env.GITHUB_STEP_SUMMARY;
    delete process.env.GITHUB_STEP_SUMMARY;
    try {
      const status = ci.runMmiCi({
        root,
        paths: ['doc.md'],
        ledger: 'mmi-ledger.json',
        reviewBasis: 'mmi-review-basis.json',
        failOn: ['review-stale'],
        mmi: process.execPath,
        mmiArgs: [fake],
        summary,
      });
      assert.equal(status, 1);
      assert.match(fs.readFileSync(summary, 'utf8'), /Failed by:\*\* review-stale/u);
    } finally {
      if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = previous;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const COMMIT = 'a8addd1a8addd1a8addd1a8addd1a8addd1a8add';
const LOCK = `sha256:${'b'.repeat(64)}`;

function identityJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 'mmi.build-identity/v1',
    version: '0.3.0',
    commit: COMMIT,
    lockfileDigest: LOCK,
    dirty: false,
    node: { version: '22.1.0', major: 22 },
    distribution: 'tarball',
    ...overrides,
  });
}

/** A fake mmi whose `--version --json` output comes from FAKE_MMI_VERSION; `check` records that it ran. */
function fakeMmi(root: string): { fake: string; ranCheck: () => boolean } {
  const fake = path.join(root, 'fake-mmi.mjs');
  const marker = path.join(root, 'ran-check');
  fs.writeFileSync(fake, `
    import fs from 'node:fs';
    const command = process.argv[2];
    if (command === '--version') {
      if (process.env.FAKE_MMI_VERSION === 'fail') process.exit(2);
      console.log(process.env.FAKE_MMI_VERSION);
      process.exit(0);
    }
    if (command === 'check') {
      fs.writeFileSync(${JSON.stringify(marker)}, 'x');
      console.log(JSON.stringify({ errors: 0, problems: [] }));
      process.exit(0);
    }
    if (command === 'provenance') {
      console.log(JSON.stringify({
        summary: { linked: 0, extracted: 0, diagnostics: 0, stale: 0, missingSources: 0, reviewStale: 0, reviewUnrecorded: 0 },
        diagnostics: [], extracted: [], review: { references: [] },
      }));
      process.exit(0);
    }
    process.exit(2);
  `);
  return { fake, ranCheck: () => fs.existsSync(marker) };
}

function runWithVersion(version: string, extra: Record<string, unknown>): { status: number; summary: string; ranCheck: boolean } {
  const root = workspace();
  const previousSummary = process.env.GITHUB_STEP_SUMMARY;
  const previousVersion = process.env.FAKE_MMI_VERSION;
  try {
    fs.writeFileSync(path.join(root, 'doc.md'), '# doc\n');
    const { fake, ranCheck } = fakeMmi(root);
    const summary = path.join(root, 'summary.md');
    delete process.env.GITHUB_STEP_SUMMARY;
    process.env.FAKE_MMI_VERSION = version;
    const status = ci.runMmiCi({
      root,
      paths: ['doc.md'],
      ledger: 'mmi-ledger.json',
      reviewBasis: 'mmi-review-basis.json',
      failOn: ['diagnostics'],
      mmi: process.execPath,
      mmiArgs: [fake],
      summary,
      ...extra,
    });
    return { status, summary: fs.readFileSync(summary, 'utf8'), ranCheck: ranCheck() };
  } finally {
    if (previousSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previousSummary;
    if (previousVersion === undefined) delete process.env.FAKE_MMI_VERSION;
    else process.env.FAKE_MMI_VERSION = previousVersion;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('parseArgs validates the version pin values', () => {
  const parsed = ci.parseArgs(['--expect-commit', COMMIT, '--expect-lock-digest', LOCK, '--expect-node-major', '22']);
  assert.equal(parsed.expectCommit, COMMIT);
  assert.equal(parsed.expectLockDigest, LOCK);
  assert.equal(parsed.expectNodeMajor, 22);
  assert.throws(() => ci.parseArgs(['--expect-commit', 'a8addd1']), /40-digit/u);
  assert.throws(() => ci.parseArgs(['--expect-lock-digest', 'abc']), /sha256:/u);
  assert.throws(() => ci.parseArgs(['--expect-node-major', '22.1']), /positive integer/u);
});

test('without a pin the summary records the build and says the version is unpinned', () => {
  const result = runWithVersion(identityJson(), {});
  assert.equal(result.status, 0);
  assert.equal(result.ranCheck, true);
  assert.match(result.summary, /## MMI build/u);
  assert.ok(result.summary.includes(COMMIT));
  assert.ok(result.summary.includes(LOCK));
  assert.match(result.summary, /版は未固定/u);
});

test('a matching pin runs the check and reports the match', () => {
  const result = runWithVersion(identityJson(), { expectCommit: COMMIT, expectLockDigest: LOCK, expectNodeMajor: 22 });
  assert.equal(result.status, 0);
  assert.equal(result.ranCheck, true);
  assert.match(result.summary, /版の固定: 一致/u);
});

test('a mismatching pin fails before the check runs', () => {
  const result = runWithVersion(identityJson(), { expectCommit: 'c'.repeat(40), expectNodeMajor: 22 });
  assert.equal(result.status, 1);
  assert.equal(result.ranCheck, false);
  assert.match(result.summary, /不一致。検査を実行していません/u);
  assert.match(result.summary, /commit \| c{40} \| a8addd1/u);
});

test('a pin the build cannot confirm fails: unreported value and uncommitted changes', () => {
  const unreported = runWithVersion(identityJson({ lockfileDigest: null }), { expectLockDigest: LOCK });
  assert.equal(unreported.status, 1);
  assert.equal(unreported.ranCheck, false);
  assert.match(unreported.summary, /mmi did not report this value/u);
  const dirty = runWithVersion(identityJson({ dirty: true }), { expectCommit: COMMIT });
  assert.equal(dirty.status, 1);
  assert.equal(dirty.ranCheck, false);
  assert.match(dirty.summary, /uncommitted changes/u);
});

test('an identity that cannot be read is recorded when unpinned and fails when pinned', () => {
  const unpinned = runWithVersion('fail', {});
  assert.equal(unpinned.status, 0);
  assert.equal(unpinned.ranCheck, true);
  assert.match(unpinned.summary, /ビルド識別を取得できませんでした/u);
  assert.match(unpinned.summary, /版は未固定/u);
  const notIdentity = runWithVersion('not json', {});
  assert.equal(notIdentity.status, 0);
  assert.match(notIdentity.summary, /ビルド識別を取得できませんでした/u);
  const pinned = runWithVersion('fail', { expectNodeMajor: 22 });
  assert.equal(pinned.status, 1);
  assert.equal(pinned.ranCheck, false);
  assert.match(pinned.summary, /build identity unavailable/u);
});
