import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const IDENTITY =
  'structured-artifact-sai2-real-source-asset-identity-remaining-v2-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('remaining identity tranche covers exactly the twelve not in prior identity tranches', () => {
  const discovery = j(DISCOVERY);
  const identity = j(IDENTITY);
  const expected = [
    ...discovery.primary_sources,
    ...discovery.reserve_sources,
  ].filter(
    (x: any) =>
      ['abs', 'stats-nz', 'defra', 'gla'].includes(x.publisher_id),
  );

  assert.equal(identity.assets.length, 12);
  assert.deepEqual(
    identity.assets.map((x: any) => x.source_id).sort(),
    expected.map((x: any) => x.source_id).sort(),
  );
  assert.equal(
    identity.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
  assert.equal(
    identity.terms_closure_git_blob_sha,
    'f2601cab28b89ef5bf100dbc40fcdb048d602eea',
  );
});

test('ABS and Stats NZ identities use release-specific metadata tuples without dereference', () => {
  const identity = j(IDENTITY);

  for (const asset of identity.assets.filter(
    (x: any) => ['abs', 'stats-nz'].includes(x.publisher_id),
  )) {
    assert.match(asset.metadata_url, /^https:\/\//u);
    assert.equal(asset.format, 'xlsx');
    assert.match(asset.identity_key, /#label=.+&format=xlsx/u);
    assert.equal(asset.direct_asset_url, null);
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
  }
});

test('Defra identity binds exact CKAN package and resource UUID without opening XLSX', () => {
  const identity = j(IDENTITY);
  const defra = identity.assets.find(
    (x: any) =>
      x.source_id ===
      'sai2b-primary-defra-natural-capital-template',
  );

  assert.equal(defra.package_id, '3930b9ca-26c3-489f-900f-6b9eec2602c6');
  assert.equal(defra.resource_id, '31a3f893-0f0a-4f92-8751-e7c1c4bde53c');
  assert.equal(defra.format, 'XLSX');
  assert.equal(defra.asset_dereferenced, false);
  assert.equal(defra.source_digest, null);
});

test('GLA reserve preserves its exact resource-link identity and fail-closed access state', () => {
  const identity = j(IDENTITY);
  const gla = identity.assets.find(
    (x: any) =>
      x.source_id === 'sai2b-reserve-gla-london-cartogram-xlsx',
  );

  assert.equal(
    gla.resource_id,
    '5cb4f48a-91d8-4e6f-afda-e97a41e33958',
  );
  assert.equal(
    gla.resource_metadata_status,
    'resource_href_frozen_from_dataset_page_but_resource_page_currently_returns_404',
  );
  assert.equal(gla.materialization_access_status, 'pending_fail_closed_check');
  assert.equal(gla.asset_dereferenced, false);
  assert.equal(gla.source_digest, null);
});

test('remaining tranche completes 24 identity records but keeps source bytes closed', () => {
  const identity = j(IDENTITY);

  assert.deepEqual(identity.aggregate, {
    resolved_asset_identity_count: 12,
    primary_count: 8,
    reserve_count: 4,
    direct_asset_url_known_count: 0,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
    current_v2_total_resolved_identity_count: 24,
    current_v2_remaining_identity_count: 0,
  });
  assert.equal(identity.boundary.all_current_v2_asset_identities_resolved, true);
  assert.equal(identity.boundary.source_bytes_opened, false);
  assert.equal(identity.boundary.targets_authored, false);
  assert.equal(identity.boundary.candidate_generation_performed, false);
  assert.equal(identity.boundary.real_source_winner_scoring_performed, false);
  assert.deepEqual(identity.next_gate, {
    name:
      'excel_exact_remaining_identity_mirror_then_freeze_identity_closure',
    exact_excel_mirror_required: true,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
