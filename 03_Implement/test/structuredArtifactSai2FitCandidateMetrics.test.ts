import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MATERIALIZATION = 'structured-artifact-sai2-fit-mmi-v0.json';
const CAPTURE = 'structured-artifact-sai2-fit-mmi-candidate-sets-v0.json';
const PARITY =
  'structured-artifact-sai2-fit-cross-producer-candidate-parity-v0.json';
const METRICS = 'structured-artifact-sai2-fit-candidate-metrics-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function coordinates(range: any): number[] {
  return [
    range.row_start,
    range.col_start,
    range.row_end,
    range.col_end,
  ];
}

function iou(left: any, right: any): number {
  const top = Math.max(left.row_start, right.row_start);
  const leftCol = Math.max(left.col_start, right.col_start);
  const bottom = Math.min(left.row_end, right.row_end);
  const rightCol = Math.min(left.col_end, right.col_end);
  const intersection =
    bottom < top || rightCol < leftCol
      ? 0
      : (bottom - top + 1) * (rightCol - leftCol + 1);
  const leftArea =
    (left.row_end - left.row_start + 1)
    * (left.col_end - left.col_start + 1);
  const rightArea =
    (right.row_end - right.row_start + 1)
    * (right.col_end - right.col_start + 1);
  return intersection / (leftArea + rightArea - intersection);
}

test('SAI-2A fit candidate metrics reproduce from frozen targets and candidates', () => {
  const materialization = readJson(MATERIALIZATION);
  const capture = readJson(CAPTURE);
  const parity = readJson(PARITY);
  const metrics = readJson(METRICS);

  const candidates = new Map(
    capture.cases.map((entry: any) => [entry.source_family_id, entry]),
  );
  const parityByFamily = new Map(
    parity.cases.map((entry: any) => [entry.source_family_id, entry]),
  );
  const metricByFamily = new Map(
    metrics.cases.map((entry: any) => [entry.source_family_id, entry]),
  );

  assert.equal(materialization.materialization_id, 'sai-2a-fit-mmi-v1');
  assert.equal(candidates.size, 10);
  assert.equal(parityByFamily.size, 10);
  assert.equal(metricByFamily.size, 10);

  for (const item of materialization.cases) {
    const targetName = item.target_ref.split('/').at(-1);
    assert.ok(targetName);
    const target = readJson(targetName);
    const candidateSet: any = candidates.get(item.source_family_id);
    const parityCase: any = parityByFamily.get(item.source_family_id);
    const metric: any = metricByFamily.get(item.source_family_id);
    assert.ok(candidateSet);
    assert.ok(parityCase);
    assert.ok(metric);

    assert.equal(metric.target_mode, item.target_mode);
    assert.equal(metric.candidate_count, candidateSet.candidate_count);
    assert.equal(parityCase.rectangles_equal, true);
    assert.equal(parityCase.rectangle_order_equal, true);
    assert.equal(metric.cross_producer_rectangle_parity, true);

    if (item.target_mode === 'clear_target') {
      assert.ok(target.range);
      const exact = candidateSet.candidates.some(
        (candidate: any) =>
          JSON.stringify(coordinates(candidate.range))
          === JSON.stringify(coordinates(target.range)),
      );
      const best = Math.max(
        ...candidateSet.candidates.map(
          (candidate: any) => iou(candidate.range, target.range),
        ),
      );
      assert.equal(metric.exact_target_coverage, exact);
      assert.equal(metric.best_candidate_iou, best);
    } else {
      assert.equal(target.range, null);
      assert.equal(metric.exact_target_coverage, null);
      assert.equal(metric.best_candidate_iou, null);
    }
  }
});

test('fit candidate aggregate records complete coverage without adding a threshold', () => {
  const metrics = readJson(METRICS);

  assert.deepEqual(metrics.aggregate, {
    fit_group_count: 10,
    clear_target_count: 6,
    abstain_count: 4,
    exact_target_coverage_count_clear_only: 6,
    exact_target_coverage_rate_clear_only: 1,
    mean_best_candidate_iou_clear_only: 1,
    candidate_count_total: 16,
    candidate_count_mean: 1.6,
    candidate_count_max: 4,
    generator_ood_count: 0,
    cross_producer_rectangle_parity_count: 10,
    cross_producer_rectangle_parity_rate: 1,
  });
  assert.deepEqual(metrics.interpretation, {
    descriptive_only: true,
    post_hoc_threshold_added: false,
    fit_candidate_coverage_metrics_closed: true,
    ranker_specification_may_be_frozen_next: true,
    ranking_or_selection_scoring_admitted: false,
  });
});

test('coverage closeout keeps unvalidated detector fields and ranking closed', () => {
  const metrics = readJson(METRICS);

  assert.deepEqual(metrics.boundary, {
    candidate_generation_performed: true,
    cross_producer_compared: true,
    target_coverage_metrics_computed: true,
    unvalidated_detector_inputs_used: false,
    ranker_specification_frozen: false,
    ranker_fit_performed: false,
    ranking_scoring_performed: false,
    model_selection_sources_materialized: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(metrics.next_gate, {
    name: 'freeze_sai2_ranker_specification_before_model_selection_materialization',
    ranker_specification_admitted: true,
    ranking_admitted: false,
  });
});
