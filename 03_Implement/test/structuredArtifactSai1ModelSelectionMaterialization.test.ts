import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG = 'structured-artifact-sai1-preregistration-v0.json';
const SPEC = 'structured-artifact-sai1-candidate-specification-v0.json';
const MANIFEST =
  'structured-artifact-sai1-model-selection-mmi-v0.json';

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

test('model-selection materialization matches the four preregistered groups', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const planned = new Map(
    prereg.groups.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  assert.equal(manifest.cases.length, 4);
  assert.equal(
    manifest.cases.filter(
      (entry: any) =>
        entry.label_status === 'clear_positive',
    ).length,
    2,
  );
  assert.equal(
    manifest.cases.filter(
      (entry: any) =>
        entry.label_status === 'clear_negative',
    ).length,
    2,
  );

  for (const entry of manifest.cases) {
    const registered: any =
      planned.get(entry.source_family_id);
    assert.ok(registered);
    assert.equal(registered.split, 'model_selection');
    assert.equal(
      registered.label_status,
      entry.label_status,
    );
  }
});

test('selection sources and targets bind exact frozen bytes', () => {
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
      target.labels['region.table_like'].value,
      entry.label_status === 'clear_positive',
    );
  }
});

test('selection negatives stay structurally non-tabular', () => {
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
  }
});

test('candidate specification remains frozen before selection observations', () => {
  const spec = readJson(SPEC);
  const manifest = readJson(MANIFEST);

  assert.equal(
    manifest.candidate_specification_id,
    spec.specification_id,
  );
  assert.equal(
    spec.fit_policy.hyperparameter_search_allowed,
    false,
  );
  assert.equal(
    spec.fit_policy.threshold_tuning_allowed,
    false,
  );
  assert.deepEqual(manifest.boundary, {
    candidate_specification_frozen: true,
    source_materialization_performed: true,
    observations_generated: false,
    model_fit_performed: false,
    selection_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
});
