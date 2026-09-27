import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const R = new URL('./fixtures/', import.meta.url);
const M =
  'structured-artifact-sai2-final-holdout-mmi-candidate-local-features-v0.json';
const E =
  'structured-artifact-sai2-final-holdout-excel-candidate-local-features-v0.json';
const P =
  'structured-artifact-sai2-final-holdout-candidate-local-feature-parity-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, R), 'utf8'));
}

test('final holdout portable feature parity is seven of seven', () => {
  const mmi = j(M);
  const excel = j(E);
  const parity = j(P);
  const mmiBy = new Map(
    mmi.cases.map((item: any) => [item.source_family_id, item]),
  );
  const excelBy = new Map(
    excel.cases.map((item: any) => [item.source_family_id, item]),
  );
  let compared = 0;

  for (const family of parity.cases) {
    const left: any = mmiBy.get(family.source_family_id);
    const right: any = excelBy.get(family.source_family_id);
    assert.ok(left);
    assert.ok(right);
    for (const item of family.candidates) {
      const l = left.candidates.find(
        (x: any) => x.ordinal === item.ordinal,
      );
      const r = right.candidates.find(
        (x: any) => x.ordinal === item.ordinal,
      );
      assert.ok(l);
      assert.ok(r);
      assert.deepEqual(l.portable_values, r.portable_values);
      assert.deepEqual(
        l.portable_values,
        item.mmi_portable_values,
      );
      assert.deepEqual(
        r.portable_values,
        item.excel_portable_values,
      );
      assert.equal(item.portable_values_equal, true);
      compared += 1;
    }
  }
  assert.equal(compared, 7);
  assert.equal(
    parity.decision.candidate_local_feature_parity_rate,
    1,
  );
});

test('parity mirror admits labels/scoring but does not score', () => {
  const parity = j(P);
  assert.equal(
    parity.decision.winner_candidate_id,
    'rules-v0',
  );
  assert.equal(
    parity.decision.final_holdout_scoring_admitted,
    true,
  );
  assert.equal(
    parity.boundary.labels_attached,
    false,
  );
  assert.equal(
    parity.boundary.final_holdout_scoring_performed,
    false,
  );
  assert.equal(
    parity.boundary.winner_change_performed,
    false,
  );
});
