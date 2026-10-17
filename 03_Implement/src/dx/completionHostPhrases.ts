/**
 * The completion explanations (parameter summaries, range details) in the
 * bundle's language. The host passes `hostCompletionPhrases` into the pure
 * candidate builders; `l10n` keys are the English reference sentences and the
 * Japanese wording is kept verbatim in `l10n/bundle.l10n.ja.json`.
 */
import type { CompletionPhrases } from './completionCandidates.js';
import { uiText } from './uiPhrases.js';

export const hostCompletionPhrases: CompletionPhrases = {
  paramDocs: {
    mode: {
      summary: uiText('Fixes how the sheet is shown (auto-judged from its size when omitted)'),
      values: { table: uiText('Show it as a table'), card: uiText('Show it as a card sheet') },
    },
    header: {
      summary: uiText('Header row (no header when omitted)'),
      values: {
        first: uiText('Make the first row the header'),
        none: uiText('No header'),
        '1': uiText('Make converted row n the header (starting from 1)'),
      },
    },
    columns: { summary: uiText('Columns to keep (relative column letters inside the range, e.g. A,C)') },
    transpose: { summary: uiText('Transpose rows and columns'), values: { true: uiText('transpose') } },
    grep: { summary: uiText('Keep only rows whose body cell contains it somewhere (partial match, case-insensitive)') },
    highlightColumn: { summary: uiText('Column whose match is highlighted (header name, or the column letter)') },
    highlightValue: { summary: uiText('Value to highlight (outer whitespace and case are ignored)') },
    formatColumn: { summary: uiText('Show a cell as code (column:format, repeatable)') },
    caption: { summary: uiText('Caption of the figure (delivery profile)') },
    id: { summary: uiText('Cross-reference ID (delivery profile)') },
    pageBreak: {
      summary: uiText('Page break (delivery profile)'),
      values: {
        before: uiText('Break the page before'),
        after: uiText('Break the page after'),
        both: uiText('Break the page before and after'),
      },
    },
    orientation: {
      summary: uiText('Paper orientation (delivery profile)'),
      values: { landscape: uiText('landscape'), portrait: uiText('portrait') },
    },
  },
  mergedColumns: (headers) => uiText('Shows one column of the merged table at a time ({0})', headers),
  headerName: () => uiText('header name'),
  formatColumnPrompt: () => uiText('Continue typing the format (e.g. json)'),
  mergedTableHint: (needs) => uiText(' (merged table: to show it as a table, use {0})', needs),
  regionFallback: () => uiText('table region'),
  usedRange: () => uiText('the whole used range of the sheet'),
};
