import type { SheetSource } from '../core/sheetSource.js';
import { detectRegions } from '../search/regionDetector.js';

export const SAI2_CANDIDATE_SET_SCHEMA =
  'hat47x.structured-artifact-sai2-candidate-set/v0' as const;
export const SAI2_CANDIDATE_GENERATOR_ID =
  'sai2-occupancy-blocks-v0' as const;
export const SAI2_MAX_UNIQUE_CANDIDATES = 32;

export type Sai2CandidateRange = {
  coordinate_system: 'one_based_inclusive';
  row_start: number;
  col_start: number;
  row_end: number;
  col_end: number;
  row_count: number;
  col_count: number;
};

export type Sai2CandidateSet = {
  schema: typeof SAI2_CANDIDATE_SET_SCHEMA;
  generator_id: typeof SAI2_CANDIDATE_GENERATOR_ID;
  source: {
    source_digest: string;
    source_family_id: string;
    sheet_or_entity_id: string;
  };
  status: 'ok' | 'generator_ood';
  candidate_count: number;
  candidates: Array<{
    ordinal: number;
    range: Sai2CandidateRange;
  }>;
  boundary: {
    target_fields_supplied: false;
    lexical_inputs_used: false;
    ranking_performed: false;
    product_runtime_authority: false;
  };
};

export function createMmiSai2CandidateSet(args: {
  sheetName: string;
  sheet: SheetSource;
  sourceDigest: string;
  sourceFamilyId: string;
}): Sai2CandidateSet {
  if (!args.sheet.usedRange) {
    return candidateSet(args, 'generator_ood', []);
  }

  const ranges = detectRegions(args.sheetName, args.sheet)
    .map((region) => toOneBasedRange(region.range))
    .sort(compareRanges);

  if (ranges.length > SAI2_MAX_UNIQUE_CANDIDATES) {
    return candidateSet(args, 'generator_ood', []);
  }

  return candidateSet(args, 'ok', ranges);
}

function candidateSet(
  args: {
    sheetName: string;
    sourceDigest: string;
    sourceFamilyId: string;
  },
  status: 'ok' | 'generator_ood',
  ranges: Sai2CandidateRange[],
): Sai2CandidateSet {
  return {
    schema: SAI2_CANDIDATE_SET_SCHEMA,
    generator_id: SAI2_CANDIDATE_GENERATOR_ID,
    source: {
      source_digest: args.sourceDigest,
      source_family_id: args.sourceFamilyId,
      sheet_or_entity_id: args.sheetName,
    },
    status,
    candidate_count: ranges.length,
    candidates: ranges.map((range, index) => ({
      ordinal: index + 1,
      range,
    })),
    boundary: {
      target_fields_supplied: false,
      lexical_inputs_used: false,
      ranking_performed: false,
      product_runtime_authority: false,
    },
  };
}

function toOneBasedRange(range: {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}): Sai2CandidateRange {
  return {
    coordinate_system: 'one_based_inclusive',
    row_start: range.startRow + 1,
    col_start: range.startCol + 1,
    row_end: range.endRow + 1,
    col_end: range.endCol + 1,
    row_count: range.endRow - range.startRow + 1,
    col_count: range.endCol - range.startCol + 1,
  };
}

function compareRanges(
  left: Sai2CandidateRange,
  right: Sai2CandidateRange,
): number {
  return (
    left.row_start - right.row_start
    || left.col_start - right.col_start
    || left.row_end - right.row_end
    || left.col_end - right.col_end
  );
}
