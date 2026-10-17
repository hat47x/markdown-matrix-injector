import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../src/adapters/htmlFragmentAdapter.js';
import {
  planHtmlDecomposition,
  type HtmlPlanSelection,
} from '../src/application/htmlDecompositionPlan.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const fixture = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);
function read(text: string = fixture) {
  return readHtmlFragments(
    text,
    './monolith.html',
    createSourceIdentityFromBytes(Buffer.from(text, 'utf8')).digest,
  );
}
function selected(
  doc: ReturnType<typeof read>,
  id: string,
  output: string,
): HtmlPlanSelection {
  return {
    id,
    output,
    expectedFingerprint: selectHtmlFragmentById(doc, id).candidate.fingerprint.digest,
  };
}

test('plans a cross-file anchor without modifying either source or output', () => {
  const doc = read();
  const plan = planHtmlDecomposition(doc, [
    selected(doc, 'overview', 'docs/overview.html'),
    selected(doc, 'api', 'docs/api.html'),
  ]);
  assert.equal(plan.schema, 'mmi.html-decomposition-plan/v0');
  assert.equal(plan.hasIdentifiedBlockers, false);
  assert.deepEqual(plan.anchors, [{
    sourceId: 'overview',
    href: '#api',
    targetFragmentId: 'api',
    proposedHref: 'api.html#api',
    status: 'cross-output',
  }]);
  assert.deepEqual(plan.externalLinks, [{
    sourceId: 'api',
    href: 'https://example.invalid/external',
  }]);
  assert.equal(plan.fragments.length, 2);
});

test('keeps local anchors unchanged when selecting the containing main subtree', () => {
  const doc = read();
  const plan = planHtmlDecomposition(doc, [
    selected(doc, 'spec', 'docs/spec.html'),
  ]);
  assert.equal(plan.hasIdentifiedBlockers, false);
  assert.equal(plan.anchors[0]?.status, 'same-output');
  assert.equal(plan.anchors[0]?.proposedHref, '#api');
});

test('reports cross-section anchors that are outside the selected fragment', () => {
  const doc = read();
  const plan = planHtmlDecomposition(doc, [
    selected(doc, 'overview', 'docs/overview.html'),
  ]);
  assert.equal(plan.hasIdentifiedBlockers, true);
  assert.deepEqual(plan.problems.map((p) => p.code), ['MMI_HTML_UNRESOLVED_ANCHOR']);
  assert.deepEqual(plan.anchors.map((a) => a.status), ['blocked']);
});

test('rejects overlap, duplicate selection and invalid outputs', () => {
  const doc = read();
  assert.throws(() => planHtmlDecomposition(doc, [
    selected(doc, 'spec', 'docs/spec.html'),
    selected(doc, 'overview', 'docs/overview.html'),
  ]), /MMI_HTML_PLAN_OVERLAP/u);
  assert.throws(() => planHtmlDecomposition(doc, [
    selected(doc, 'api', 'docs/api.html'),
    selected(doc, 'api', 'docs/alias.html'),
  ]), /MMI_HTML_PLAN_DUPLICATE_SELECTION/u);
  assert.throws(() => planHtmlDecomposition(doc, [
    selected(doc, 'api', 'docs/api.html'),
    selected(doc, 'overview', 'DOCS/API.HTML'),
  ]), /MMI_HTML_PLAN_DUPLICATE_OUTPUT/u);
  assert.throws(() => planHtmlDecomposition(doc, [
    selected(doc, 'api', '../escape.html'),
  ]), /MMI_HTML_PLAN_INVALID_OUTPUT/u);
  for (const invalid of ['docs/CON.html', 'docs/report?.html',
    'docs/notes .html', 'docs/next\\\\file.html']) {
    assert.throws(() => planHtmlDecomposition(doc, [
      selected(doc, 'api', invalid),
    ]), /MMI_HTML_PLAN_INVALID_OUTPUT/u);
  }
});

test('rejects stale review fingerprints and nonunique source IDs', () => {
  const doc = read();
  const old = selected(doc, 'api', 'docs/api.html');
  const changed = read(fixture.replace('表1 エンドポイント', '表1 サービスAPI'));
  assert.throws(() => planHtmlDecomposition(changed, [old]), /MMI_HTML_FRAGMENT_CHANGED/u);

  const duplicated = read(fixture.replace('<section id="overview">', '<section id="api">'));
  assert.throws(
    () => planHtmlDecomposition(duplicated, [old]),
    /MMI_HTML_ID_NOT_UNIQUE/u,
  );
});

test('reports unresolved image assets instead of claiming a complete export', () => {
  const withImage = fixture.replace(
    '<figcaption>図2 申請登録シーケンス</figcaption>',
    '<img src="./diagram.png"><figcaption>図2 申請登録シーケンス</figcaption>',
  );
  const doc = read(withImage);
  const plan = planHtmlDecomposition(doc, [
    selected(doc, 'sequence', 'docs/sequence.html'),
  ]);
  assert.equal(plan.hasIdentifiedBlockers, true);
  assert.ok(plan.problems.some((p) => p.code === 'MMI_HTML_UNMATERIALIZED_ASSET'));
});

test('a duplicate anchor outside the selected roots remains ambiguous', () => {
  const duplicated = fixture.replace(
    '<footer id="site-footer">',
    '<footer id="site-footer"><span id="api">duplicate</span>',
  );
  const doc = read(duplicated);
  const plan = planHtmlDecomposition(doc, [
    selected(doc, 'overview', 'docs/overview.html'),
    selected(doc, 'api', 'docs/api.html'),
  ]);
  assert.equal(plan.hasIdentifiedBlockers, true);
  assert.ok(plan.problems.some((p) => p.code === 'MMI_HTML_AMBIGUOUS_ANCHOR'));
  assert.equal(plan.anchors[0]?.status, 'blocked');
});

test('reports source base URL semantics before proposing a self-contained migration', () => {
  const withBase = fixture.replace(
    '<title>申請システムの統合設計書（分解用fixture）</title>',
    '<base href="https://docs.invalid/v1/"><title>申請システムの統合設計書（分解用fixture）</title>',
  );
  const doc = read(withBase);
  const plan = planHtmlDecomposition(doc, [
    selected(doc, 'overview', 'docs/overview.html'),
    selected(doc, 'api', 'docs/api.html'),
  ]);
  assert.equal(plan.hasIdentifiedBlockers, true);
  assert.ok(plan.problems.some((p) => p.code === 'MMI_HTML_SOURCE_BASE_DEPENDENCY'));
});

test('reports cross-file HTML IDREF semantics separately from navigational anchor links', () => {
  const html = fixture.replace(
    '<p>申請の状態については',
    '<p aria-describedby="api">申請の状態については',
  );
  const doc = read(html);
  const split = planHtmlDecomposition(doc, [
    selected(doc, 'overview', 'docs/overview.html'),
    selected(doc, 'api', 'docs/api.html'),
  ]);
  assert.equal(split.hasIdentifiedBlockers, true);
  assert.ok(split.problems.some((p) => p.code === 'MMI_HTML_CROSS_OUTPUT_IDREF'));
  const single = planHtmlDecomposition(doc, [selected(doc, 'spec', 'docs/spec.html')]);
  assert.equal(single.hasIdentifiedBlockers, false);
});
