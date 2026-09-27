import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const RESULT =
  'structured-artifact-sai1-model-selection-result-v0.json';
const SPEC =
  'structured-artifact-sai1-candidate-specification-v0.json';
const PREREG =
  'structured-artifact-sai1-preregistration-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function balancedAccuracy(rows: any[], candidateId: string): {
  balancedAccuracy: number;
  accuracy: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
} {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const row of rows) {
    const predicted =
      row.predictions[candidateId].decision;
    if (row.target === true && predicted === true) tp += 1;
    if (row.target === false && predicted === false) tn += 1;
    if (row.target === false && predicted === true) fp += 1;
    if (row.target === true && predicted === false) fn += 1;
  }
  const tpr = tp / (tp + fn);
  const tnr = tn / (tn + fp);
  return {
    balancedAccuracy: (tpr + tnr) / 2,
    accuracy: (tp + tn) / rows.length,
    tp,
    tn,
    fp,
    fn,
  };
}

test('SAI-1 selection result uses exactly the frozen candidates and split sizes', () => {
  const result = readJson(RESULT);
  const spec = readJson(SPEC);

  assert.equal(
    result.candidate_specification_id,
    spec.specification_id,
  );
  assert.equal(result.fit.group_count, 10);
  assert.equal(result.fit.rows.length, 10);
  assert.equal(result.selection.group_count, 4);
  assert.equal(result.selection.rows.length, 4);
  assert.deepEqual(
    Object.keys(result.fit.candidates),
    spec.candidates
      .map((candidate: any) => candidate.candidate_id)
      .sort(),
  );
  assert.deepEqual(
    result.input_contract.ordered_features,
    spec.input_contract.ordered_features,
  );
  assert.deepEqual(
    result.input_contract.excluded_features,
    ['role.header_candidate_signal'],
  );
});

test('fit and selection rows contain no locked final-holdout group', () => {
  const result = readJson(RESULT);
  const prereg = readJson(PREREG);
  const locked = new Set(
    prereg.groups
      .filter((group: any) => group.split === 'final_holdout')
      .map((group: any) => group.source_family_id),
  );

  for (const row of [
    ...result.fit.rows,
    ...result.selection.rows,
  ]) {
    assert.equal(locked.has(row.source_family_id), false);
  }
  assert.equal(result.boundary.final_holdout_opened, false);
});

test('rules and logistic selection outputs are reproducible from frozen rows', () => {
  const result = readJson(RESULT);
  const logistic = result.fit.candidates['logistic-l2-v0'];
  const means = logistic.standardization.mean;
  const scales = logistic.standardization.scale;
  const parameters = logistic.parameters;

  for (const row of result.selection.rows) {
    assert.equal(
      row.predictions['rules-v0'].decision,
      row.features[4] === 1,
    );

    const transformed = [
      (row.features[0] - means[0]) / scales[0],
      (row.features[1] - means[1]) / scales[1],
      (row.features[2] - means[2]) / scales[2],
      (row.features[3] - means[3]) / scales[3],
      row.features[4],
    ];
    const linear =
      parameters[0]
      + transformed.reduce(
        (sum: number, value: number, index: number) =>
          sum + value * parameters[index + 1],
        0,
      );
    const probability = sigmoid(linear);
    assert.ok(
      Math.abs(
        probability
        - row.predictions['logistic-l2-v0'].probability,
      ) < 1e-12,
    );
    assert.equal(
      row.predictions['logistic-l2-v0'].decision,
      probability >= 0.5,
    );
  }
});

test('selection metrics and winner follow the preregistered ordering', () => {
  const result = readJson(RESULT);
  const spec = readJson(SPEC);

  for (const metric of result.selection.metrics) {
    const actual = balancedAccuracy(
      result.selection.rows,
      metric.candidate_id,
    );
    assert.equal(actual.balancedAccuracy, metric.balanced_accuracy);
    assert.equal(actual.accuracy, metric.accuracy);
    assert.equal(actual.tp, metric.tp);
    assert.equal(actual.tn, metric.tn);
    assert.equal(actual.fp, metric.fp);
    assert.equal(actual.fn, metric.fn);
  }

  const bestPrimary = Math.max(
    ...result.selection.metrics.map(
      (metric: any) => metric.balanced_accuracy,
    ),
  );
  const primary = result.selection.metrics.filter(
    (metric: any) =>
      metric.balanced_accuracy === bestPrimary,
  );
  const bestSecondary = Math.max(
    ...primary.map((metric: any) => metric.accuracy),
  );
  const tied = new Set(
    primary
      .filter((metric: any) => metric.accuracy === bestSecondary)
      .map((metric: any) => metric.candidate_id),
  );
  const expectedWinner =
    spec.selection_policy.tie_break_order.find(
      (candidateId: string) => tied.has(candidateId),
    );

  assert.equal(
    result.selection.winner.candidate_id,
    expectedWinner,
  );
  assert.equal(expectedWinner, 'rules-v0');
  assert.deepEqual(
    result.selection.winner.tie_break_order,
    spec.selection_policy.tie_break_order,
  );
});

test('LightGBM execution is pinned and final holdout remains unopened', () => {
  const result = readJson(RESULT);
  const lightgbm =
    result.fit.candidates['lightgbm-gbdt-v0'];

  assert.equal(lightgbm.version, '4.6.0');
  assert.equal(lightgbm.num_boost_round, 20);
  assert.match(
    lightgbm.model_text_sha256,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.deepEqual(result.boundary, {
    candidate_addition_after_fit: false,
    final_holdout_opened: false,
    hyperparameter_search_performed: false,
    model_fit_performed: true,
    product_runtime_authority: false,
    refit_after_selection: false,
    selection_scoring_performed: true,
    threshold_tuning_performed: false,
    winner_selection_performed: true,
  });
});
