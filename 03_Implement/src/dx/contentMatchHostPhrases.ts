/**
 * The content-match Paste As picker's wording in the bundle's language. The
 * host passes the phrases into the pure builders of `contentMatchSearch.ts`
 * and uses the picker sentence builders directly; `l10n` keys are the English
 * reference sentences and the Japanese wording is kept verbatim in
 * `l10n/bundle.l10n.ja.json`.
 */
import type {
  ContentMatchContextPhrases,
  ContentMatchDetailPhrases,
  ContentMatchIncompletePhrases,
} from './contentMatchSearch.js';
import { uiText } from './uiPhrases.js';

export const hostContentMatchContextPhrases: ContentMatchContextPhrases = {
  emptyValue: () => uiText('(empty)'),
  tableTitle: (value) => uiText('table: {0}', value),
  headers: (value) => uiText('headers: {0}', value),
  values: (value) => uiText('values: {0}', value),
  rowAbove: (value) => uiText('above: {0}', value),
  rowBelow: (value) => uiText('below: {0}', value),
};

export const hostContentMatchDetailPhrases: ContentMatchDetailPhrases = {
  emptyValue: () => uiText('(empty)'),
  headers: (value) => uiText('column headers: {0}', value),
  withinTheRange: (value) => uiText('within the range: {0}', value),
  previousRow: (value) => uiText('previous row: {0}', value),
  nextRow: (value) => uiText('next row: {0}', value),
  previewSeparator: () => uiText(' / '),
  fieldSeparator: () => uiText(' '),
};

export const hostContentMatchIncompletePhrases: ContentMatchIncompletePhrases = {
  detail: (parts) => uiText('The search is not complete ({0}).', parts.join(hostContentMatchIncompletePhrases.listSeparator())),
  unreadableBooks: (count) => uiText('{0} unreadable books', count),
  sheetsPastTheIndexLimit: (count) => uiText('{0} sheets past the index limit', count),
  sheetsAtTheCandidateCap: (count) => uiText('{0} sheets at the candidate cap', count),
  booksPastTheSelectionLimit: (limit) => uiText('more books than the limit of {0} to search', limit),
  cancelled: () => uiText('the search was cancelled'),
  listSeparator: () => uiText(', '),
};

/** The one-off picker sentences (edit title suffixes, descriptions, placeholders, notices). */
export const hostPasteAsContentMatchPicker = {
  confirmedSourceSuffix: () => uiText(' (its source is confirmed)'),
  estimatedSourceSuffix: () => uiText(' (estimated from the contents)'),
  incompleteSearchSuffix: () => uiText(' (the search is incomplete)'),
  confirmedSourceLabel: () => uiText('source confirmed'),
  estimatedSourceLabel: () => uiText('estimated from the contents'),
  insertThisRangePlaceholder: () => uiText('MMI: Insert this range as a reference? (Esc to stop)'),
  chooseFromCandidatesPlaceholder: (count: number) =>
    uiText(
      'MMI: {0} Candidates. The confirmed ones come first. Choose by the surrounding headers and the neighboring rows (Esc to stop)',
      count,
    ),
  failedMessage: (reason: string) => uiText('MMI: Content-match Paste As failed: {0}', reason),
  noMatchMessage: (incomplete: string) =>
    uiText('MMI: Content-match Paste As found no match in the sheets that could be searched. {0}', incomplete),
  searchFailed: (reason: string) => uiText('MMI: Content-match search failed: {0}', reason),
  noRangeWithIncomplete: (detail: string) =>
    uiText('MMI: No matching range was found in the sheets that could be searched. {0}', detail),
  noRangeAtAll: (reasonSuffix: string) => uiText("MMI: No matching range found in this workspace's workbooks.{0}", reasonSuffix),
  partiallySearched: (incomplete: string) =>
    uiText('MMI: Some workbook data could not be searched. The candidate list may be incomplete. {0}', incomplete),
  sourceChangedBeforeInsert: () =>
    uiText('MMI: The selected workbook range changed before insertion. Search again before inserting the reference.'),
};
