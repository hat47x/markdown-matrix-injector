import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const IDENTITY =
  'structured-artifact-sai2-real-source-asset-identity-v2-replacements-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('v2 replacement identities bind exactly to the five replacement pool members', () => {
  const discovery = j(DISCOVERY);
  const identity = j(IDENTITY);
  const pool = new Map(
    [...discovery.primary_sources, ...discovery.reserve_sources]
      .map((x: any) => [x.source_id, x]),
  );

  assert.equal(
    identity.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
  assert.equal(identity.assets.length, 5);
  for (const asset of identity.assets) {
    const frozen: any = pool.get(asset.source_id);
    assert.ok(frozen);
    assert.equal(asset.publisher_id, frozen.publisher_id);
    assert.equal(asset.role, frozen.role);
    assert.equal(asset.requested_stratum, frozen.requested_stratum);
    assert.match(asset.resource_id, /^[0-9a-f-]{36}$/u);
    assert.match(asset.resource_page_url, /^https:\/\//u);
  }
});

test('CKAN resource identities are resolved without opening the XLSX assets', () => {
  const identity = j(IDENTITY);

  assert.equal(
    identity.identity_resolution_method,
    'ckan_package_resource_metadata_without_asset_dereference',
  );
  for (const asset of identity.assets) {
    assert.equal(asset.format, 'XLSX');
    assert.equal(asset.item_specific_terms_status, 'pass_dataset_level_ogl');
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
  }
  assert.deepEqual(identity.aggregate, {
    resolved_asset_identity_count: 5,
    primary_count: 4,
    reserve_count: 1,
    direct_asset_url_known_from_metadata_count: 1,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
  });
});

test('known FCA direct URL is metadata only and was not dereferenced', () => {
  const identity = j(IDENTITY);
  const fca = identity.assets.find(
    (x: any) =>
      x.source_id ===
      'sai2b-primary-fca-mortgage-detailed-q3-2023',
  );

  assert.equal(
    fca.direct_asset_url,
    'https://www.fca.org.uk/publication/data/mlar-statistics-detailed-long-run.xlsx',
  );
  assert.equal(
    fca.direct_asset_url_source,
    'ckan_resource_metadata_only',
  );
  assert.equal(fca.asset_dereferenced, false);
  assert.equal(fca.source_digest, null);
});

test('identity tranche keeps all content and evaluation gates closed', () => {
  const identity = j(IDENTITY);

  assert.deepEqual(identity.boundary, {
    exact_asset_identity_resolution_performed: true,
    source_bytes_opened: false,
    workbook_structure_inspected: false,
    sheet_selection_performed: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
  });
  assert.equal(identity.next_gate.exact_excel_mirror_required, true);
  assert.equal(identity.next_gate.remaining_v2_asset_identity_count, 19);
  assert.equal(identity.next_gate.source_byte_open_admitted, false);
  assert.equal(identity.next_gate.candidate_generation_admitted, false);
  assert.equal(identity.next_gate.scoring_admitted, false);
});
