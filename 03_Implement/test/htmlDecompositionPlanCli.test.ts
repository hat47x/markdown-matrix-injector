import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { main } from '../src/cli/mmi.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const fixture = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);

async function inWorkspace(
  ids: string[],
  exercise: (report: any, root: string, source: string) => void,
  preview = false,
): Promise<number> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-plan-'));
  const source = path.join(root, 'source.html');
  const plan = path.join(root, 'plan.json');
  try {
    fs.writeFileSync(source, fixture);
    const digest = createSourceIdentityFromBytes(Buffer.from(fixture, 'utf8')).digest;
    const observed = readHtmlFragments(fixture, './source.html', digest);
    fs.writeFileSync(plan, JSON.stringify({
      fragments: ids.map((id) => ({
        id,
        output: `docs/${id}.html`,
        expectedFingerprint: selectHtmlFragmentById(observed, id).candidate.fingerprint.digest,
      })),
    }));
    let captured = '';
    const original = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    let code: number;
    try {
      code = await main(['html-plan', source, '--plan', plan, '--root', root, '--json', ...(preview ? ['--preview'] : [])]);
    } finally {
      process.stdout.write = original;
    }
    exercise(JSON.parse(captured), root, source);
    return code;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('CLI html-plan proposes cross-output links without writing artifacts', async () => {
  const exit = await inWorkspace(['overview', 'api'], (report, root, source) => {
    assert.equal(report.schema, 'mmi.html-decomposition-plan/v0');
    assert.deepEqual(report.anchors[0].proposedHref, 'api.html#api');
    assert.equal(report.hasIdentifiedBlockers, false);
    assert.deepEqual(fs.readdirSync(root).sort(), ['plan.json', 'source.html']);
    assert.equal(fs.readFileSync(source, 'utf8'), fixture);
  });
  assert.equal(exit, 0);
});

test('CLI html-plan returns nonzero when a referenced section was not selected', async () => {
  const exit = await inWorkspace(['overview'], (report) => {
    assert.equal(report.hasIdentifiedBlockers, true);
    assert.equal(report.problems[0].code, 'MMI_HTML_UNRESOLVED_ANCHOR');
  });
  assert.equal(exit, 1);
});

test('CLI html-plan --preview returns only in-memory outputs and leaves workspace untouched', async () => {
  const exit = await inWorkspace(['overview', 'api'], (report, root, source) => {
    assert.equal(report.readyForReview, true);
    assert.equal(report.files.length, 2);
    assert.equal(report.files[0].appliedAnchorRewrites, 1);
    assert.match(report.files[0].html, /href="api\.html#api"/u);
    assert.equal(report.plan.hasIdentifiedBlockers, false);
    assert.deepEqual(fs.readdirSync(root).sort(), ['plan.json', 'source.html']);
    assert.equal(fs.readFileSync(source, 'utf8'), fixture);
  }, true);
  assert.equal(exit, 0);
});

test('CLI html-plan --preview produces no files when the plan is blocked', async () => {
  const exit = await inWorkspace(['overview'], (report, root) => {
    assert.equal(report.readyForReview, false);
    assert.equal(report.files.length, 0);
    assert.equal(report.plan.hasIdentifiedBlockers, true);
    assert.deepEqual(fs.readdirSync(root).sort(), ['plan.json', 'source.html']);
  }, true);
  assert.equal(exit, 1);
});
