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

  // Sentences the host migrates so far (hover + the guided authoring flow). The key must
  // match the code's sentence byte for byte -- a typo breaks the lookup silently in
  // English otherwise.
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
    'MMI: This command cannot run inside an unfinished reference. Use completion (Ctrl+Space) or run it outside the reference.',
    'MMI: {0} ({1})',
    'Edit a reference',
    'Create a reference',
    '$(search) Find by description…',
    'e.g. show the ID and actions of a state-transition table',
    'Choose a workbook (finding by description is also available)',
    'Current workbook',
    'Choose a sheet',
    'No particular sheet (whole book, rendered as a card)',
    '$(edit) Enter an A1 range…',
    'State the range as A1 or A1:D20 when it is not in the candidates',
    'Do not specify a range',
    'Whole sheet (card when it is large)',
    'Current range',
    'Choose a range; if it is not in the candidates, enter an A1 range',
    'MMI: The source changed while being read. Reading it again.',
    'MMI: The source changed during the preview. Reading it again.',
    '$(check) Replace',
    '$(check) Insert',
    '$(arrow-left) Back',
    'MMI: Stopped without editing because the document changed during the flow (the document is unchanged).',
    'MMI: The source changed; rebuilding the preview.',
    'Enter the Excel A1 range (e.g. A1 or B3:F20)',
    'State the range as A1 or A1:D20, reading top-left to bottom-right.',
    'Make the first row the header',
    'Show as a table even when it is large',
    'Show as a card sheet',
    'Transpose rows and columns',
    'mode=table and mode=card cannot both be chosen',
    'Display options',
    'Display options (Space to select, Enter to continue). Keys not listed here stay untouched',
    'MMI: Edit this reference…',
    'MMI: Update the expected headers (x-headers) to the current table',
    'Replace with "{0}"',
  ];
  // Sentence shapes that are identical in English and Japanese, so echoing the key is correct.
  const languageNeutral = new Set(['MMI: {0} ({1})']);
  for (const key of expected) {
    assert.ok(key in bundle, `bundle must translate: ${JSON.stringify(key)}`);
    assert.ok(bundle[key].length > 0);
    if (!languageNeutral.has(key)) {
      assert.notEqual(bundle[key], key, `bundle must not echo the English reference: ${JSON.stringify(key)}`);
    }
  }

  // Every uiText sentence that exists in the host code is in the bundle.
  const dxFiles = fs.readdirSync(path.join(srcDir, 'src', 'dx')).filter((name) => name.endsWith('.ts'));
  const uiTextSentences = new Set<string>();
  for (const name of dxFiles) {
    const text = read(path.join('src', 'dx', name));
    for (const match of text.matchAll(/uiText\(\s*(['"`])(.+?)\1/gsu)) {
      uiTextSentences.add(match[2]);
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
