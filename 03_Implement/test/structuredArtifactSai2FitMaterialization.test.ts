import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG = 'structured-artifact-sai2-preregistration-v0.json';
const MANIFEST = 'structured-artifact-sai2-fit-mmi-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function sha256File(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('SAI-2A materializes exactly the ten preregistered fit families', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const planned = prereg.groups
    .filter((entry: any) => entry.split === 'fit')
    .map((entry: any) => entry.source_family_id)
    .sort();
  const actual = manifest.cases
    .map((entry: any) => entry.source_family_id)
    .sort();

  assert.equal(manifest.cases.length, 10);
  assert.deepEqual(actual, planned);
  assert.equal(
    manifest.cases.filter((entry: any) => entry.target_mode === 'clear_target').length,
    6,
  );
  assert.equal(
    manifest.cases.filter((entry: any) => entry.target_mode === 'abstain').length,
    4,
  );
});

test('SAI-2A targets bind exact source bytes without candidate evidence', () => {
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
    assert.equal(target.boundary.blind_to_candidate_generation, true);
    assert.equal(target.boundary.blind_to_ranker, true);

    if (entry.target_mode === 'clear_target') {
      assert.ok(target.reference_rectangle);
      assert.equal(
        target.reference_rectangle.coordinate_system,
        'one_based_inclusive',
      );
    } else {
      assert.equal(target.reference_rectangle, null);
    }
  }
});

test('detached and glued title targets obey frozen exclusion semantics', () => {
  const detached = readJson(
    'structured-artifact-sai2-target-fit-table-with-title-v0.json',
  );
  const glued = readJson(
    'structured-artifact-sai2-target-fit-table-with-merged-title-v0.json',
  );
  const gluedSource = readJson(
    'structured-artifact-sai2-source-fit-table-with-merged-title-v0.json',
  );

  assert.deepEqual(detached.reference_rectangle, {
    col_end: 3,
    col_start: 1,
    coordinate_system: 'one_based_inclusive',
    row_end: 7,
    row_start: 3,
  });
  assert.deepEqual(glued.reference_rectangle, {
    col_end: 3,
    col_start: 1,
    coordinate_system: 'one_based_inclusive',
    row_end: 6,
    row_start: 2,
  });
  assert.deepEqual(gluedSource.merges, [{
    end_col: 3,
    end_row: 1,
    start_col: 1,
    start_row: 1,
  }]);
});

test('abstain fit families omit an authoritative rectangle', () => {
  const manifest = readJson(MANIFEST);
  const abstain = manifest.cases.filter(
    (entry: any) => entry.target_mode === 'abstain',
  );

  assert.deepEqual(
    abstain.map((entry: any) => entry.source_family_id).sort(),
    [
      'sai-r2-fit-metric-card-dashboard-v0',
      'sai-r2-fit-notes-only-v0',
      'sai-r2-fit-two-peer-tables-horizontal-v0',
      'sai-r2-fit-two-peer-tables-vertical-v0',
    ],
  );
  for (const entry of abstain) {
    const targetName = entry.target_ref.split('/').at(-1);
    assert.ok(targetName);
    assert.equal(readJson(targetName).reference_rectangle, null);
  }
});

test('source materialization does not run candidate generation or ranking', () => {
  const manifest = readJson(MANIFEST);

  assert.deepEqual(manifest.boundary, {
    candidate_generation_performed: false,
    candidate_metrics_computed: false,
    final_holdout_opened: false,
    model_fit_performed: false,
    product_runtime_authority: false,
    ranker_specification_frozen: false,
    ranking_scoring_performed: false,
    source_materialization_performed: true,
  });
  assert.deepEqual(manifest.next_gate, {
    name: 'excel_exact_fit_source_target_mirror',
    candidate_generation_admitted: false,
    ranking_admitted: false,
  });
});
