import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG = 'structured-artifact-sai1-preregistration-v0.json';
const MANIFEST = 'structured-artifact-sai1-fit-tranche-a-mmi-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function sha256File(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('SAI-1 fit tranche A materializes only preregistered fit groups', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const planned = new Map(
    prereg.groups.map((entry: any) => [entry.source_family_id, entry]),
  );

  assert.equal(manifest.cases.length, 4);
  assert.equal(
    manifest.cases.filter((entry: any) => entry.label_status === 'clear_positive').length,
    2,
  );
  assert.equal(
    manifest.cases.filter((entry: any) => entry.label_status === 'clear_negative').length,
    2,
  );

  for (const entry of manifest.cases) {
    const registered: any = planned.get(entry.source_family_id);
    assert.ok(registered);
    assert.equal(registered.split, 'fit');
    assert.equal(registered.label_status, entry.label_status);
    assert.equal(registered.materialized, false);
  }
});

test('materialized targets bind exact source bytes and frozen labels', () => {
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

    const tableLike = target.labels['region.table_like'];
    assert.equal(
      tableLike.value,
      entry.label_status === 'clear_positive',
    );
    assert.equal(tableLike.blind_to_candidate_model, true);
    assert.equal(tableLike.labeler_or_rule_version, 'sai-0f-table-like-semantics-v0');

    if (entry.label_status === 'clear_positive') {
      assert.equal(target.labels['region.header_boundary'].value, 1);
      assert.equal(target.labels['region.ambiguous_or_non_table'], undefined);
    } else {
      assert.equal(target.labels['region.header_boundary'], undefined);
      assert.equal(target.labels['region.ambiguous_or_non_table'].value, true);
    }
  }
});

test('materialization does not generate observations or admit training', () => {
  const manifest = readJson(MANIFEST);

  assert.deepEqual(manifest.boundary, {
    source_materialization_performed: true,
    observations_generated: false,
    model_fit_performed: false,
    threshold_tuning_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(manifest.next_gate, {
    name: 'excel_independent_projection_then_cross_producer_observation_capture',
    training_admitted: false,
  });
});

test('clear-negative KV fixture stays sparse under frozen SAI-0F semantics', () => {
  const source = readJson(
    'structured-artifact-sai1-source-non-table-kv-record-5x2-v0.json',
  );
  const target = readJson(
    'structured-artifact-sai1-target-non-table-kv-record-5x2-v0.json',
  );

  assert.equal(source.rows.length, 5);
  assert.equal(source.rows.every((row: any[]) => row.length === 2), true);
  assert.equal(
    source.rows.filter(
      (row: any[]) => row.every((cell) => cell === null),
    ).length,
    2,
  );
  assert.deepEqual(source.rows[1], [null, null]);
  assert.deepEqual(source.rows[3], [null, null]);
  assert.equal(target.labels['region.table_like'].value, false);
  assert.equal(
    target.labels['region.ambiguous_or_non_table'].value,
    true,
  );
});
