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

test('prospective corpus freezes twelve target-independent source families with balanced table-like targets', () => {
  const manifest = readJson(MANIFEST);
  assertStructuredArtifactProspectiveCorpus(manifest);

  assert.equal(manifest.cases.length, 12);
  const tableLike = manifest.cases.map((entry: any) => {
    const targetFile = entry.target_ref.split('/').at(-1);
    assert.ok(targetFile);
    return readJson(targetFile).labels['region.table_like'].value;
  });
  assert.equal(tableLike.filter(Boolean).length, 6);
  assert.equal(tableLike.filter((value: boolean) => !value).length, 6);

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

test('every target is bound to exact preregistered source bytes and negative cases omit header-boundary', () => {
  const manifest = readJson(MANIFEST);
  assertStructuredArtifactProspectiveCorpus(manifest);

  for (const entry of manifest.cases) {
    const sourceFile = entry.source_ref.split('/').at(-1);
    const targetFile = entry.target_ref.split('/').at(-1);
    assert.ok(sourceFile);
    assert.ok(targetFile);

    const source = readJson(sourceFile);
    const target = readJson(targetFile);
    assertStructuredArtifactReferenceTarget(target);

    assert.equal(target.source.source_digest, sha256File(sourceFile));
    assert.equal(target.source.source_family_id, entry.source_family_id);
    assert.equal(source.source_family_id, entry.source_family_id);
    assert.equal(
      target.source.workbook_or_document,
      source.workbook_or_document,
    );

    if (target.labels['region.table_like'].value === false) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          target.labels,
          'region.header_boundary',
        ),
        false,
      );
    }
  }
});

test('manifest canonical serialization and digest remain deterministic', () => {
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

test('header candidate remains excluded and SAI-0E cannot claim training or authority', () => {
  const leak = readJson(MANIFEST);
  leak.cases[0].observation_generation.excluded_portable_features = [];
  assert.throws(
    () => assertStructuredArtifactProspectiveCorpus(leak),
    /must exclude role\.header_candidate_signal/,
  );

  for (const field of [
    'training_performed',
    'product_runtime_authority',
    'winner_selection_performed',
  ] as const) {
    const manifest = readJson(MANIFEST);
    manifest.boundary[field] = true;
    assert.throws(
      () => assertStructuredArtifactProspectiveCorpus(manifest),
      /forbids training, runtime authority, and winner selection/,
    );
  }
});
