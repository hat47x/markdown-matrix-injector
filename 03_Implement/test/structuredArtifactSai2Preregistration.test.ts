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
