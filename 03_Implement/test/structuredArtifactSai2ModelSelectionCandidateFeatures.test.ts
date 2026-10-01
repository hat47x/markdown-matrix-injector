import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deriveMmiSai2CandidateLocalFeatures,
  SAI2_CANDIDATE_LOCAL_FEATURE_ORDER,
} from '../src/experimental/structuredArtifactSai2CandidateFeatures.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MATERIALIZATION =
  'structured-artifact-sai2-model-selection-mmi-v0.json';
const CANDIDATES =
  'structured-artifact-sai2-model-selection-mmi-candidate-sets-v0.json';
const CAPTURE =
  'structured-artifact-sai2-model-selection-mmi-candidate-local-features-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('MMI model-selection candidate-local features reproduce from source only', () => {
  const materialization = readJson(MATERIALIZATION);
  const candidateCapture = readJson(CANDIDATES);
  const capture = readJson(CAPTURE);

  const sourceByFamily = new Map(
    materialization.cases.map((entry: any) => [
      entry.source_family_id,
      readJson(entry.source_ref.split('/').at(-1)),
    ]),
  );
  const frozenByFamily = new Map(
    capture.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  let compared = 0;
  for (const family of candidateCapture.cases) {
    const source: any = sourceByFamily.get(
      family.source_family_id,
    );
    const frozen: any = frozenByFamily.get(
      family.source_family_id,
    );
    assert.ok(source);
    assert.ok(frozen);
    assert.equal(
      frozen.source_digest,
      family.source_digest,
    );

    for (const candidate of family.candidates) {
      const frozenCandidate =
        frozen.candidates.find(
          (entry: any) =>
            entry.ordinal === candidate.ordinal,
        );
      assert.ok(frozenCandidate);
      assert.deepEqual(
        frozenCandidate.range,
        candidate.range,
      );
      assert.deepEqual(
        deriveMmiSai2CandidateLocalFeatures(
          source,
          candidate.range,
        ),
        frozenCandidate.portable_values,
      );
      compared += 1;
    }
  }

  assert.equal(compared, 8);
  assert.deepEqual(capture.aggregate, {
    source_family_group_count: 4,
    candidate_row_count: 8,
  });
});

test('model-selection capture uses only frozen portable inputs', () => {
  const capture = readJson(CAPTURE);
  const spec = readJson(SPEC);

  assert.deepEqual(
    capture.ordered_features,
    [...SAI2_CANDIDATE_LOCAL_FEATURE_ORDER],
  );
  assert.deepEqual(
    capture.ordered_features,
    spec.input_contract.ordered_features,
  );

  for (const family of capture.cases) {
    assert.equal('target' in family, false);
    for (const candidate of family.candidates) {
      assert.equal('label' in candidate, false);
      assert.deepEqual(
        Object.keys(candidate.portable_values),
        capture.ordered_features,
      );
    }
  }
});

test('MMI feature capture keeps selection scoring and holdout closed', () => {
  const capture = readJson(CAPTURE);

  assert.deepEqual(capture.boundary, {
    target_fields_supplied_to_feature_extractor: false,
    labels_attached: false,
    candidate_local_feature_capture_performed: true,
    candidate_local_cross_producer_parity_closed: false,
    selection_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(capture.next_gate, {
    name:
      'excel_independent_model_selection_candidate_local_feature_capture_and_parity',
    selection_scoring_admitted: false,
    final_holdout_open_admitted: false,
  });
});
