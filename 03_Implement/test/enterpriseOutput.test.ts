/**
 * Enterprise output tests (issue-0098 / ADR-0010 G2)
 *
 * These tests verify the HTML structure of PDF-relevant features — caption,
 * cross-reference id, pageBreak, orientation, Smart Fallback card, highlight —
 * using the representative SIer design document CSV fixtures.
 *
 * They do NOT generate actual PDF (that requires a Chromium/weasyprint runtime).
 * They prove that every attribute and class the PDF CSS engine needs to act on
 * is present and correctly formed in the rendered HTML (G4: honest scope).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';

const FIXTURE_ROOT = path.resolve('test/fixtures/workspace');
const FIXTURE_MD = path.join(FIXTURE_ROOT, 'docs/spec.md');
const SIER_DIR = '../data/sier-design';

function buildMd(): MarkdownIt {
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    markdownFilePath: FIXTURE_MD,
    workspaceRoot: FIXTURE_ROOT,
    cache: new WorkbookCache(),
  });
  return md;
}

// ── G2: caption + id (cross-reference anchor) ──────────────────────────────

test('enterprise output: caption produces figcaption and id attribute on figure', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/state-transition.csv#Sheet1|A1:F6?header=first&caption=状態遷移表&id=tbl-state]]`,
  );

  assert.match(html, /<figure class="mmi-embed" id="tbl-state">/, 'id attr must be on figure for cross-reference anchors');
  assert.match(html, /<figcaption class="mmi-embed__caption">状態遷移表<\/figcaption>/, 'caption must appear as figcaption');
  assert.match(html, /<table class="mmi-table">/);
  assert.doesNotMatch(html, /<p>/, 'no <p> wrapper on standalone embed');
});

// ── G2: pageBreak attribute (CSS page-break trigger) ───────────────────────

test('enterprise output: pageBreak=before sets data-page-break on figure', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/state-transition.csv#Sheet1|A1:F6?header=first&caption=状態遷移&id=tbl-pb&pageBreak=before]]`,
  );

  assert.match(html, /data-page-break="before"/, 'data-page-break must be present for CSS page-break-before: always');
  assert.match(html, /<figure class="mmi-embed"[^>]+data-page-break="before"/);
});

test('enterprise output: pageBreak=after sets data-page-break correctly', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/req-trace.csv#Sheet1|A1:H9?header=first&id=tbl-after&pageBreak=after]]`,
  );

  assert.match(html, /data-page-break="after"/);
});

test('enterprise output: pageBreak=both sets data-page-break correctly', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/req-trace.csv#Sheet1|A1:H9?header=first&id=tbl-both&pageBreak=both]]`,
  );

  assert.match(html, /data-page-break="both"/);
});

// ── G2: orientation attribute (CSS @page named-page trigger) ───────────────

test('enterprise output: orientation=landscape sets data-orientation on figure', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/state-transition.csv#Sheet1|A1:F6?header=first&caption=横向き表&id=tbl-ls&orientation=landscape]]`,
  );

  assert.match(html, /data-orientation="landscape"/, 'data-orientation must be present for CSS @page landscape');
  assert.match(html, /<figure class="mmi-embed"[^>]+data-orientation="landscape"/);
});

test('enterprise output: pageBreak + orientation can be combined on one figure', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/req-trace.csv#Sheet1|A1:H9?header=first&caption=全要件横向き&id=tbl-all&pageBreak=before&orientation=landscape]]`,
  );

  assert.match(html, /data-page-break="before"/);
  assert.match(html, /data-orientation="landscape"/);
  // Both attributes on the same figure element
  assert.match(html, /<figure class="mmi-embed"[^>]+data-page-break="before"[^>]+data-orientation="landscape">/);
  assert.match(html, /<table class="mmi-table">/);
  assert.doesNotMatch(html, /<p>/);
});

// ── G2: Smart Fallback — card renders as mmi-card (print: 別紙参照ブロック) ─

test('enterprise output: mode=card renders mmi-card with data-path for print 別紙参照', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/failure-triage.csv#Sheet1|A1:F9?mode=card&caption=別紙: 障害切り分けガイド&id=card-triage]]`,
  );

  assert.match(html, /class="mmi-card"/, 'card container must have mmi-card class');
  assert.match(html, /data-path="/, 'card must carry data-path for ::after print content');
  assert.match(html, /class="mmi-card__title"/, 'card must have mmi-card__title for 別紙参照: prefix');
  assert.match(html, /<figure class="mmi-embed" id="card-triage">/, 'card frame must have id for cross-reference');
  assert.match(html, /<figcaption class="mmi-embed__caption">別紙: 障害切り分けガイド<\/figcaption>/);
  assert.doesNotMatch(html, /<p>/, 'no <p> wrapper on standalone card embed');
});

test('enterprise output: wide table auto-falls back to mmi-card (column threshold exceeded)', () => {
  // failure-triage.csv has 6 columns — just within threshold, but we can force with mode=card
  const html = buildMd().render(
    `![[${SIER_DIR}/failure-triage.csv#Sheet1|A1:F9?mode=card&caption=別紙]]`,
  );

  assert.match(html, /class="mmi-card"/);
  assert.doesNotMatch(html, /class="mmi-table"/);
});

// ── G2: highlight row (ハイライト行 — CSS class applied for print too) ────

test('enterprise output: highlightColumn/highlightValue marks rows with mmi-table__row--highlight', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/failure-triage.csv#Sheet1|A1:F9?header=first&highlightColumn=Severity&highlightValue=High&caption=障害一覧&id=tbl-failure]]`,
  );

  assert.match(html, /mmi-table__row--highlight/, 'highlight class must be applied for PDF emphasis');
  assert.match(html, /<tr class="mmi-table__row mmi-table__row--highlight">/);
});

// ── G2: full SIer document structure — release gate table ──────────────────

test('enterprise output: release gate table renders with pending rows highlighted', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/release-gate.csv#Sheet1|A1:F6?header=first&highlightColumn=Status&highlightValue=pending&caption=リリース判定表&id=tbl-release-gate&pageBreak=before]]`,
  );

  assert.match(html, /<figure class="mmi-embed" id="tbl-release-gate" data-page-break="before">/);
  assert.match(html, /<figcaption class="mmi-embed__caption">リリース判定表<\/figcaption>/);
  assert.match(html, /mmi-table__row--highlight/);
  assert.doesNotMatch(html, /<p>/);
});

// ── G3: data integrity — CSV files are not modified after rendering ────────

test('enterprise output (G3): rendering does not modify source CSV files', () => {
  // NOTE: this used to wrap the assertions in an unawaited dynamic
  // `import('node:fs').then(...)` — the test body returned before the promise
  // resolved, so assertion failures could never fail the test and the G3 gate
  // evidence was citing a vacuous check. Synchronous now: the assertion is
  // guaranteed to execute within the test.
  const csvPath = path.join(FIXTURE_ROOT, 'data/sier-design/req-trace.csv');
  const before = fs.readFileSync(csvPath, 'utf-8');

  buildMd().render(`![[${SIER_DIR}/req-trace.csv#Sheet1|A1:H9?header=first]]`);

  const after = fs.readFileSync(csvPath, 'utf-8');
  assert.equal(after, before, 'source CSV must be identical before and after rendering (read-only guarantee)');
});

// ── G4: invalid / unsupported values are silently dropped (safe degradation) ─

test('enterprise output (G4): invalid pageBreak value is silently dropped', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/state-transition.csv#Sheet1|A1:F6?header=first&id=tbl-invalid-pb&pageBreak=invalid_value]]`,
  );

  // Invalid value must not appear in the HTML — degraded safely without error
  assert.doesNotMatch(html, /data-page-break/, 'invalid pageBreak value must be dropped silently');
  assert.match(html, /<figure class="mmi-embed" id="tbl-invalid-pb">/, 'figure must still be rendered');
  assert.match(html, /<table class="mmi-table">/);
});

test('enterprise output (G4): invalid orientation value is silently dropped', () => {
  const html = buildMd().render(
    `![[${SIER_DIR}/state-transition.csv#Sheet1|A1:F6?header=first&id=tbl-invalid-ori&orientation=sideways]]`,
  );

  assert.doesNotMatch(html, /data-orientation/, 'invalid orientation value must be dropped silently');
  assert.match(html, /<figure class="mmi-embed" id="tbl-invalid-ori">/);
});
