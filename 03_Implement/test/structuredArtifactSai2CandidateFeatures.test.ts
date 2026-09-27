import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deriveMmiSai2CandidateLocalFeatures,
  MMI_SAI2_CANDIDATE_LOCAL_FEATURE_ADAPTER_VERSION,
  SAI2_CANDIDATE_LOCAL_FEATURE_ORDER,
} from '../src/experimental/structuredArtifactSai2CandidateFeatures.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MATERIALIZATION =
  'structured-artifact-sai2-fit-mmi-v0.json';
const CANDIDATES =
  'structured-artifact-sai2-fit-mmi-candidate-sets-v0.json';
const CAPTURE =
  'structured-artifact-sai2-fit-mmi-candidate-local-features-v0.json';
const SPEC =
  'structured-artifact-sai2-ranker-specification-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('MMI SAI-2A candidate-local features reproduce from source-only inputs', () => {
  const materialization = readJson(MATERIALIZATION);
  const candidateCapture = readJson(CANDIDATES);
  const capture = readJson(CAPTURE);
  const sources = new Map(
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

  let rowCount = 0;
  for (const family of candidateCapture.cases) {
    const source: any = sources.get(
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
      rowCount += 1;
    }
  }

  assert.equal(rowCount, 16);
  assert.equal(capture.aggregate.candidate_row_count, 16);
});

test('candidate-local capture matches the frozen ranker input contract', () => {
  const spec = readJson(SPEC);
  const capture = readJson(CAPTURE);

  assert.deepEqual(
    [...SAI2_CANDIDATE_LOCAL_FEATURE_ORDER],
    spec.input_contract.ordered_features,
  );
  assert.deepEqual(
    capture.ordered_features,
    spec.input_contract.ordered_features,
  );
  assert.equal(
    capture.producer.adapter_version,
    MMI_SAI2_CANDIDATE_LOCAL_FEATURE_ADAPTER_VERSION,
  );
  assert.equal(
    capture.ranker_specification_id,
    spec.specification_id,
  );
  assert.equal(
    capture.aggregate.source_family_group_count,
    10,
  );
  assert.equal(
    capture.aggregate.candidate_row_count,
    spec.fit_policy.candidate_row_count,
  );
});

test('candidate-local feature extraction stays target-blind and pre-fit', () => {
  const capture = readJson(CAPTURE);

  assert.deepEqual(capture.boundary, {
    target_fields_supplied_to_feature_extractor: false,
    labels_attached: false,
    candidate_local_feature_capture_performed: true,
    candidate_local_cross_producer_parity_closed: false,
    ranker_fit_performed: false,
    model_selection_sources_materialized: false,
    selection_scoring_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(capture.next_gate, {
    name:
      'excel_independent_fit_candidate_local_feature_capture_and_parity',
    training_admitted: false,
    model_selection_materialization_admitted: false,
    ranking_admitted: false,
  });
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
