import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE = new URL(
  './fixtures/structured-artifact-sai2-real-source-discovery-manifest-v0.json',
  import.meta.url,
);

function readManifest(): any {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

test('SAI-2B source discovery stays metadata-only and is bound to frozen preregistration', () => {
  const manifest = readManifest();

  assert.equal(
    manifest.upstream.preregistration_git_blob_sha,
    'e4e4b030e070b37f63d25d41e1817c620102740e',
  );
  assert.equal(manifest.discovery_policy.inspection_mode, 'landing_page_and_license_metadata_only');
  assert.equal(manifest.discovery_policy.source_bytes_opened, false);
  assert.equal(manifest.discovery_policy.direct_asset_requests_performed, false);
  assert.equal(manifest.discovery_policy.workbook_structure_inspected, false);
  assert.equal(manifest.discovery_policy.sheet_selection_performed, false);
  assert.equal(manifest.discovery_policy.stratum_assignment_performed, false);
  assert.equal(manifest.discovery_policy.targets_authored, false);
  assert.equal(manifest.discovery_policy.candidate_generation_performed, false);
  assert.equal(manifest.discovery_policy.portable_feature_capture_performed, false);
  assert.equal(manifest.discovery_policy.winner_scoring_performed, false);
});

test('source discovery freezes exactly sixteen groups across four independent publishers', () => {
  const manifest = readManifest();

  assert.equal(manifest.sources.length, 16);
  assert.equal(manifest.publishers.length, 4);
  assert.deepEqual(
    manifest.publishers.map((publisher: any) => [
      publisher.publisher_id,
      publisher.group_count,
    ]),
    [
      ['ons', 4],
      ['abs', 4],
      ['stats-nz', 4],
      ['us-census', 4],
    ],
  );

  const counts = new Map<string, number>();
  for (const source of manifest.sources) {
    counts.set(source.publisher_id, (counts.get(source.publisher_id) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), {
    ons: 4,
    abs: 4,
    'stats-nz': 4,
    'us-census': 4,
  });
});

test('all discovered sources remain unopened and target-blind', () => {
  const manifest = readManifest();
  const ids = new Set<string>();
  const landingPages = new Set<string>();

  for (const source of manifest.sources) {
    assert.equal(source.source_format, 'xlsx');
    assert.equal(source.status, 'discovered_not_materialized');
    assert.equal(source.direct_asset_url, null);
    assert.equal(source.source_digest, null);
    assert.equal(source.sheet_identity, null);
    assert.equal(source.stratum_id, null);
    assert.equal(source.target, null);
    assert.equal(ids.has(source.source_id), false);
    assert.equal(landingPages.has(source.landing_page_url), false);
    ids.add(source.source_id);
    landingPages.add(source.landing_page_url);
  }
});

test('publisher metadata records a redistribution basis before source-byte access', () => {
  const manifest = readManifest();

  for (const publisher of manifest.publishers) {
    assert.equal(publisher.redistribution_verified_from_metadata, true);
    assert.equal(typeof publisher.license_class, 'string');
    assert.ok(publisher.license_class.length > 0);
    assert.match(publisher.license_evidence_url, /^https:\/\//);
  }
});

test('the only admitted next action is exact asset identity resolution', () => {
  const manifest = readManifest();

  assert.deepEqual(manifest.boundary, {
    source_discovery_performed: true,
    source_bytes_opened: false,
    exact_asset_identity_frozen: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
  });

  assert.deepEqual(manifest.next_gate, {
    name: 'exact_asset_identity_freeze_before_source_byte_open',
    exact_asset_identity_resolution_admitted: true,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    portable_feature_capture_admitted: false,
    scoring_admitted: false,
  });
});
