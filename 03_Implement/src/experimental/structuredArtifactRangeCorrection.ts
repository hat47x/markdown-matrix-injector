import type { Sai2CandidateRange } from './structuredArtifactSai2CandidateSet.js';

export const STRUCTURED_ARTIFACT_RANGE_CORRECTION_SCHEMA =
  'hat47x.structured-artifact-range-correction/v0' as const;

export type StructuredArtifactRangeCorrectionInput = {
  source: {
    source_family_id: string;
    source_digest: string;
  };
  target: Sai2CandidateRange;
  proposal: Sai2CandidateRange | null;
};

export type StructuredArtifactRangeCorrection = {
  schema: typeof STRUCTURED_ARTIFACT_RANGE_CORRECTION_SCHEMA;
  source: {
    source_family_id: string;
    source_digest: string;
  };
  proposal_state: 'proposed' | 'abstained';
  exact_match: boolean | null;
  target_cell_count: number;
  proposed_cell_count: number | null;
  intersection_cell_count: number | null;
  over_selected_cell_count: number | null;
  under_selected_cell_count: number | null;
  symmetric_difference_cell_count: number | null;
  boundary_edit_distance: number | null;
  boundary_adjustment_count: number | null;
  target_coverage: number | null;
  context_precision: number | null;
  context_expansion_ratio: number | null;
  intersection_over_union: number | null;
  boundary: {
    geometric_proxy_only: true;
    actual_review_actions_measured: false;
    elapsed_time_measured: false;
    raw_cell_text_used: false;
    product_runtime_authority: false;
  };
};

export type StructuredArtifactRangeCorrectionSummary = {
  observation_count: number;
  proposed_count: number;
  abstained_count: number;
  exact_match_count: number;
  proposed_exact_match_rate: number | null;
  mean_boundary_edit_distance: number | null;
  mean_boundary_adjustment_count: number | null;
  mean_over_selected_cell_count: number | null;
  mean_under_selected_cell_count: number | null;
  mean_context_expansion_ratio: number | null;
  boundary: {
    abstentions_excluded_from_proposal_means: true;
    geometric_proxy_only: true;
    actual_review_actions_measured: false;
    elapsed_time_measured: false;
    product_runtime_authority: false;
  };
};

export function measureStructuredArtifactRangeCorrection(
  input: StructuredArtifactRangeCorrectionInput,
): StructuredArtifactRangeCorrection {
  assertSource(input.source);
  assertRange(input.target, 'target');

  const targetCellCount = cellCount(input.target);
  if (input.proposal === null) {
    return {
      schema: STRUCTURED_ARTIFACT_RANGE_CORRECTION_SCHEMA,
      source: { ...input.source },
      proposal_state: 'abstained',
      exact_match: null,
      target_cell_count: targetCellCount,
      proposed_cell_count: null,
      intersection_cell_count: null,
      over_selected_cell_count: null,
      under_selected_cell_count: null,
      symmetric_difference_cell_count: null,
      boundary_edit_distance: null,
      boundary_adjustment_count: null,
      target_coverage: null,
      context_precision: null,
      context_expansion_ratio: null,
      intersection_over_union: null,
      boundary: correctionBoundary(),
    };
  }

  assertRange(input.proposal, 'proposal');
  const proposedCellCount = cellCount(input.proposal);
  const intersectionCellCount = intersectionCells(input.target, input.proposal);
  const overSelected = proposedCellCount - intersectionCellCount;
  const underSelected = targetCellCount - intersectionCellCount;
  const unionCellCount =
    targetCellCount + proposedCellCount - intersectionCellCount;
  const boundaryDeltas = [
    Math.abs(input.proposal.row_start - input.target.row_start),
    Math.abs(input.proposal.col_start - input.target.col_start),
    Math.abs(input.proposal.row_end - input.target.row_end),
    Math.abs(input.proposal.col_end - input.target.col_end),
  ];
  const exact = boundaryDeltas.every((delta) => delta === 0);

  return {
    schema: STRUCTURED_ARTIFACT_RANGE_CORRECTION_SCHEMA,
    source: { ...input.source },
    proposal_state: 'proposed',
    exact_match: exact,
    target_cell_count: targetCellCount,
    proposed_cell_count: proposedCellCount,
    intersection_cell_count: intersectionCellCount,
    over_selected_cell_count: overSelected,
    under_selected_cell_count: underSelected,
    symmetric_difference_cell_count: overSelected + underSelected,
    boundary_edit_distance:
      boundaryDeltas.reduce((total, delta) => total + delta, 0),
    boundary_adjustment_count:
      boundaryDeltas.filter((delta) => delta !== 0).length,
    target_coverage: intersectionCellCount / targetCellCount,
    context_precision: intersectionCellCount / proposedCellCount,
    context_expansion_ratio: proposedCellCount / targetCellCount,
    intersection_over_union: intersectionCellCount / unionCellCount,
    boundary: correctionBoundary(),
  };
}

export function summarizeStructuredArtifactRangeCorrections(
  observations: readonly StructuredArtifactRangeCorrection[],
): StructuredArtifactRangeCorrectionSummary {
  const proposed = observations.filter(
    (observation) => observation.proposal_state === 'proposed',
  );
  const exactMatchCount = proposed.filter(
    (observation) => observation.exact_match === true,
  ).length;

  return {
    observation_count: observations.length,
    proposed_count: proposed.length,
    abstained_count: observations.length - proposed.length,
    exact_match_count: exactMatchCount,
    proposed_exact_match_rate:
      proposed.length === 0 ? null : exactMatchCount / proposed.length,
    mean_boundary_edit_distance:
      meanDefined(proposed.map((item) => item.boundary_edit_distance)),
    mean_boundary_adjustment_count:
      meanDefined(proposed.map((item) => item.boundary_adjustment_count)),
    mean_over_selected_cell_count:
      meanDefined(proposed.map((item) => item.over_selected_cell_count)),
    mean_under_selected_cell_count:
      meanDefined(proposed.map((item) => item.under_selected_cell_count)),
    mean_context_expansion_ratio:
      meanDefined(proposed.map((item) => item.context_expansion_ratio)),
    boundary: {
      abstentions_excluded_from_proposal_means: true,
      geometric_proxy_only: true,
      actual_review_actions_measured: false,
      elapsed_time_measured: false,
      product_runtime_authority: false,
    },
  };
}

function correctionBoundary(): StructuredArtifactRangeCorrection['boundary'] {
  return {
    geometric_proxy_only: true,
    actual_review_actions_measured: false,
    elapsed_time_measured: false,
    raw_cell_text_used: false,
    product_runtime_authority: false,
  };
}

function cellCount(range: Sai2CandidateRange): number {
  const count = range.row_count * range.col_count;
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Structured-artifact range cell count exceeds safe integer bounds.');
  }
  return count;
}

function intersectionCells(
  left: Sai2CandidateRange,
  right: Sai2CandidateRange,
): number {
  const rows = overlapLength(
    left.row_start,
    left.row_end,
    right.row_start,
    right.row_end,
  );
  const columns = overlapLength(
    left.col_start,
    left.col_end,
    right.col_start,
    right.col_end,
  );
  return rows * columns;
}

function overlapLength(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): number {
  return Math.max(
    0,
    Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) + 1,
  );
}

function meanDefined(values: Array<number | null>): number | null {
  const defined = values.filter((value): value is number => value !== null);
  if (defined.length === 0) {
    return null;
  }
  return defined.reduce((total, value) => total + value, 0) / defined.length;
}

function assertSource(
  source: StructuredArtifactRangeCorrectionInput['source'],
): void {
  if (
    source.source_family_id.length === 0
    || source.source_family_id.trim() !== source.source_family_id
    || !/^sha256:[0-9a-f]{64}$/.test(source.source_digest)
  ) {
    throw new Error('Invalid structured-artifact source binding.');
  }
}

function assertRange(range: Sai2CandidateRange, name: string): void {
  if (
    range.coordinate_system !== 'one_based_inclusive'
    || !Number.isSafeInteger(range.row_start)
    || !Number.isSafeInteger(range.col_start)
    || !Number.isSafeInteger(range.row_end)
    || !Number.isSafeInteger(range.col_end)
    || !Number.isSafeInteger(range.row_count)
    || !Number.isSafeInteger(range.col_count)
    || range.row_start < 1
    || range.col_start < 1
    || range.row_end < range.row_start
    || range.col_end < range.col_start
    || range.row_count !== range.row_end - range.row_start + 1
    || range.col_count !== range.col_end - range.col_start + 1
  ) {
    throw new Error('Invalid structured-artifact ' + name + ' one-based inclusive range.');
  }
}
