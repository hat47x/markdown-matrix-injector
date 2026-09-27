import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v0.json';
const TRANCHE =
  'structured-artifact-sai2-real-source-asset-identity-us-census-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

test('Census asset identities bind only frozen discovery-pool members', () => {
  const discovery = readJson(DISCOVERY);
  const tranche = readJson(TRANCHE);
  const pool = new Map(
    [
      ...discovery.primary_sources,
      ...discovery.reserve_sources,
    ].map((entry: any) => [entry.source_id, entry]),
  );

  assert.equal(
    tranche.discovery_manifest_git_blob_sha,
    '4922fd56a473ed4f4e69e8416357ea020355346b',
  );
  assert.equal(tranche.publisher_id, 'us-census');
  assert.equal(tranche.assets.length, 5);

  for (const asset of tranche.assets) {
    const frozen: any = pool.get(asset.source_id);
    assert.ok(frozen);
    assert.equal(frozen.publisher_id, 'us-census');
    assert.equal(asset.role, frozen.role);
    assert.equal(
      asset.requested_stratum,
      frozen.requested_stratum,
    );
    assert.equal(asset.filename.endsWith('.xlsx'), true);
    assert.equal(
      asset.direct_asset_url,
      asset.directory_url + asset.filename,
    );
  }
});

test('Census identity resolution uses directory metadata without opening assets', () => {
  const tranche = readJson(TRANCHE);

  assert.equal(
    tranche.identity_resolution_method,
    'directory_listing_filename_join_without_asset_dereference',
  );
  for (const asset of tranche.assets) {
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
    assert.equal(
      asset.item_specific_terms_status,
      'pending',
    );
  }
  assert.deepEqual(tranche.aggregate, {
    resolved_asset_identity_count: 5,
    primary_count: 4,
    reserve_count: 1,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
  });
});

test('partial identity tranche keeps all source-byte and evaluation gates closed', () => {
  const tranche = readJson(TRANCHE);

  assert.deepEqual(tranche.boundary, {
    exact_asset_identity_resolution_performed: true,
    item_specific_terms_review_completed: false,
    source_bytes_opened: false,
    workbook_structure_inspected: false,
    sheet_selection_performed: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(tranche.next_gate, {
    name:
      'resolve_remaining_19_asset_identities_and_complete_item_specific_terms_review',
    remaining_asset_identity_count: 19,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
