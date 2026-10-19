import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../src/adapters/htmlFragmentAdapter.js';
import {
  previewHtmlDecomposition,
} from '../src/application/htmlDecompositionPreview.js';
import {
  type HtmlPlanSelection,
} from '../src/application/htmlDecompositionPlan.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const fixture = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);

function source(text = fixture) {
  return readHtmlFragments(
    text,
    './monolith.html',
    createSourceIdentityFromBytes(Buffer.from(text, 'utf8')).digest,
  );
}
function selection(
  doc: ReturnType<typeof source>,
  id: string,
  output: string,
): HtmlPlanSelection {
  return {
    id,
    output,
    expectedFingerprint: selectHtmlFragmentById(doc, id).candidate.fingerprint.digest,
  };
}

test('previews a two-section HTML migration and rewrites only cross-file navigation', () => {
  const doc = source();
  const unchanged = selectHtmlFragmentById(doc, 'overview').html;
  const preview = previewHtmlDecomposition(doc, [
    selection(doc, 'overview', 'docs/overview.html'),
    selection(doc, 'api', 'docs/api.html'),
  ]);
  assert.equal(preview.readyForReview, true);
  assert.equal(preview.files.length, 2);
  assert.equal(preview.plan.hasIdentifiedBlockers, false);

  const intro = preview.files[0];
  const api = preview.files[1];
  assert.equal(intro.output, 'docs/overview.html');
  assert.match(intro.html, /href="api\.html#api"/u);
  assert.doesNotMatch(intro.html, /href="#api"/u);
  assert.match(intro.html, /<figcaption>図1 システム構成<\/figcaption>/u);
  assert.equal(intro.appliedAnchorRewrites, 1);
  assert.equal(api.appliedAnchorRewrites, 0);
  assert.match(api.html, /href="https:\/\/example\.invalid\/external"/u);
  for (const file of preview.files) {
    assert.equal(
      file.digest,
      'sha256:' + createHash('sha256').update(file.html, 'utf8').digest('hex'),
    );
  }
  // Rewriting the preview must not mutate the cached source DOM or fragments.
  assert.equal(selectHtmlFragmentById(doc, 'overview').html, unchanged);
  assert.equal(previewHtmlDecomposition(doc, [
    selection(doc, 'overview', 'docs/overview.html'),
    selection(doc, 'api', 'docs/api.html'),
  ]).files[0].html, intro.html);
});

test('calculates cross-directory relative links from the selected output paths', () => {
  const doc = source();
  const preview = previewHtmlDecomposition(doc, [
    selection(doc, 'overview', 'chapters/overview.html'),
    selection(doc, 'api', 'reference/api.html'),
  ]);
  assert.match(preview.files[0].html, /href="\.\.\/reference\/api\.html#api"/u);
  assert.equal(preview.files[0].appliedAnchorRewrites, 1);
});

test('retains same-file navigation and does not require an unrelated file rewrite', () => {
  const doc = source();
  const preview = previewHtmlDecomposition(doc, [
    selection(doc, 'spec', 'docs/spec.html'),
  ]);
  assert.equal(preview.readyForReview, true);
  assert.equal(preview.files.length, 1);
  assert.equal(preview.files[0].appliedAnchorRewrites, 0);
  assert.match(preview.files[0].html, /href="#api"/u);
});

test('blocked plans return zero preview outputs; no partial migration artifacts', () => {
  const doc = source();
  const result = previewHtmlDecomposition(doc, [
    selection(doc, 'overview', 'docs/overview.html'),
  ]);
  assert.equal(result.readyForReview, false);
  assert.equal(result.files.length, 0);
  assert.equal(result.plan.problems[0]?.code, 'MMI_HTML_UNRESOLVED_ANCHOR');

  const missingAsset = fixture.replace(
    '<figcaption>図2 申請登録シーケンス</figcaption>',
    '<img src="images/diagram.png"><figcaption>図2 申請登録シーケンス</figcaption>',
  );
  const withAsset = source(missingAsset);
  const second = previewHtmlDecomposition(withAsset, [
    selection(withAsset, 'sequence', 'docs/sequence.html'),
  ]);
  assert.equal(second.readyForReview, false);
  assert.equal(second.files.length, 0);
  assert.ok(second.plan.problems.some((p) => p.code === 'MMI_HTML_UNMATERIALIZED_ASSET'));
});

test('stale review fingerprints abort rather than returning provisional previews', () => {
  const original = source();
  const reviewed = selection(original, 'api', 'docs/api.html');
  const changed = source(fixture.replace('表1 エンドポイント', '表1 更新API'));
  assert.throws(
    () => previewHtmlDecomposition(changed, [reviewed]),
    /MMI_HTML_FRAGMENT_CHANGED/u,
  );
});

test('non-navigational SVG references cannot be rewritten as HTML anchors', () => {
  const html = fixture.replace(
    '<text x="10" y="25">Client</text>',
    '<text x="10" y="25">Client</text><a href="#api"><text x="10" y="35">API</text></a>',
  );
  const doc = source(html);
  const selected = [
    selection(doc, 'overview', 'docs/overview.html'),
    selection(doc, 'api', 'docs/api.html'),
  ];
  // An SVG anchor link needs its own rendering semantics. It must not be
  // silently treated as an ordinary HTML navigational anchor.
  assert.throws(
    () => previewHtmlDecomposition(doc, selected),
    /MMI_HTML_PREVIEW_UNSUPPORTED_LINK_KIND/u,
  );
});
