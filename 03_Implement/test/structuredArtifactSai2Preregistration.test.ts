import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG =
  'structured-artifact-sai2-preregistration-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-2A preregistration freezes candidate-set semantics before materialization', () => {
  const prereg = readJson(PREREG);

  assert.equal(
    prereg.schema,
    'hat47x.structured-artifact-sai2-preregistration/v0',
  );
  assert.equal(prereg.phase, 'SAI-2A');
  assert.equal(
    prereg.candidate_generator.schema_id,
    'sai2-occupancy-blocks-v0',
  );
  assert.deepEqual(
    prereg.candidate_generator.occupied_sources,
    ['non_empty_cells', 'declared_merge_coverage'],
  );
  assert.equal(
    prereg.candidate_generator.row_band_split,
    'fully_empty_row',
  );
  assert.equal(
    prereg.candidate_generator.column_group_split,
    'fully_empty_column_within_row_band',
  );
  assert.equal(
    prereg.candidate_generator.all_rectangles_enumerated,
    false,
  );
  assert.equal(
    prereg.candidate_generator.lexical_inputs_used,
    false,
  );
  assert.equal(
    prereg.candidate_generator.target_fields_used,
    false,
  );
});

test('SAI-2A split is frozen at 10 fit / 4 selection / 4 final holdout', () => {
  const prereg = readJson(PREREG);
  const counts = new Map<string, number>();
  const ids = new Set<string>();

  for (const group of prereg.groups) {
    assert.equal(ids.has(group.source_family_id), false);
    ids.add(group.source_family_id);
    counts.set(
      group.split,
      (counts.get(group.split) ?? 0) + 1,
    );
    assert.equal(group.materialized, false);
  }

  assert.equal(ids.size, 18);
  assert.equal(counts.get('fit'), 10);
  assert.equal(counts.get('model_selection'), 4);
  assert.equal(counts.get('final_holdout'), 4);

  assert.equal(
    prereg.groups.filter(
      (group: any) =>
        group.split === 'fit'
        && group.target_mode === 'clear_target',
    ).length,
    6,
  );
  assert.equal(
    prereg.groups.filter(
      (group: any) =>
        group.split === 'fit'
        && group.target_mode === 'abstain',
    ).length,
    4,
  );
  assert.equal(
    prereg.groups.filter(
      (group: any) =>
        group.split === 'model_selection'
        && group.target_mode === 'clear_target',
    ).length,
    2,
  );
  assert.equal(
    prereg.groups.filter(
      (group: any) =>
        group.split === 'model_selection'
        && group.target_mode === 'abstain',
    ).length,
    2,
  );
  assert.equal(
    prereg.groups.filter(
      (group: any) =>
        group.split === 'final_holdout'
        && group.target_mode === 'clear_target',
    ).length,
    2,
  );
  assert.equal(
    prereg.groups.filter(
      (group: any) =>
        group.split === 'final_holdout'
        && group.target_mode === 'abstain',
    ).length,
    2,
  );
});

test('SAI-2A excludes lexical search and SAI-1 prediction leakage', () => {
  const prereg = readJson(PREREG);

  for (const excluded of [
    'raw_cell_text',
    'title_text',
    'header_text',
    'value_sample',
    'workbook_name',
    'sheet_name',
    'file_name',
    'mmi_reference_expression',
    'bm25_score',
    'flyhash_score',
    'sai1_prediction',
  ]) {
    assert.ok(prereg.excluded_inputs.includes(excluded));
  }
  assert.ok(
    prereg.portable_ranking_inputs.includes(
      'role.body_candidate_signal',
    ),
  );
  assert.equal(
    prereg.portable_ranking_inputs.some(
      (input: string) =>
        prereg.excluded_inputs.includes(input),
    ),
    false,
  );
});

test('SAI-2A keeps ranking, final holdout, and product authority closed', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.boundary, {
    candidates_generated: false,
    final_holdout_opened: false,
    model_fit_performed: false,
    product_runtime_authority: false,
    ranker_specification_frozen: false,
    selection_scoring_performed: false,
    source_materialization_performed: false,
  });
  assert.deepEqual(prereg.next_gate, {
    name:
      'excel_mirror_preregistration_then_fit_source_materialization',
    ranking_admitted: false,
    training_admitted: false,
  });
});

test('SAI-2A metrics separate candidate coverage from ranking quality', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.metrics.candidate_set, [
    'exact_target_coverage',
    'best_candidate_iou',
    'candidate_count',
    'cross_producer_rectangle_parity',
  ]);
  assert.deepEqual(prereg.metrics.ranking, [
    'exact_range_recall_at_1',
    'exact_range_recall_at_3',
    'mean_iou_non_abstained_clear_targets',
    'false_proposal_rate_on_abstain',
    'abstention_rate_on_clear_targets',
    'p50_latency_ms',
    'p95_latency_ms',
  ]);
});

test('SAI-2A ranking inputs are limited to already portable evidence until candidate-local parity', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.portable_ranking_inputs, [
    'region.row_count',
    'region.col_count',
    'geometry.non_empty_ratio',
    'geometry.merged_cell_count',
    'role.body_candidate_signal',
  ]);
  assert.deepEqual(prereg.deferred_unvalidated_inputs, [
    'detector.header_confidence',
    'detector.title_present',
    'detector.reason.single_row',
    'detector.reason.single_column',
    'detector.reason.contains_merged_cells',
  ]);
  assert.deepEqual(prereg.ranking_input_contract, {
    status: 'provisional_until_candidate_local_cross_producer_parity',
    unvalidated_inputs_must_not_enter_fit_or_scoring: true,
  });
});

test('SAI-2A inherits SAI-1 closeout without satisfying the real-source admission gate', () => {
  const prereg = readJson(PREREG);

  assert.deepEqual(prereg.upstream_sai1, {
    closeout_id: 'sai-1-synthetic-research-closeout-v0',
    closeout_ref:
      '03_Implement/test/fixtures/structured-artifact-sai1-research-closeout-v0.json',
    closeout_git_blob_sha:
      'f151075737b67db3477891864e737008f9b1256e',
    runtime_admission_next_gate:
      'real_source_external_validity_preregistration',
    runtime_admission_remains_blocked: true,
    sai2_research_does_not_satisfy_external_validity_gate: true,
  });
});

test('SAI-2A candidate ordering and OOD limits are frozen before materialization', () => {
  const prereg = readJson(PREREG);
  const generator = prereg.candidate_generator;

  assert.equal(generator.coordinate_system, 'one_based_inclusive');
  assert.deepEqual(generator.stable_order, [
    'row_start', 'col_start', 'row_end', 'col_end',
  ]);
  assert.equal(generator.max_unique_candidates, 32);
  assert.equal(generator.overflow_policy, 'generator_ood_and_abstain');
  assert.equal(generator.empty_source_policy, 'generator_ood_and_abstain');
});
