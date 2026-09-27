import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG =
  'structured-artifact-sai2-preregistration-v0.json';
const MANIFEST =
  'structured-artifact-sai2-model-selection-mmi-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function sha256File(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('SAI-2A materializes exactly the four preregistered selection groups', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const planned = prereg.groups
    .filter((group: any) => group.split === 'model_selection')
    .map((group: any) => [group.source_family_id, group.target_mode])
    .sort();
  const actual = manifest.cases
    .map((entry: any) => [entry.source_family_id, entry.target_mode])
    .sort();

  assert.equal(manifest.cases.length, 4);
  assert.deepEqual(actual, planned);
  assert.equal(
    manifest.cases.filter(
      (entry: any) => entry.target_mode === 'clear_target',
    ).length,
    2,
  );
  assert.equal(
    manifest.cases.filter(
      (entry: any) => entry.target_mode === 'abstain',
    ).length,
    2,
  );
});

test('selection targets bind exact source bytes before candidate generation', () => {
  const manifest = readJson(MANIFEST);

  for (const entry of manifest.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    const targetName = entry.target_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(targetName);
    const source = readJson(sourceName);
    const target = readJson(targetName);

    assert.equal(sha256File(sourceName), entry.source_digest);
    assert.equal(target.source.source_digest, entry.source_digest);
    assert.equal(source.source_family_id, entry.source_family_id);
    assert.equal(target.source.source_family_id, entry.source_family_id);
    assert.equal(target.target_mode, entry.target_mode);
    assert.deepEqual(target.boundary, {
      authored_before_candidate_generation: true,
      blind_to_candidate_generator: true,
      blind_to_ranker: true,
      product_runtime_authority: false,
    });
  }
});

test('selection clear targets and abstain reasons match the semantic freeze', () => {
  const manifest = readJson(MANIFEST);
  const expected = new Map([
    [
      'sai-r2-select-table-with-callout-v0',
      { mode: 'clear_target', range: [1, 1, 5, 4] },
    ],
    [
      'sai-r2-select-table-with-footer-note-v0',
      { mode: 'clear_target', range: [1, 1, 5, 3] },
    ],
    [
      'sai-r2-select-peer-tables-mixed-width-v0',
      { mode: 'abstain', reason: 'multiple_peer_candidates' },
    ],
    [
      'sai-r2-select-form-and-banner-v0',
      { mode: 'abstain', reason: 'non_tabular' },
    ],
  ]);

  for (const entry of manifest.cases) {
    const targetName = entry.target_ref.split('/').at(-1);
    assert.ok(targetName);
    const target = readJson(targetName);
    const frozen: any = expected.get(entry.source_family_id);
    assert.ok(frozen);
    assert.equal(target.target_mode, frozen.mode);
    if (frozen.mode === 'clear_target') {
      assert.deepEqual(
        [
          target.range.row_start,
          target.range.col_start,
          target.range.row_end,
          target.range.col_end,
        ],
        frozen.range,
      );
      assert.equal(target.abstain_reason, null);
    } else {
      assert.equal(target.range, null);
      assert.equal(target.abstain_reason, frozen.reason);
    }
  }
});

test('selection source materialization remains blind to fitted scores and keeps later gates closed', () => {
  const manifest = readJson(MANIFEST);

  assert.deepEqual(manifest.boundary, {
    source_materialization_performed: true,
    fitted_parameters_or_scores_used_for_source_authoring: false,
    candidate_generation_performed: false,
    candidate_local_feature_capture_performed: false,
    ranking_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(manifest.next_gate, {
    name: 'excel_exact_model_selection_source_target_mirror',
    candidate_generation_admitted: false,
    selection_scoring_admitted: false,
    final_holdout_open_admitted: false,
  });
});
