import test from 'node:test';
import assert from 'node:assert/strict';

import type { Sai2CandidateRange } from '../src/experimental/structuredArtifactSai2CandidateSet.js';
import {
  measureStructuredArtifactRangeCorrection,
  summarizeStructuredArtifactRangeCorrections,
} from '../src/experimental/structuredArtifactRangeCorrection.js';

const SOURCE = {
  source_family_id: 'sai-pv-fixture-v0',
  source_digest: 'sha256:' + 'a'.repeat(64),
};

function measure(
  target: Sai2CandidateRange,
  proposal: Sai2CandidateRange | null,
) {
  return measureStructuredArtifactRangeCorrection({
    source: SOURCE,
    target,
    proposal,
  });
}

function range(
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
): Sai2CandidateRange {
  return {
    coordinate_system: 'one_based_inclusive',
    row_start: rowStart,
    col_start: colStart,
    row_end: rowEnd,
    col_end: colEnd,
    row_count: rowEnd - rowStart + 1,
    col_count: colEnd - colStart + 1,
  };
}

test('exact proposal has zero correction and no context expansion', () => {
  const result = measure(
    range(2, 1, 6, 3),
    range(2, 1, 6, 3),
  );

  assert.deepEqual(
    {
      proposal_state: result.proposal_state,
      exact_match: result.exact_match,
      target_cell_count: result.target_cell_count,
      proposed_cell_count: result.proposed_cell_count,
      intersection_cell_count: result.intersection_cell_count,
      over_selected_cell_count: result.over_selected_cell_count,
      under_selected_cell_count: result.under_selected_cell_count,
      symmetric_difference_cell_count: result.symmetric_difference_cell_count,
      boundary_edit_distance: result.boundary_edit_distance,
      boundary_adjustment_count: result.boundary_adjustment_count,
      target_coverage: result.target_coverage,
      context_precision: result.context_precision,
      context_expansion_ratio: result.context_expansion_ratio,
      intersection_over_union: result.intersection_over_union,
    },
    {
      proposal_state: 'proposed',
      exact_match: true,
      target_cell_count: 15,
      proposed_cell_count: 15,
      intersection_cell_count: 15,
      over_selected_cell_count: 0,
      under_selected_cell_count: 0,
      symmetric_difference_cell_count: 0,
      boundary_edit_distance: 0,
      boundary_adjustment_count: 0,
      target_coverage: 1,
      context_precision: 1,
      context_expansion_ratio: 1,
      intersection_over_union: 1,
    },
  );
});

test('extra title row is visible as one boundary edit and three extra context cells', () => {
  const result = measure(
    range(2, 1, 6, 3),
    range(1, 1, 6, 3),
  );

  assert.equal(result.exact_match, false);
  assert.equal(result.boundary_edit_distance, 1);
  assert.equal(result.boundary_adjustment_count, 1);
  assert.equal(result.over_selected_cell_count, 3);
  assert.equal(result.under_selected_cell_count, 0);
  assert.equal(result.target_coverage, 1);
  assert.equal(result.context_precision, 15 / 18);
  assert.equal(result.context_expansion_ratio, 18 / 15);
});

test('under-selection separates missed target cells from context size', () => {
  const result = measure(
    range(1, 1, 5, 3),
    range(2, 1, 5, 3),
  );

  assert.equal(result.boundary_edit_distance, 1);
  assert.equal(result.boundary_adjustment_count, 1);
  assert.equal(result.over_selected_cell_count, 0);
  assert.equal(result.under_selected_cell_count, 3);
  assert.equal(result.target_coverage, 12 / 15);
  assert.equal(result.context_precision, 1);
  assert.equal(result.context_expansion_ratio, 12 / 15);
});

test('shifted and disjoint ranges report symmetric error without lexical content', () => {
  const shifted = measure(
    range(1, 1, 2, 2),
    range(2, 2, 3, 3),
  );
  assert.equal(shifted.intersection_cell_count, 1);
  assert.equal(shifted.over_selected_cell_count, 3);
  assert.equal(shifted.under_selected_cell_count, 3);
  assert.equal(shifted.symmetric_difference_cell_count, 6);
  assert.equal(shifted.boundary_edit_distance, 4);
  assert.equal(shifted.intersection_over_union, 1 / 7);
  assert.equal(shifted.boundary.raw_cell_text_used, false);

  const disjoint = measure(
    range(1, 1, 2, 2),
    range(4, 4, 5, 5),
  );
  assert.equal(disjoint.intersection_cell_count, 0);
  assert.equal(disjoint.over_selected_cell_count, 4);
  assert.equal(disjoint.under_selected_cell_count, 4);
  assert.equal(disjoint.intersection_over_union, 0);
});

test('abstention is not misreported as zero-cost correction', () => {
  const result = measure(
    range(1, 1, 5, 3),
    null,
  );

  assert.equal(result.proposal_state, 'abstained');
  assert.equal(result.exact_match, null);
  assert.equal(result.proposed_cell_count, null);
  assert.equal(result.boundary_edit_distance, null);
  assert.equal(result.context_expansion_ratio, null);
  assert.equal(result.boundary.geometric_proxy_only, true);
  assert.equal(result.boundary.actual_review_actions_measured, false);
  assert.equal(result.boundary.elapsed_time_measured, false);
});

test('summary keeps abstention denominator separate from proposal correction means', () => {
  const observations = [
    measure(
      range(2, 1, 6, 3),
      range(2, 1, 6, 3),
    ),
    measure(
      range(2, 1, 6, 3),
      range(1, 1, 6, 3),
    ),
    measure(
      range(1, 1, 5, 3),
      null,
    ),
  ];
  const summary = summarizeStructuredArtifactRangeCorrections(observations);

  assert.equal(summary.observation_count, 3);
  assert.equal(summary.proposed_count, 2);
  assert.equal(summary.abstained_count, 1);
  assert.equal(summary.exact_match_count, 1);
  assert.equal(summary.proposed_exact_match_rate, 0.5);
  assert.equal(summary.mean_boundary_edit_distance, 0.5);
  assert.equal(summary.mean_boundary_adjustment_count, 0.5);
  assert.equal(summary.mean_over_selected_cell_count, 1.5);
  assert.equal(summary.mean_under_selected_cell_count, 0);
  assert.equal(summary.mean_context_expansion_ratio, 1.1);
  assert.equal(summary.boundary.abstentions_excluded_from_proposal_means, true);
});

test('source binding rejects missing family identity and non-canonical digest', () => {
  assert.throws(
    () => measureStructuredArtifactRangeCorrection({
      source: {
        source_family_id: '',
        source_digest: SOURCE.source_digest,
      },
      target: range(1, 1, 2, 2),
      proposal: range(1, 1, 2, 2),
    }),
    /Invalid structured-artifact source binding/,
  );
  assert.throws(
    () => measureStructuredArtifactRangeCorrection({
      source: {
        source_family_id: SOURCE.source_family_id,
        source_digest: 'sha256:ABC',
      },
      target: range(1, 1, 2, 2),
      proposal: range(1, 1, 2, 2),
    }),
    /Invalid structured-artifact source binding/,
  );
});

test('invalid range metadata fails closed instead of silently normalizing', () => {
  const invalid: Sai2CandidateRange = {
    coordinate_system: 'one_based_inclusive',
    row_start: 1,
    col_start: 1,
    row_end: 3,
    col_end: 2,
    row_count: 99,
    col_count: 2,
  };

  assert.throws(
    () => measure(invalid, null),
    /Invalid structured-artifact target/,
  );
});
