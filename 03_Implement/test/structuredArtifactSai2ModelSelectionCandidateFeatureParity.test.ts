import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MMI_CAPTURE =
  'structured-artifact-sai2-model-selection-mmi-candidate-local-features-v0.json';
const EXCEL_CAPTURE =
  'structured-artifact-sai2-model-selection-excel-candidate-local-features-v0.json';
const PARITY =
  'structured-artifact-sai2-model-selection-candidate-local-feature-parity-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('MMI records the closed model-selection candidate-local feature parity', () => {
  const mmi = readJson(MMI_CAPTURE);
  const excel = readJson(EXCEL_CAPTURE);
  const parity = readJson(PARITY);

  const mmiByFamily = new Map(
    mmi.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );
  const excelByFamily = new Map(
    excel.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  let compared = 0;
  for (const family of parity.cases) {
    const left: any = mmiByFamily.get(
      family.source_family_id,
    );
    const right: any = excelByFamily.get(
      family.source_family_id,
    );
    assert.ok(left);
    assert.ok(right);
    assert.equal(
      left.source_digest,
      right.source_digest,
    );
    assert.equal(
      left.source_digest,
      family.source_digest,
    );

    for (const item of family.candidates) {
      const mmiCandidate = left.candidates.find(
        (candidate: any) =>
          candidate.ordinal === item.ordinal,
      );
      const excelCandidate = right.candidates.find(
        (candidate: any) =>
          candidate.ordinal === item.ordinal,
      );
      assert.ok(mmiCandidate);
      assert.ok(excelCandidate);
      assert.deepEqual(
        mmiCandidate.range,
        excelCandidate.range,
      );
      assert.deepEqual(
        mmiCandidate.portable_values,
        excelCandidate.portable_values,
      );
      assert.deepEqual(
        item.mmi_portable_values,
        item.excel_portable_values,
      );
      assert.deepEqual(
        item.mmi_portable_values,
        mmiCandidate.portable_values,
      );
      assert.equal(
        item.portable_values_equal,
        true,
      );
      compared += 1;
    }
  }

  assert.equal(compared, 8);
  assert.deepEqual(parity.decision, {
    candidate_identity_parity: true,
    portable_semantic_parity: true,
    candidate_local_feature_parity_count: 8,
    candidate_local_feature_parity_rate: 1,
    ranker_specification_frozen: true,
    selection_label_attachment_admitted: true,
    selection_scoring_admitted: false,
  });
});

test('feature parity admits label attachment but keeps scoring closed', () => {
  const parity = readJson(PARITY);

  assert.deepEqual(parity.boundary, {
    targets_used_for_feature_extraction: false,
    labels_attached: false,
    ranker_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(parity.next_gate, {
    name:
      'attach_model_selection_labels_then_score_frozen_rankers',
    selection_label_attachment_admitted: true,
    selection_scoring_admitted: false,
    final_holdout_open_admitted: false,
  });
});
