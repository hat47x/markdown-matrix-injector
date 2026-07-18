export type AutocompleteStage = 'filepath' | 'sheet-or-range' | 'query-params';

export type AutocompleteCandidateKind = 'file' | 'sheet' | 'range' | 'query-param';

export interface AutocompleteCandidate {
  label: string;
  insertText: string;
  kind: AutocompleteCandidateKind;
}

export interface AutocompleteCandidateSets {
  files: readonly string[];
  sheets: readonly string[];
  ranges?: readonly string[];
  queryParams?: readonly string[];
}

export interface AutocompleteDependencyProfile {
  stage: AutocompleteStage;
  requiresWorkspaceFileList: boolean;
  requiresWorkbookMetadata: boolean;
  usesQueryParamCatalog: boolean;
}

interface AutocompleteContext {
  stage: AutocompleteStage;
  fragment: string;
  queryParamFragment?: string;
  usedQueryParams: readonly string[];
  sheetOrRangeTarget?: 'sheet' | 'range';
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

function getPathAndTarget(embedBody: string): string {
  return embedBody.split(']]', 1)[0] ?? '';
}

function createAutocompleteContext(input: string): AutocompleteContext {
  const embedBody = extractEmbedBody(input);
  const pathAndTarget = getPathAndTarget(embedBody);
  const queryIndex = pathAndTarget.indexOf('?');

  if (queryIndex >= 0) {
    const queryText = pathAndTarget.slice(queryIndex + 1);
    const querySegments = queryText.split('&');
    const activeSegment = querySegments.at(-1) ?? '';
    const usedQueryParams = querySegments
      .slice(0, -1)
      .map((segment) => segment.split('=', 1)[0] ?? '')
      .filter((segment) => segment.length > 0);

    if (activeSegment.includes('=')) {
      const activeParamName = activeSegment.split('=', 1)[0] ?? '';

      if (activeParamName.length > 0) {
        usedQueryParams.push(activeParamName);
      }
    }

    return {
      stage: 'query-params',
      fragment: queryText,
      queryParamFragment: activeSegment.split('=', 1)[0] ?? '',
      usedQueryParams,
    };
  }

  const rangeIndex = pathAndTarget.indexOf('|');

  if (rangeIndex >= 0) {
    return {
      stage: 'sheet-or-range',
      fragment: pathAndTarget.slice(rangeIndex + 1),
      usedQueryParams: [],
      sheetOrRangeTarget: 'range',
    };
  }

  const sheetIndex = pathAndTarget.indexOf('#');

  if (sheetIndex >= 0) {
    return {
      stage: 'sheet-or-range',
      fragment: pathAndTarget.slice(sheetIndex + 1),
      usedQueryParams: [],
      sheetOrRangeTarget: 'sheet',
    };
  }

  return {
    stage: 'filepath',
    fragment: pathAndTarget,
    usedQueryParams: [],
  };
}

export function classifyAutocompleteStage(input: string): AutocompleteStage {
  return createAutocompleteContext(input).stage;
}

export function getAutocompleteDependencyProfile(input: string): AutocompleteDependencyProfile {
  const stage = createAutocompleteContext(input).stage;

  switch (stage) {
    case 'filepath':
      return {
        stage,
        requiresWorkspaceFileList: true,
        requiresWorkbookMetadata: false,
        usesQueryParamCatalog: false,
      };
    case 'sheet-or-range':
      return {
        stage,
        requiresWorkspaceFileList: false,
        requiresWorkbookMetadata: true,
        usesQueryParamCatalog: false,
      };
    case 'query-params':
      return {
        stage,
        requiresWorkspaceFileList: false,
        requiresWorkbookMetadata: false,
        usesQueryParamCatalog: true,
      };
  }
}

function toCandidates(values: readonly string[], kind: AutocompleteCandidateKind): AutocompleteCandidate[] {
  return values.map((value) => ({
    label: value,
    insertText: value,
    kind,
  }));
}

function normalizeFragment(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function filterByFragment(values: readonly string[], fragment: string): string[] {
  const normalizedFragment = normalizeFragment(fragment);

  if (normalizedFragment.length === 0) {
    return [...values];
  }

  return values.filter((value) => value.toLowerCase().includes(normalizedFragment));
}

function getDefaultQueryParamCandidates(): AutocompleteCandidate[] {
  return DEFAULT_QUERY_PARAM_CANDIDATES.map((value) => ({
    label: value,
    insertText: `${value}=`,
    kind: 'query-param',
  }));
}

function getQueryParamCandidates(
  context: AutocompleteContext,
  candidateSets: AutocompleteCandidateSets,
): AutocompleteCandidate[] {
  const source = candidateSets.queryParams ?? DEFAULT_QUERY_PARAM_CANDIDATES;
  const filtered = filterByFragment(source, context.queryParamFragment ?? '').filter(
    (value) => !context.usedQueryParams.includes(value),
  );

  return filtered.map((value) => ({
    label: value,
    insertText: `${value}=`,
    kind: 'query-param',
  }));
}

export function getAutocompleteCandidates(
  input: string,
  candidateSets: AutocompleteCandidateSets,
): AutocompleteCandidate[] {
  const context = createAutocompleteContext(input);

  switch (context.stage) {
    case 'filepath':
      return toCandidates(filterByFragment(candidateSets.files, context.fragment), 'file');
    case 'sheet-or-range':
      if (context.sheetOrRangeTarget === 'range') {
        return toCandidates(
          filterByFragment(candidateSets.ranges ?? candidateSets.sheets, context.fragment),
          'range',
        );
      }

      return toCandidates(filterByFragment(candidateSets.sheets, context.fragment), 'sheet');
    case 'query-params':
      return getQueryParamCandidates(context, candidateSets);
    default:
      return getDefaultQueryParamCandidates();
  }
}

export const AUTOCOMPLETE_QUERY_PARAM_CANDIDATES = [...DEFAULT_QUERY_PARAM_CANDIDATES];
