import {
  deriveMmiStructuredArtifactBodyCandidateSignal,
} from './structuredArtifactBodyCandidateSignal.js';
import type {
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import type {
  Sai2CandidateRange,
} from './structuredArtifactSai2CandidateSet.js';

export const SAI2_CANDIDATE_LOCAL_FEATURE_SCHEMA =
  'hat47x.structured-artifact-sai2-candidate-local-features/v0' as const;

export const MMI_SAI2_CANDIDATE_LOCAL_FEATURE_ADAPTER_VERSION =
  'mmi-sai2-candidate-local-features-v0' as const;

export const SAI2_CANDIDATE_LOCAL_FEATURE_ORDER = [
  'region.row_count',
  'region.col_count',
  'geometry.non_empty_ratio',
  'geometry.merged_cell_count',
  'role.body_candidate_signal',
] as const;

export type Sai2MatchedSource = {
  rows: unknown[][];
  merges: Array<{
    start_row: number;
    start_col: number;
    end_row: number;
    end_col: number;
  }>;
};

export type Sai2CandidateLocalFeatureValues = {
  'region.row_count': number;
  'region.col_count': number;
  'geometry.non_empty_ratio': number;
  'geometry.merged_cell_count': number;
  'role.body_candidate_signal': 'present' | 'absent';
};

export function deriveMmiSai2CandidateLocalFeatures(
  source: Sai2MatchedSource,
  range: Sai2CandidateRange,
): Sai2CandidateLocalFeatureValues {
  assertRange(range);

  let nonEmptyCount = 0;
  const cells: WorksheetFormatSnapshot['cells'] = [];

  for (
    let row = range.row_start;
    row <= range.row_end;
    row += 1
  ) {
    for (
      let column = range.col_start;
      column <= range.col_end;
      column += 1
    ) {
      const raw = source.rows[row - 1]?.[column - 1];
      if (raw === null || raw === undefined) {
        continue;
      }
      const text = String(raw).trim();
      if (text.length === 0) {
        continue;
      }
      nonEmptyCount += 1;
      cells.push({
        row: row - 1,
        column: column - 1,
        text,
      });
    }
  }

  const mergedCellCount = source.merges.filter(
    (merge) =>
      merge.start_row <= range.row_end
      && range.row_start <= merge.end_row
      && merge.start_col <= range.col_end
      && range.col_start <= merge.end_col,
  ).length;

  const snapshot: WorksheetFormatSnapshot = {
    cells,
    merges: source.merges
      .filter(
        (merge) =>
          merge.start_row <= range.row_end
          && range.row_start <= merge.end_row
          && merge.start_col <= range.col_end
          && range.col_start <= merge.end_col,
      )
      .map((merge) => ({
        startRow: merge.start_row - 1,
        startColumn: merge.start_col - 1,
        endRow: merge.end_row - 1,
        endColumn: merge.end_col - 1,
      })),
  };

  return {
    'region.row_count': range.row_count,
    'region.col_count': range.col_count,
    'geometry.non_empty_ratio':
      nonEmptyCount / (range.row_count * range.col_count),
    'geometry.merged_cell_count': mergedCellCount,
    'role.body_candidate_signal':
      deriveMmiStructuredArtifactBodyCandidateSignal(
        snapshot,
      ).value,
  };
}

function assertRange(
  range: Sai2CandidateRange,
): void {
  if (
    range.coordinate_system !== 'one_based_inclusive'
    || range.row_start < 1
    || range.col_start < 1
    || range.row_end < range.row_start
    || range.col_end < range.col_start
    || range.row_count
      !== range.row_end - range.row_start + 1
    || range.col_count
      !== range.col_end - range.col_start + 1
  ) {
    throw new Error(
      'Invalid SAI-2 candidate-local one-based inclusive range.',
    );
  }
}
