import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG = 'structured-artifact-sai1-preregistration-v0.json';
const MANIFEST = 'structured-artifact-sai1-fit-tranche-b-mmi-v0.json';

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

test('SAI-1 fit tranche B materializes the six remaining preregistered fit groups', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const planned = new Map(
    prereg.groups.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  assert.equal(manifest.cases.length, 6);
  assert.equal(
    manifest.cases.filter(
      (entry: any) =>
        entry.label_status === 'clear_positive',
    ).length,
    3,
  );
  assert.equal(
    manifest.cases.filter(
      (entry: any) =>
        entry.label_status === 'clear_negative',
    ).length,
    3,
  );

  for (const entry of manifest.cases) {
    const registered: any =
      planned.get(entry.source_family_id);
    assert.ok(registered);
    assert.equal(registered.split, 'fit');
    assert.equal(
      registered.label_status,
      entry.label_status,
    );
    assert.equal(registered.materialized, false);
  }
});

test('tranche B targets bind exact source bytes and frozen labels', () => {
  const manifest = readJson(MANIFEST);

  for (const entry of manifest.cases) {
    const sourceName =
      entry.source_ref.split('/').at(-1);
    const targetName =
      entry.target_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(targetName);

    const source = readJson(sourceName);
    const target = readJson(targetName);
    assert.equal(
      sha256File(sourceName),
      entry.source_digest,
    );
    assert.equal(
      target.source.source_digest,
      entry.source_digest,
    );
    assert.equal(
      source.source_family_id,
      entry.source_family_id,
    );
    assert.equal(
      target.source.source_family_id,
      entry.source_family_id,
    );
    assert.equal(
      target.labels['region.table_like'].value,
      entry.label_status === 'clear_positive',
    );
    assert.equal(
      target.labels['region.table_like']
        .blind_to_candidate_model,
      true,
    );
    assert.equal(
      target.labels['region.table_like']
        .labeler_or_rule_version,
      'sai-0f-table-like-semantics-v0',
    );
  }
});

test('clear-negative tranche B sources remain structurally non-tabular', () => {
  const manifest = readJson(MANIFEST);
  const negatives = manifest.cases.filter(
    (entry: any) =>
      entry.label_status === 'clear_negative',
  );

  for (const entry of negatives) {
    const sourceName =
      entry.source_ref.split('/').at(-1);
    assert.ok(sourceName);
    const source = readJson(sourceName);

    assert.equal(
      source.rows.every(
        (row: any[]) =>
          row.filter((cell) => cell !== null).length <= 1,
      ),
      true,
      entry.source_family_id,
    );
    assert.equal(
      source.rows.some(
        (row: any[]) =>
          row[0] !== null && row[1] === null,
      ),
      true,
      entry.source_family_id,
    );
    assert.equal(
      source.rows.some(
        (row: any[]) =>
          row[0] === null && row[1] !== null,
      ),
      true,
      entry.source_family_id,
    );
  }
});

test('positive tranche B headers stay source-authored and target-independent', () => {
  const manifest = readJson(MANIFEST);
  const expected = new Map([
    ['sai-f2-table-sparse-optional-6x4-v0', 1],
    ['sai-f2-table-leading-title-6x3-v0', 2],
    ['sai-f2-table-percent-metrics-5x4-v0', 1],
  ]);

  for (const entry of manifest.cases) {
    if (entry.label_status !== 'clear_positive') {
      continue;
    }
    const targetName =
      entry.target_ref.split('/').at(-1);
    assert.ok(targetName);
    const target = readJson(targetName);
    assert.equal(
      target.labels['region.header_boundary'].value,
      expected.get(entry.source_family_id),
    );
  }

  const leading = readJson(
    'structured-artifact-sai1-source-table-leading-title-6x3-v0.json',
  );
  assert.deepEqual(leading.merges, [{
    start_row: 1,
    start_col: 1,
    end_row: 1,
    end_col: 3,
  }]);
});

test('tranche B materialization keeps observations and training closed', () => {
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
    name:
      'excel_independent_projection_then_cross_producer_observation_capture',
    training_admitted: false,
  });
});
