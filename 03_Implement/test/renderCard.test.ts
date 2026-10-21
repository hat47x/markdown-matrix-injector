/**
 * Card open-affordance contract (issue-0100 / ADR-0011).
 *
 * The card must carry BOTH affordances of the hybrid design:
 *  - baseline: title anchor whose href is the author-written relative path
 *    (plain link — survives Strict preview sanitization, works untrusted);
 *  - trusted: an explicit "外部アプリで開く" anchor firing
 *    extension URI with an encoded source path (ADR-0015).
 *
 * The actual click behavior (OS app launching) is webview/GUI-scoped and
 * belongs to manual e2e; these tests freeze the HTML structure the preview
 * and the openSource command depend on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEmbedCard } from '../src/core/renderCard.js';
import { parseEmbedSyntax } from '../src/parser/embedSyntax.js';

function embed(raw: string) {
  const parsed = parseEmbedSyntax(raw);
  assert.ok(parsed, `fixture embed must parse: ${raw}`);
  return parsed;
}

test('renderEmbedCard renders the title as a plain relative link to the source (baseline affordance)', () => {
  const html = renderEmbedCard(embed('![[./data/roles.csv#Sheet1|A1:B3?mode=card]]'), '/ws/docs/data/roles.csv');

  assert.match(html, /<a class="mmi-card__title" href="\.\/data\/roles\.csv">roles\.csv<\/a>/);
});

test('renderEmbedCard routes the open button to the extension URI handler', () => {
  const absolutePath = '/ws/docs/data/roles.csv';
  const html = renderEmbedCard(embed('![[./data/roles.csv#Sheet1|A1:B3?mode=card]]'), absolutePath);

  const expectedArgs = encodeURIComponent(absolutePath);
  assert.ok(
    html.includes(`href="vscode://hat47x.markdown-matrix-injector/open?source=${expectedArgs}"`),
    `extension URI must carry the encoded absolute path\n--- rendered ---\n${html}`,
  );
  assert.match(html, /<a class="mmi-card__open" [^>]+>外部アプリで開く<\/a>/);
});

test('renderEmbedCard keeps the machine-readable data-path and sheet/range meta line', () => {
  const html = renderEmbedCard(embed('![[./roles.csv#Sheet1|A1:B3?mode=card]]'), '/ws/roles.csv');

  assert.match(html, /<div class="mmi-card" data-path="\/ws\/roles\.csv" data-source="\.\/roles\.csv">/);
  assert.match(html, /<div class="mmi-card__meta">Sheet1 \/ A1:B3<\/div>/);
});

test('renderEmbedCard omits the meta line when neither sheet nor range is given', () => {
  const html = renderEmbedCard(embed('![[./roles.csv]]'), '/ws/roles.csv');

  assert.doesNotMatch(html, /mmi-card__meta/);
  assert.match(html, /mmi-card__open/, 'open button must be present even without sheet/range');
});

test('renderEmbedCard HTML-escapes hostile paths in both href and data-path', () => {
  const hostile = '/ws/a"onmouseover="x&<b>.csv';
  const html = renderEmbedCard(embed('![[./roles.csv#Sheet1|A1:B2?mode=card]]'), hostile);

  assert.doesNotMatch(html, /onmouseover="x/, 'raw quote must not terminate the attribute');
  assert.ok(html.includes('data-path="/ws/a&quot;onmouseover=&quot;x&amp;&lt;b&gt;.csv"'));
  // The command URI arguments are URI-encoded before HTML-escaping, so the
  // hostile characters never appear raw inside the href either.
  const commandHref = html.match(/href="(vscode:[^"]+)"/)?.[1] ?? '';
  assert.ok(!commandHref.includes('"'), 'command href must contain no raw quotes');
  const decoded = new URL(commandHref).searchParams.get('source');
  assert.equal(decoded, hostile, 'round-trip decode must recover the exact path');
});

test('renderEmbedCard escapes the author-written relative path used in the baseline link', () => {
  const parsed = embed('![[./a&b.csv#Sheet1|A1:B2?mode=card]]');
  const html = renderEmbedCard(parsed, '/ws/a&b.csv');

  assert.ok(html.includes('href="./a&amp;b.csv"'));
});

test('renderEmbedCard carries the author-written path for print, and export mode drops local paths', () => {
  const parsed = embed('![[./data/roles.csv#Sheet1|A1:B3?mode=card]]');
  assert.match(renderEmbedCard(parsed, '/ws/docs/data/roles.csv'), /data-source="\.\/data\/roles\.csv"/);

  const exported = renderEmbedCard(parsed, '/home/alice/customer-x/docs/data/roles.csv', { forExport: true });
  assert.equal(
    exported,
    '<div class="mmi-card" data-source="./data/roles.csv"><a class="mmi-card__title" href="./data/roles.csv">roles.csv</a><div class="mmi-card__meta">Sheet1 / A1:B3</div></div>',
  );
});
