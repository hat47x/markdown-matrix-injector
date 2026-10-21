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
