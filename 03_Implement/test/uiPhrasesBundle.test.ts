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
    'hidden · ',
    'not shown by Excel · ',
    '{0}tables: {1}',
    '{0} · {1} rows{2}',
    ' · caution',
    'Excel table (declared in the book)',
    'table inferred from the structure',
    'Names: {0}',
    'Caution: {0}',
    '({0}, no header)',
    'column {0}',
    'MMI: Could not read {0}: {1}',
    'MMI: Choose the columns of {0} (by header)',
    'MMI: Choose at least one column.',
    'All rows',
    'Rows containing text',
    'grep (a partial match anywhere in the shown columns)',
    'The first N rows',
    'MMI: Choose the rows',
    'MMI: Containing text',
    'e.g. on hold, NG, to check',
    '(any column works)',
    'MMI: Which column contains it (rows contained in other columns are shown as well)',
    'MMI: Number of rows',
    'A whole number of 1 or more',
    'MMI: Open the Markdown document that receives the reference, place the cursor, and run again.',
    ' (candidates: {0})',
    'MMI: Indexing the tables of the workspace',
    'MMI: Some books are left unindexed because the number of tables reached the cap ({0} tables).',
    'Remember',
    'MMI: Remember "{0}" as an abbreviation for this table ({1})? From the next search on, "{0}" also finds it. It is saved in the setting {2}.',
    'Only this time',
    'MMI: The full name of "{0}"',
    'Register it with words contained in the name of the table (you can check and fix it afterwards)',
    'MMI: The full name must be 2 to 40 characters. Not registered.',
    'MMI: Put the document inside a workspace folder to find a table by description.',
    'MMI: Find a table by description ({0} indexed)',
    'e.g. {0}',
    'Example input (choosing one puts it into the box)',
    'Example input',
    '$(error) Searching the tables failed',
    'Headers: {0}',
    'This request cannot be expressed in MMI notation',
    'Be a bit more specific about the name of the table',
    'No matching table was found',
    'Tables that may be close (their names do not match)',
    'It saves the number of searches, the outcome, the rank and fit, the results of alias suggestion, and, only with the explicit setting, the final request text.',
    'It saves only the number of searches, the outcome, the rank and fit, and the results of alias suggestion. It does not save request text, table names, file names, or user names.',
    'MMI: It records the demand observation of table search locally in this workspace.\n{0}\nIt sends nothing outside the machine.',
    'Accept',
    'MMI: Open a workspace before using the search observation.',
    'MMI: Could not read the search observation records: {0}',
    'MMI: Export the count summary of the search observation',
    'Export',
    'MMI: Exported the count summary of the search observation. It does not contain request text.',
    'Erase',
    'MMI: Erase all observation records of table search in this workspace.',
    'MMI: Could not erase the search observation records: {0}',
    'MMI: Erased the observation records of table search.',
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
      // The scan reads the escape sequences as written in code; the bundle keys hold their values.
      uiTextSentences.add(match[2].replace(/\\([nt])/gu, (_, c) => (c === 'n' ? '\n' : '\t')));
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
