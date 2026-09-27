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

test('SAI-2A repaired materialization matches the ten preregistered fit families', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const planned = prereg.groups
    .filter((entry: any) => entry.split === 'fit')
    .map((entry: any) => [entry.source_family_id, entry.target_mode]);
  const actual = manifest.cases
    .map((entry: any) => [entry.source_family_id, entry.target_mode]);

  assert.equal(manifest.cases.length, 10);
  assert.deepEqual(actual, planned);
  assert.equal(manifest.materialization_id, 'sai-2a-fit-mmi-v1');
  assert.deepEqual(manifest.repair, {
    candidate_generation_had_occurred: false,
    reason: 'align_to_latest_pre_materialization_exact_layout_freeze',
    replaces_materialization_id: 'sai-2a-fit-mmi-v0',
    semantic_freeze_comment_id: 5854218027,
  });
});

test('repaired range targets bind exact source bytes and stay blind to candidates', () => {
  const manifest = readJson(MANIFEST);
  for (const entry of manifest.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    const targetName = entry.target_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(targetName);
    const source = readJson(sourceName);
    const target = readJson(targetName);

    assert.equal(sha256File(sourceName), entry.source_digest);
    assert.equal(source.source_family_id, entry.source_family_id);
    assert.equal(target.schema, 'hat47x.structured-artifact-sai2-range-target/v0');
    assert.equal(target.source.source_digest, entry.source_digest);
    assert.equal(target.source.source_family_id, entry.source_family_id);
    assert.equal(target.target_mode, entry.target_mode);
    assert.equal(target.boundary.authored_before_candidate_generation, true);
    assert.equal(target.boundary.blind_to_candidate_generator, true);
    assert.equal(target.boundary.blind_to_ranker, true);
    assert.equal(target.boundary.product_runtime_authority, false);

    if (entry.target_mode === 'clear_target') {
      assert.notEqual(target.range, null);
      assert.equal(target.abstain_reason, null);
      assert.equal(target.range.coordinate_system, 'one_based_inclusive');
    } else {
      assert.equal(target.range, null);
      assert.ok(
        target.abstain_reason === 'multiple_peer_candidates'
        || target.abstain_reason === 'non_tabular',
      );
    }
  }
});

test('latest exact-layout freeze is represented literally', () => {
  const title = readJson('structured-artifact-sai2-source-fit-table-with-title-v0.json');
  const titleTarget = readJson('structured-artifact-sai2-target-fit-table-with-title-v0.json');
  assert.deepEqual(title.rows[0], ['Quarterly orders', null, null]);
  assert.deepEqual(titleTarget.range, {
    col_end: 3, col_start: 1, coordinate_system: 'one_based_inclusive',
    row_end: 6, row_start: 2,
  });

  const ragged = readJson('structured-artifact-sai2-source-fit-ragged-table-v0.json');
  const raggedTarget = readJson('structured-artifact-sai2-target-fit-ragged-table-v0.json');
  assert.equal(ragged.rows.length, 5);
  assert.deepEqual(raggedTarget.range, {
    col_end: 4, col_start: 1, coordinate_system: 'one_based_inclusive',
    row_end: 5, row_start: 1,
  });

  const merged = readJson('structured-artifact-sai2-source-fit-table-with-merged-title-v0.json');
  const mergedTarget = readJson('structured-artifact-sai2-target-fit-table-with-merged-title-v0.json');
  assert.deepEqual(merged.merges, [{
    end_col: 4, end_row: 1, start_col: 1, start_row: 1,
  }]);
  assert.deepEqual(mergedTarget.range, {
    col_end: 4, col_start: 1, coordinate_system: 'one_based_inclusive',
    row_end: 6, row_start: 2,
  });

  const notes = readJson('structured-artifact-sai2-source-fit-notes-only-v0.json');
  const notesTarget = readJson('structured-artifact-sai2-target-fit-notes-only-v0.json');
  assert.equal(notes.rows.length, 5);
  assert.equal(notes.rows.every((row: any[]) => row.length === 1), true);
  assert.equal(notesTarget.abstain_reason, 'non_tabular');
});

test('peer and metric abstentions keep explicit preregistered reasons', () => {
  for (const name of [
    'fit-two-peer-tables-horizontal-v0',
    'fit-two-peer-tables-vertical-v0',
    'fit-metric-card-dashboard-v0',
  ]) {
    const target = readJson(
      'structured-artifact-sai2-target-' + name + '.json',
    );
    assert.equal(target.target_mode, 'abstain');
    assert.equal(target.range, null);
    assert.equal(target.abstain_reason, 'multiple_peer_candidates');
  }
});

test('repair remains strictly before candidate generation and ranking', () => {
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
    candidate_generation_admitted: false,
    name: 'excel_exact_fit_source_target_mirror',
    ranking_admitted: false,
  });
});
