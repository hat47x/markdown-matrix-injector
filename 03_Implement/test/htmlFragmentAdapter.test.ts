import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../src/adapters/htmlFragmentAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const html = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);
const source = './fixtures/html-fragment-v0/monolith.html';
const digest = (text: string): string =>
  createSourceIdentityFromBytes(Buffer.from(text, 'utf8')).digest;

test('HTML5 DOM emits only explicit, observed Section/Table/Diagram Candidates', () => {
  const result = readHtmlFragments(html, source, digest(html));
  assert.deepEqual(
    result.fragments.map((item) => [item.tagName, item.id, item.candidate.kind]),
    [
      ['main', 'spec', 'section'],
      ['section', 'overview', 'section'],
      ['figure', 'architecture', 'diagram'],
      ['section', 'api', 'section'],
      ['table', 'endpoints', 'table-range'],
      ['figure', 'sequence', 'diagram'],
    ],
  );
  assert.ok(result.candidates.every((item) =>
    item.status === 'observed'
      && item.method === 'M0'
      && item.execution === 'deterministic'
      && candidateProblem(item) === undefined));
  assert.ok(result.fragments.every((item) => item.structuralPath.startsWith('/html[1]/body[1]')));
});

test('explicit-ID selection returns a normalized subtree without unrelated page chrome', () => {
  const result = readHtmlFragments(html, source, digest(html));
  const spec = selectHtmlFragmentById(result, 'spec');
  assert.match(spec.html, /<main id="spec">/u);
  assert.match(spec.html, /id="overview"/u);
  assert.match(spec.html, /id="api"/u);
  assert.doesNotMatch(spec.html, /文書ポータルの共通フッター/u);
  assert.doesNotMatch(spec.html, /id="site-header"/u);

  const overview = selectHtmlFragmentById(result, 'overview');
  assert.match(overview.html, /href="#api"/u);
  assert.match(overview.html, /<figcaption>図1 システム構成<\/figcaption>/u);
  assert.match(overview.html, /<svg\s/u);
  assert.doesNotMatch(overview.html, /id="endpoints"/u);
});

test('a figure remains one unit rather than counting its inline SVG or Mermaid twice', () => {
  const result = readHtmlFragments(html, source, digest(html));
  const figures = result.fragments.filter((item) => item.tagName === 'figure');
  assert.equal(figures.length, 2);
  assert.equal(result.fragments.filter((item) => item.tagName === 'table').length, 1);
  assert.match(selectHtmlFragmentById(result, 'sequence').html, /sequenceDiagram/u);
  assert.match(selectHtmlFragmentById(result, 'endpoints').html, /<caption>表1 エンドポイント<\/caption>/u);
});

test('HTML ID selection fails visibly when the ID is missing, duplicated or unsupported', () => {
  const parsed = readHtmlFragments(html, source, digest(html));
  assert.throws(() => selectHtmlFragmentById(parsed, 'unknown'), /MMI_HTML_ID_NOT_UNIQUE/u);
  assert.throws(() => selectHtmlFragmentById(parsed, 'site-header'), /MMI_HTML_UNSUPPORTED_FRAGMENT/u);
  assert.throws(() => selectHtmlFragmentById(parsed, ''), /MMI_HTML_INVALID_SELECTOR/u);
  const duplicated = html.replace('<section id="overview">', '<section id="api">');
  const result = readHtmlFragments(duplicated, source, digest(duplicated));
  assert.throws(() => selectHtmlFragmentById(result, 'api'), /MMI_HTML_ID_NOT_UNIQUE/u);
});

test('source snapshot and reviewed fragment fingerprints are separately checked', () => {
  assert.throws(
    () => readHtmlFragments(html + '\n', source, digest(html)),
    /MMI_HTML_SOURCE_CHANGED/u,
  );
  const original = readHtmlFragments(html, source, digest(html));
  const reviewed = selectHtmlFragmentById(original, 'api');
  const changedHtml = html.replace('表1 エンドポイント', '表1 API一覧');
  const changed = readHtmlFragments(changedHtml, source, digest(changedHtml));
  assert.throws(
    () => selectHtmlFragmentById(changed, 'api', reviewed.candidate.fingerprint.digest),
    /MMI_HTML_FRAGMENT_CHANGED/u,
  );
  assert.equal(
    selectHtmlFragmentById(changed, 'overview').candidate.fingerprint.digest,
    selectHtmlFragmentById(original, 'overview').candidate.fingerprint.digest,
  );
});
