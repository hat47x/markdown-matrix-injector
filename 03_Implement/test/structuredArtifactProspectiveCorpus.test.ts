import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertStructuredArtifactProspectiveCorpus,
  canonicalStructuredArtifactProspectiveCorpusJson,
  structuredArtifactProspectiveCorpusDigest,
} from '../src/experimental/structuredArtifactProspectiveCorpus.js';
import {
  assertStructuredArtifactReferenceTarget,
} from '../src/experimental/structuredArtifactNeutralTarget.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MANIFEST = 'structured-artifact-prospective-corpus-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function sha256File(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('prospective corpus preregisters six target-independent source families with both table-like classes', () => {
  const manifest = readJson(MANIFEST);
  assertStructuredArtifactProspectiveCorpus(manifest);

  assert.equal(manifest.cases.length, 6);
  assert.deepEqual(
    manifest.cases.map((entry: any) => entry.source_family_id),
    [
      'sai-h2-basic-table-v0',
      'sai-h2-offset-header-v0',
      'sai-h2-compact-table-v0',
      'sai-h2-non-table-notes-single-column-v0',
      'sai-h2-non-table-kv-pairs-v0',
      'sai-h2-non-table-scattered-diagonal-v0',
    ],
  );

  const tableLikeTargets = manifest.cases.map((entry: any) => {
    const targetFile = entry.target_ref.split('/').at(-1);
    assert.ok(targetFile);
    return readJson(targetFile).labels['region.table_like']?.value;
  });
  assert.deepEqual(
    tableLikeTargets,
    [true, true, true, false, false, false],
  );

  for (const entry of manifest.cases) {
    assert.equal(entry.observation_generation.target_independent, true);
    assert.equal(
      entry.observation_generation.target_fields_not_supplied_to_adapter,
      true,
    );
    assert.deepEqual(
      entry.observation_generation.excluded_portable_features,
      ['role.header_candidate_signal'],
    );
  }
});

test('each target is bound to the exact preregistered source bytes', () => {
  const manifest = readJson(MANIFEST);
  assertStructuredArtifactProspectiveCorpus(manifest);

  for (const entry of manifest.cases) {
    const sourceFile = entry.source_ref.split('/').at(-1);
    const targetFile = entry.target_ref.split('/').at(-1);
    assert.ok(sourceFile);
    assert.ok(targetFile);

    const source = readJson(sourceFile) as Record<string, unknown>;
    const target = readJson(targetFile);
    assertStructuredArtifactReferenceTarget(target);

    assert.equal(target.source.source_digest, sha256File(sourceFile));
    assert.equal(target.source.source_family_id, entry.source_family_id);
    assert.equal(source.source_family_id, entry.source_family_id);
    assert.equal(
      target.source.workbook_or_document,
      source.workbook_or_document,
    );
  }
});

test('non-table targets do not fabricate header-boundary labels', () => {
  const manifest = readJson(MANIFEST);
  for (const entry of manifest.cases.slice(3)) {
    const targetFile = entry.target_ref.split('/').at(-1);
    assert.ok(targetFile);
    const target = readJson(targetFile);
    assert.equal(
      target.labels['region.table_like'].value,
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        target.labels,
        'region.header_boundary',
      ),
      false,
    );
  }
});

test('manifest canonical serialization and digest are deterministic', () => {
  const manifest = readJson(MANIFEST);
  const first = canonicalStructuredArtifactProspectiveCorpusJson(manifest);
  const second = canonicalStructuredArtifactProspectiveCorpusJson(
    structuredClone(manifest),
  );

  assert.equal(first, second);
  assert.match(
    structuredArtifactProspectiveCorpusDigest(manifest),
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test('header-boundary corpus fails closed if leakage-sensitive feature is admitted', () => {
  const manifest = readJson(MANIFEST) as any;
  manifest.cases[0].observation_generation.excluded_portable_features = [];

  assert.throws(
    () => assertStructuredArtifactProspectiveCorpus(manifest),
    /must exclude role\.header_candidate_signal/,
  );
});

test('SAI-0E corpus cannot claim training, runtime authority, or winner selection', () => {
  for (const field of [
    'training_performed',
    'product_runtime_authority',
    'winner_selection_performed',
  ] as const) {
    const manifest = readJson(MANIFEST) as any;
    manifest.boundary[field] = true;
    assert.throws(
      () => assertStructuredArtifactProspectiveCorpus(manifest),
      /forbids training, runtime authority, and winner selection/,
    );
  }
});
