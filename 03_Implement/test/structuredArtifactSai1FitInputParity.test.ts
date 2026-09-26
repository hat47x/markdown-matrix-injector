import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MMI =
  'structured-artifact-sai1-fit-tranche-a-mmi-input-evidence-v0.json';
const EXCEL =
  'structured-artifact-sai1-fit-tranche-a-excel-input-evidence-v0.json';
const CLOSEOUT =
  'structured-artifact-sai1-fit-tranche-a-input-parity-closeout-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function digest(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('tranche A closeout binds exact MMI and Excel input evidence', () => {
  const closeout = readJson(CLOSEOUT);

  assert.equal(digest(MMI), closeout.evidence.mmi_digest);
  assert.equal(digest(EXCEL), closeout.evidence.excel_digest);
  assert.equal(closeout.evidence.equal_source_family_count, 4);
});

test('all five portable values match across independent producers for 4/4 families', () => {
  const mmi = readJson(MMI);
  const excel = readJson(EXCEL);
  const closeout = readJson(CLOSEOUT);

  assert.deepEqual(mmi.portable_inputs, excel.portable_inputs);
  assert.deepEqual(mmi.portable_inputs, closeout.portable_inputs);
  assert.deepEqual(
    mmi.excluded_inputs,
    excel.excluded_inputs,
  );
  assert.deepEqual(
    mmi.excluded_inputs,
    ['role.header_candidate_signal'],
  );
  assert.notEqual(
    mmi.producer.repository,
    excel.producer.repository,
  );
  assert.notEqual(
    mmi.producer.body_candidate_method,
    excel.producer.body_candidate_method,
  );

  const mmiByFamily = new Map(
    mmi.cases.map((entry: any) => [
      entry.source_family_id,
      {
        label_status: entry.label_status,
        split: entry.split,
        values: entry.values,
      },
    ]),
  );
  const excelByFamily = new Map(
    excel.cases.map((entry: any) => [
      entry.source_family_id,
      {
        label_status: entry.label_status,
        split: entry.split,
        values: entry.values,
      },
    ]),
  );

  assert.equal(mmiByFamily.size, 4);
  assert.deepEqual(excelByFamily, mmiByFamily);
});

test('parity closeout advances only to remaining fit materialization', () => {
  const closeout = readJson(CLOSEOUT);

  assert.deepEqual(closeout.decision, {
    tranche_a_portable_input_parity: true,
    remaining_fit_materialization_required: true,
    sai_1_model_fit_admitted: false,
  });
  assert.deepEqual(closeout.boundary, {
    model_fit_performed: false,
    threshold_tuning_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(closeout.next_gate, {
    name: 'remaining_preregistered_fit_family_materialization',
    training_admitted: false,
  });
});
