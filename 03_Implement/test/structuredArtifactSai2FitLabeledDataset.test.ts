import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const FEATURES =
  'structured-artifact-sai2-fit-mmi-candidate-local-features-v0.json';
const MATERIALIZATION =
  'structured-artifact-sai2-fit-mmi-v0.json';
const PARITY =
  'structured-artifact-sai2-fit-candidate-local-feature-parity-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';
const DATASET =
  'structured-artifact-sai2-fit-labeled-candidate-dataset-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function exactRange(left: any, right: any): boolean {
  return (
    left !== null
    && right !== null
    && left.row_start === right.row_start
    && left.col_start === right.col_start
    && left.row_end === right.row_end
    && left.col_end === right.col_end
  );
}

test('SAI-2A labels attach only after portable feature parity closes', () => {
  const parity = readJson(PARITY);
  const dataset = readJson(DATASET);

  assert.equal(
    parity.decision.candidate_local_feature_parity_rate,
    1,
  );
  assert.equal(
    parity.decision.training_admitted,
    true,
  );
  assert.equal(
    dataset.candidate_local_parity_id,
    parity.parity_id,
  );
  assert.equal(
    dataset.candidate_local_parity_git_blob_sha,
    '2133a936a50adf460fde60576dd3c768283e7c47',
  );
});

test('SAI-2A labeled dataset preserves all 16 frozen feature rows exactly', () => {
  const features = readJson(FEATURES);
  const dataset = readJson(DATASET);
  const frozen = new Map<string, any>();

  for (const family of features.cases) {
    for (const candidate of family.candidates) {
      frozen.set(
        `${family.source_family_id}#${candidate.ordinal}`,
        candidate,
      );
    }
  }

  assert.equal(frozen.size, 16);
  assert.equal(dataset.rows.length, 16);
  assert.deepEqual(dataset.ordered_features, features.ordered_features);

  for (const row of dataset.rows) {
    const candidate = frozen.get(row.row_id);
    assert.ok(candidate);
    assert.deepEqual(row.range, candidate.range);
    assert.deepEqual(
      row.portable_values,
      candidate.portable_values,
    );
    assert.deepEqual(
      Object.keys(row.portable_values),
      dataset.ordered_features,
    );
  }
});

test('SAI-2A labels reproduce from frozen authored targets only', () => {
  const materialization = readJson(MATERIALIZATION);
  const dataset = readJson(DATASET);
  const byFamily = new Map(
    materialization.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  let positive = 0;
  let negative = 0;
  for (const row of dataset.rows) {
    const entry: any = byFamily.get(row.source_family_id);
    assert.ok(entry);
    const target = readJson(entry.target_ref.split('/').at(-1));
    const exact = exactRange(row.range, target.range);
    const expected =
      target.target_mode === 'clear_target' && exact ? 1 : 0;

    assert.equal(row.label, expected);
    assert.equal(
      row.label_provenance.target_mode,
      target.target_mode,
    );
    assert.equal(
      row.label_provenance.exact_target_rectangle_match,
      exact,
    );
    if (row.label === 1) positive += 1;
    else negative += 1;
  }

  assert.equal(positive, 6);
  assert.equal(negative, 10);
  assert.deepEqual(dataset.aggregate, {
    source_family_group_count: 10,
    candidate_row_count: 16,
    positive_label_count: 6,
    negative_label_count: 10,
  });
});

test('label attachment remains pre-fit and keeps selection/holdout closed', () => {
  const spec = readJson(SPEC);
  const dataset = readJson(DATASET);

  assert.equal(
    dataset.ranker_specification_id,
    spec.specification_id,
  );
  assert.equal(
    dataset.aggregate.candidate_row_count,
    spec.fit_policy.candidate_row_count,
  );
  assert.deepEqual(dataset.boundary, {
    source_only_features_frozen_before_labels: true,
    target_fields_used_only_for_label_attachment: true,
    portable_feature_values_mutated_after_labels: false,
    ranker_fit_performed: false,
    model_selection_sources_materialized: false,
    selection_scoring_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(dataset.next_gate, {
    name: 'excel_exact_labeled_fit_dataset_mirror_then_fit',
    exact_mirror_required_before_fit: true,
    training_admitted: false,
    model_selection_materialization_admitted: false,
    ranking_scoring_admitted: false,
  });
});
