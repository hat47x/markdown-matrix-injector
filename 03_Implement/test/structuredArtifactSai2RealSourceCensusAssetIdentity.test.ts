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

test('Census metadata resolution remains bound to v0 pool members', () => {
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

test('Census resolution never dereferenced an asset', () => {
  const tranche = readJson(TRANCHE);

  assert.equal(
    tranche.identity_resolution_method,
    'directory_listing_filename_join_without_asset_dereference',
  );
  for (const asset of tranche.assets) {
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
    assert.equal(asset.item_specific_terms_status, 'pending');
  }
  assert.equal(tranche.aggregate.asset_dereferenced_count, 0);
  assert.equal(tranche.aggregate.source_digest_count, 0);
});

test('v0-bound Census resolution is explicitly provisional until v1 mirror', () => {
  const tranche = readJson(TRANCHE);

  assert.equal(
    tranche.authority_status,
    'provisional_metadata_resolution_not_authoritative_for_source_open',
  );
  assert.equal(tranche.authoritative_for_source_open, false);
  assert.deepEqual(tranche.correction_dependency, {
    required_discovery_manifest_id:
      'sai-2b-real-source-discovery-manifest-v1',
    required_excel_exact_mirror: true,
    revalidation_required_after_mirror: true,
    workbook_bytes_opened_before_revalidation: false,
  });
  assert.deepEqual(tranche.next_gate, {
    name:
      'merge_discovery_v1_then_excel_exact_mirror_then_rebind_census_identity',
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
