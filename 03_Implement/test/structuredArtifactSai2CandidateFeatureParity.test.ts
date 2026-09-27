import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MMI =
  'structured-artifact-sai2-fit-mmi-candidate-local-features-v0.json';
const EXCEL =
  'structured-artifact-sai2-fit-excel-candidate-local-features-v0.json';
const PARITY =
  'structured-artifact-sai2-fit-candidate-local-feature-parity-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('SAI-2A candidate-local feature parity is 16 of 16', () => {
  const mmi = readJson(MMI);
  const excel = readJson(EXCEL);
  const parity = readJson(PARITY);
  const spec = readJson(SPEC);

  assert.deepEqual(
    parity.ordered_features,
    spec.input_contract.ordered_features,
  );
  assert.equal(parity.source_family_group_count, 10);
  assert.equal(parity.candidate_row_count, 16);

  const mmiFamilies = new Map(
    mmi.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );
  const excelFamilies = new Map(
    excel.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  let compared = 0;
  for (const family of parity.cases) {
    const left: any = mmiFamilies.get(
      family.source_family_id,
    );
    const right: any = excelFamilies.get(
      family.source_family_id,
    );
    assert.ok(left);
    assert.ok(right);
    assert.equal(
      left.source_digest,
      family.source_digest,
    );
    assert.equal(
      right.source_digest,
      family.source_digest,
    );

    for (const candidate of family.candidates) {
      const l = left.candidates.find(
        (entry: any) =>
          entry.ordinal === candidate.ordinal,
      );
      const r = right.candidates.find(
        (entry: any) =>
          entry.ordinal === candidate.ordinal,
      );
      assert.ok(l);
      assert.ok(r);
      assert.deepEqual(l.range, candidate.range);
      assert.deepEqual(r.range, candidate.range);
      assert.deepEqual(
        l.portable_values,
        candidate.mmi_portable_values,
      );
      assert.deepEqual(
        r.portable_values,
        candidate.excel_portable_values,
      );
      assert.deepEqual(
        l.portable_values,
        r.portable_values,
      );
      assert.equal(
        candidate.portable_values_equal,
        true,
      );
      compared += 1;
    }
  }

  assert.equal(compared, 16);
  assert.deepEqual(parity.decision, {
    candidate_identity_parity: true,
    portable_semantic_parity: true,
    candidate_local_feature_parity_count: 16,
    candidate_local_feature_parity_rate: 1,
    ranker_specification_frozen: true,
    training_admitted: true,
  });
});

test('parity closeout admits fit only and keeps later gates closed', () => {
  const parity = readJson(PARITY);

  assert.deepEqual(parity.boundary, {
    targets_used_for_feature_extraction: false,
    labels_attached: false,
    ranker_fit_performed: false,
    model_selection_sources_materialized: false,
    selection_scoring_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(parity.next_gate, {
    name: 'fit_frozen_sai2_ranker_candidates_on_fit_candidate_rows',
    training_admitted: true,
    model_selection_materialization_admitted: false,
    ranking_admitted: false,
  });
});
