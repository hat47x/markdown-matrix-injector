import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enPreviewPhrases } from '../src/dx/embedPreview.js';

const srcDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relative: string): string {
  return fs.readFileSync(path.join(srcDir, relative), 'utf8');
}

const bundlePath = path.join(srcDir, 'l10n', 'bundle.l10n.ja.json');

test('the l10n bundle carries a Japanese wording for every sentence the host puts on screen', () => {
  const bundle = JSON.parse(read(path.join('l10n', 'bundle.l10n.ja.json'))) as Record<string, string>;

  // Sentences the host migrates so far (hover + confirmation summary). The key must match the
  // code's sentence byte for byte -- a typo breaks the lookup silently in English otherwise.
  const expected = [
    ' (with header)',
    'Renders as a table: {0} body rows × {1} columns{2}',
    'Renders as a table: 0 matching rows ({0} columns). No row matched the grep condition.',
    'Renders as a card sheet (no sheet or mode=card, or too many columns or cells for a table)',
    'Error: {0}',
    'Could not determine what this renders as',
    '…and {0} more rows',
    '$(edit) Edit',
    '$(link-external) Open source',
  ];
  for (const key of expected) {
    assert.ok(key in bundle, `bundle must translate: ${JSON.stringify(key)}`);
    assert.ok(bundle[key].length > 0);
    assert.notEqual(bundle[key], key, `bundle must not echo the English reference: ${JSON.stringify(key)}`);
  }

  // Every uiText sentence that exists in the host code is in the bundle.
  const dxFiles = fs.readdirSync(path.join(srcDir, 'src', 'dx')).filter((name) => name.endsWith('.ts'));
  const uiTextSentences = new Set<string>();
  for (const name of dxFiles) {
    const text = read(path.join('src', 'dx', name));
    for (const match of text.matchAll(/uiText\(\n?[ ]*['"`]([^'"`]+)['"`]/gu)) {
      uiTextSentences.add(match[1]);
    }
  }
  assert.ok(uiTextSentences.size >= expected.length, `found the migrated sentences: ${[...uiTextSentences].join(' | ')}`);
  for (const sentence of uiTextSentences) {
    assert.ok(sentence in bundle, `code sentence missing from the bundle: ${JSON.stringify(sentence)}`);
  }

  // The no-host fallback (English reference) must read the same sentence shapes as the bundle keys.
  assert.equal(
    enPreviewPhrases.table(3, 4, true),
    'Renders as a table: 3 body rows × 4 columns (with header)',
  );
  assert.equal(enPreviewPhrases.empty(3), 'Renders as a table: 0 matching rows (3 columns). No row matched the grep condition.');
});
