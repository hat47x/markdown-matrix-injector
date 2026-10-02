import type {
  Candidate,
  CandidateKind,
  EpistemicStatus,
  ExecutionProperty,
} from '../core/candidate.js';

export type CandidateReviewFacetSelection =
  | { axis: 'kind'; value: CandidateKind }
  | { axis: 'status'; value: EpistemicStatus }
  | { axis: 'execution'; value: ExecutionProperty };

export interface CandidateReviewFacetFilter {
  kinds: readonly CandidateKind[];
  statuses: readonly EpistemicStatus[];
  executions: readonly ExecutionProperty[];
}

const KIND_ORDER: readonly CandidateKind[] = [
  'table-range',
  'image',
  'region-snapshot',
  'shape',
  'diagram',
  'tree',
  'choice-list',
  'note',
  'link',
  'section',
];

const STATUS_ORDER: readonly EpistemicStatus[] = [
  'observed',
  'inferred',
  'abstained',
];

const EXECUTION_ORDER: readonly ExecutionProperty[] = [
  'deterministic',
  'provider-dependent',
];

export function candidateReviewFacetFilter(
  selections: readonly CandidateReviewFacetSelection[],
): CandidateReviewFacetFilter {
  const kinds: CandidateKind[] = [];
  const statuses: EpistemicStatus[] = [];
  const executions: ExecutionProperty[] = [];

  for (const selection of selections) {
    switch (selection.axis) {
      case 'kind':
        if (!kinds.includes(selection.value)) kinds.push(selection.value);
        break;
      case 'status':
        if (!statuses.includes(selection.value)) statuses.push(selection.value);
        break;
      case 'execution':
        if (!executions.includes(selection.value)) {
          executions.push(selection.value);
        }
        break;
    }
  }

  return { kinds, statuses, executions };
}

export function availableCandidateReviewFacets(
  candidates: readonly Pick<Candidate, 'kind' | 'status' | 'execution'>[],
): CandidateReviewFacetSelection[] {
  const kinds = new Set(candidates.map((candidate) => candidate.kind));
  const statuses = new Set(candidates.map((candidate) => candidate.status));
  const executions = new Set(
    candidates.map((candidate) => candidate.execution),
  );

  return [
    ...KIND_ORDER
      .filter((value) => kinds.has(value))
      .map((value) => ({ axis: 'kind' as const, value })),
    ...STATUS_ORDER
      .filter((value) => statuses.has(value))
      .map((value) => ({ axis: 'status' as const, value })),
    ...EXECUTION_ORDER
      .filter((value) => executions.has(value))
      .map((value) => ({ axis: 'execution' as const, value })),
  ];
}

export function matchesCandidateReviewFacets(
  candidate: Pick<Candidate, 'kind' | 'status' | 'execution'>,
  filter: CandidateReviewFacetFilter,
): boolean {
  return (
    (filter.kinds.length === 0 || filter.kinds.includes(candidate.kind))
    && (
      filter.statuses.length === 0
      || filter.statuses.includes(candidate.status)
    )
    && (
      filter.executions.length === 0
      || filter.executions.includes(candidate.execution)
    )
  );
}
