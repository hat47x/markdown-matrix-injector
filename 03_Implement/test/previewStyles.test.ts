import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every class/attribute the renderers emit (src/core/renderTable.ts,
 * renderCard.ts, renderEmbedFrame.ts and the plugin error path). Keep this list
 * in sync when a renderer introduces a new class so the preview stylesheet can
 * never silently drift out of coverage.
 */
const REQUIRED_SELECTORS = [
  '.mmi-embed',
  '.mmi-embed__caption',
  '.mmi-table',
  '.mmi-table__row--highlight',
  '.mmi-table__cell',
  '.mmi-table__cell--formatted',
  '.mmi-table__cell-code',
  '.mmi-card',
  '.mmi-card__title',
  '.mmi-card__meta',
  '.mmi-card__open',
  '.mmi-error',
  '[data-page-break="before"]',
  '[data-page-break="after"]',
  '[data-page-break="both"]',
  '[data-orientation="landscape"]',
  '[data-orientation="portrait"]',
];

test('package.json contributes the preview stylesheet to the Markdown preview', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8')) as {
    contributes?: { 'markdown.previewStyles'?: unknown };
  };
  const previewStyles = pkg.contributes?.['markdown.previewStyles'];

  assert.ok(Array.isArray(previewStyles), 'contributes.markdown.previewStyles must be an array');
  assert.ok(
    (previewStyles as string[]).includes('./media/markdown-matrix.css'),
    'preview styles must include ./media/markdown-matrix.css',
  );
  for (const rel of previewStyles as string[]) {
    assert.ok(fs.existsSync(path.resolve(rel)), `contributed preview style not found on disk: ${rel}`);
  }
});

test('preview stylesheet covers every class/attribute emitted by the renderers', () => {
  const css = fs.readFileSync(path.resolve('media/markdown-matrix.css'), 'utf-8');
  for (const selector of REQUIRED_SELECTORS) {
    assert.ok(css.includes(selector), `preview CSS is missing a rule for ${selector}`);
  }
});

test('preview stylesheet applies print page-break and orientation controls', () => {
  const css = fs.readFileSync(path.resolve('media/markdown-matrix.css'), 'utf-8');
  assert.match(css, /@media print/);
  assert.match(css, /page-break-before:\s*always/);
  assert.match(css, /page-break-after:\s*always/);
  assert.match(css, /@page\s+landscape/);
  assert.match(css, /page:\s*landscape/);
});
