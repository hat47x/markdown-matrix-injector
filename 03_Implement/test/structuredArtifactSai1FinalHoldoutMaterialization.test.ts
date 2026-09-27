import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const PREREG = 'structured-artifact-sai1-preregistration-v0.json';
const RESULT =
  'structured-artifact-sai1-model-selection-result-v0.json';
const MANIFEST =
  'structured-artifact-sai1-final-holdout-mmi-v0.json';

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

test('final holdout opens exactly the four preregistered groups after winner freeze', () => {
  const prereg = readJson(PREREG);
  const manifest = readJson(MANIFEST);
  const result = readJson(RESULT);

  const planned = prereg.groups
    .filter((entry: any) => entry.split === 'final_holdout')
    .map((entry: any) => entry.source_family_id)
    .sort();
  const actual = manifest.cases
    .map((entry: any) => entry.source_family_id)
    .sort();

  assert.deepEqual(actual, planned);
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
  assert.equal(
    result.selection.winner.candidate_id,
    'rules-v0',
  );
  assert.equal(manifest.winner_candidate_id, 'rules-v0');
  assert.equal(
    manifest.winner_result_sha256,
    sha256File(RESULT),
  );
  assert.deepEqual(manifest.open_policy, {
    open_count: 1,
    opened_after_winner_frozen: true,
    refit_after_open: false,
    threshold_change_after_open: false,
    winner_change_after_open: false,
  });
});

test('final-holdout targets bind exact first-open source bytes', () => {
  const manifest = readJson(MANIFEST);

  for (const entry of manifest.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    const targetName = entry.target_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(targetName);

    const source = readJson(sourceName);
    const target = readJson(targetName);
    assert.equal(sha256File(sourceName), entry.source_digest);
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

    if (entry.label_status === 'clear_positive') {
      assert.equal(
        target.labels['region.table_like'].value,
        true,
      );
      assert.equal(
        target.labels['region.header_boundary'].value,
        1,
      );
      assert.equal(
        target.labels['region.ambiguous_or_non_table'],
        undefined,
      );
    } else {
      assert.equal(
        target.labels['region.table_like'].value,
        false,
      );
      assert.equal(
        target.labels['region.ambiguous_or_non_table'].value,
        true,
      );
      assert.equal(
        target.labels['region.header_boundary'],
        undefined,
      );
    }
  }
});

test('final-holdout negatives remain structurally non-tabular before scoring', () => {
  const manifest = readJson(MANIFEST);
  const negatives = manifest.cases.filter(
    (entry: any) =>
      entry.label_status === 'clear_negative',
  );

  for (const entry of negatives) {
    const sourceName = entry.source_ref.split('/').at(-1);
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

test('one-time materialization does not generate observations or score the winner', () => {
  const manifest = readJson(MANIFEST);

  assert.deepEqual(manifest.boundary, {
    final_holdout_opened: true,
    observations_generated: false,
    product_runtime_authority: false,
    scoring_performed: false,
    source_materialization_performed: true,
    winner_changed: false,
  });
  assert.deepEqual(manifest.next_gate, {
    name:
      'excel_exact_mirror_then_cross_producer_observation_capture',
    scoring_admitted: false,
  });
});
