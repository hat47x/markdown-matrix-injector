import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MMI_EVIDENCE =
  'structured-artifact-body-candidate-holdout-mmi-evidence-v0.json';
const EXCEL_EVIDENCE =
  'structured-artifact-body-candidate-holdout-excel-evidence-v0.json';
const ADMISSION =
  'structured-artifact-body-candidate-admission-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function digest(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('SAI-0F closeout binds exact cross-producer holdout evidence', () => {
  const mmi = readJson(MMI_EVIDENCE);
  const excel = readJson(EXCEL_EVIDENCE);
  const admission = readJson(ADMISSION);

  assert.equal(
    digest(MMI_EVIDENCE),
    admission.evidence.mmi_holdout_evidence_digest,
  );
  assert.equal(
    digest(EXCEL_EVIDENCE),
    admission.evidence.excel_holdout_evidence_digest,
  );
  assert.equal(admission.evidence.cross_producer_equal_case_count, 8);
  assert.equal(mmi.cases.length, 8);
  assert.equal(excel.cases.length, 8);

  const mmiValues = new Map(
    mmi.cases.map((entry: any) => [
      entry.source_family_id,
      [entry.label_status, entry.value],
    ]),
  );
  const excelValues = new Map(
    excel.cases.map((entry: any) => [
      entry.source_family_id,
      [entry.label_status, entry.value],
    ]),
  );
  assert.deepEqual(excelValues, mmiValues);
  assert.notEqual(mmi.producer.method, excel.producer.method);
});

test('body candidate is admitted only as supporting portable evidence', () => {
  const admission = readJson(ADMISSION);

  assert.deepEqual(admission.feature, {
    kind: 'categorical',
    name: 'role.body_candidate_signal',
    semantics: 'sai-body-type-transition-v0',
    values: ['present', 'absent'],
  });
  assert.deepEqual(admission.observed_holdout, {
    all_text_clear_positive_signal: 'absent',
    ambiguous: { present: 0, total: 2 },
    clear_negative: { present: 0, total: 3 },
    clear_positive: { present: 2, total: 3 },
  });
  assert.deepEqual(admission.admission, {
    consumed_sai_0f_holdout_fit_eligible: false,
    frozen_sai_0e_observation_rewrite_allowed: false,
    portable_semantic_feature_admitted: true,
    sai_1_model_fit_admitted: false,
    standalone_table_like_classifier: false,
  });
});

test('closeout keeps header candidate excluded and requires a fresh grouped corpus', () => {
  const admission = readJson(ADMISSION);

  assert.deepEqual(admission.excluded_features, [{
    name: 'role.header_candidate_signal',
    portable_model_input: false,
    reason: 'cross-producer value divergence on SAI-0E',
  }]);
  assert.deepEqual(admission.next_gate, {
    name: 'prospective_training_corpus_and_group_split_preregistration',
    requires_group_before_fit: true,
    requires_unconsumed_source_families: true,
  });
  assert.deepEqual(admission.boundary, {
    model_fit_performed: false,
    product_runtime_authority: false,
    training_performed: false,
    winner_selection_performed: false,
  });
  assert.equal(
    digest(ADMISSION),
    'sha256:006a0865a0cce9f2e4607872af1c46fdd2479ab13d8002bafc5b60bf906dd2ef',
  );
});
