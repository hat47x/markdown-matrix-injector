import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const FEATURES =
  'structured-artifact-sai2-model-selection-mmi-candidate-local-features-v0.json';
const MATERIALIZATION =
  'structured-artifact-sai2-model-selection-mmi-v0.json';
const PARITY =
  'structured-artifact-sai2-model-selection-candidate-local-feature-parity-v0.json';
const DATASET =
  'structured-artifact-sai2-model-selection-labeled-candidate-dataset-v0.json';

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

test('model-selection labels attach only after 8/8 feature parity', () => {
  const parity = readJson(PARITY);
  const dataset = readJson(DATASET);

  assert.equal(
    parity.decision.candidate_local_feature_parity_rate,
    1,
  );
  assert.equal(
    parity.decision.selection_label_attachment_admitted,
    true,
  );
  assert.equal(
    dataset.candidate_local_parity_id,
    parity.parity_id,
  );
  assert.equal(
    dataset.candidate_local_parity_git_blob_sha,
    '7c0d6c6feb8d65a0a4a292d2b0bd248e2639c87b',
  );
});

test('model-selection labeled dataset preserves all 8 frozen feature rows', () => {
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

  assert.equal(frozen.size, 8);
  assert.equal(dataset.rows.length, 8);
  assert.deepEqual(
    dataset.ordered_features,
    features.ordered_features,
  );

  for (const row of dataset.rows) {
    const candidate = frozen.get(row.row_id);
    assert.ok(candidate);
    assert.deepEqual(row.range, candidate.range);
    assert.deepEqual(
      row.portable_values,
      candidate.portable_values,
    );
  }
});

test('model-selection labels reproduce from frozen authored targets only', () => {
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
    const target = readJson(
      entry.target_ref.split('/').at(-1),
    );
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

  assert.equal(positive, 2);
  assert.equal(negative, 6);
  assert.deepEqual(dataset.aggregate, {
    source_family_group_count: 4,
    candidate_row_count: 8,
    positive_label_count: 2,
    negative_label_count: 6,
  });
});

test('label attachment does not score rankers or open final holdout', () => {
  const dataset = readJson(DATASET);

  assert.deepEqual(dataset.boundary, {
    source_only_features_frozen_before_labels: true,
    target_fields_used_only_for_label_attachment: true,
    portable_feature_values_mutated_after_labels: false,
    ranker_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(dataset.next_gate, {
    name:
      'excel_exact_model_selection_labeled_dataset_mirror_then_score',
    exact_mirror_required_before_scoring: true,
    selection_scoring_admitted: false,
    final_holdout_open_admitted: false,
  });
});
