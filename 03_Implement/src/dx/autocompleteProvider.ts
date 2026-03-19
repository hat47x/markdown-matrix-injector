export type AutocompleteStage = 'filepath' | 'sheet-or-range' | 'query-params';

export type AutocompleteCandidateKind = 'file' | 'sheet' | 'query-param';

export interface AutocompleteCandidate {
  label: string;
  insertText: string;
  kind: AutocompleteCandidateKind;
}

export interface AutocompleteCandidateSets {
  files: readonly string[];
  sheets: readonly string[];
  queryParams?: readonly string[];
}

const DEFAULT_QUERY_PARAM_CANDIDATES = [
  'mode',
  'header',
  'columns',
  'transpose',
  'grep',
  'highlightColumn',
  'highlightValue',
  'formatColumn',
  'caption',
  'id',
  'pageBreak',
  'orientation',
] as const;

function extractEmbedBody(input: string): string {
  const markerIndex = input.lastIndexOf('![[');

  if (markerIndex >= 0) {
    return input.slice(markerIndex + 3);
  }

  return input;
}

export function classifyAutocompleteStage(input: string): AutocompleteStage {
  const embedBody = extractEmbedBody(input);
  const queryIndex = embedBody.indexOf('?');

  if (queryIndex >= 0) {
    return 'query-params';
  }

  const pathAndTarget = embedBody.split(']]', 1)[0] ?? '';
  const hasSheetMarker = pathAndTarget.includes('#');
  const hasRangeMarker = pathAndTarget.includes('|');

  if (hasSheetMarker || hasRangeMarker) {
    return 'sheet-or-range';
  }

  return 'filepath';
}

function toCandidates(values: readonly string[], kind: AutocompleteCandidateKind): AutocompleteCandidate[] {
  return values.map((value) => ({
    label: value,
    insertText: value,
    kind,
  }));
}

function getDefaultQueryParamCandidates(): AutocompleteCandidate[] {
  return toCandidates(DEFAULT_QUERY_PARAM_CANDIDATES, 'query-param');
}

export function getAutocompleteCandidates(
  input: string,
  candidateSets: AutocompleteCandidateSets,
): AutocompleteCandidate[] {
  const stage = classifyAutocompleteStage(input);

  switch (stage) {
    case 'filepath':
      return toCandidates(candidateSets.files, 'file');
    case 'sheet-or-range':
      return toCandidates(candidateSets.sheets, 'sheet');
    case 'query-params':
      return toCandidates(
        candidateSets.queryParams ?? DEFAULT_QUERY_PARAM_CANDIDATES,
        'query-param',
      );
    default:
      return getDefaultQueryParamCandidates();
  }
}

export const AUTOCOMPLETE_QUERY_PARAM_CANDIDATES = [...DEFAULT_QUERY_PARAM_CANDIDATES];
