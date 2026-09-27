import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const IDENTITY =
  'structured-artifact-sai2-real-source-asset-identity-ons-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('ONS identity tranche binds exactly to the seven current-v2 ONS pool members', () => {
  const discovery = j(DISCOVERY);
  const identity = j(IDENTITY);
  const pool = [
    ...discovery.primary_sources,
    ...discovery.reserve_sources,
  ].filter((x: any) => x.publisher_id === 'ons');

  assert.equal(identity.assets.length, 7);
  assert.deepEqual(
    identity.assets.map((x: any) => x.source_id).sort(),
    pool.map((x: any) => x.source_id).sort(),
  );
  assert.equal(
    identity.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
});

test('ONS metadata tuple fixes edition, format and observed release context without opening XLSX', () => {
  const identity = j(IDENTITY);

  assert.equal(
    identity.identity_resolution_method,
    'ons_official_edition_metadata_tuple_without_asset_dereference',
  );
  for (const asset of identity.assets) {
    assert.match(asset.metadata_url, /^https:\/\/www\.ons\.gov\.uk\//u);
    assert.equal(asset.format, 'xlsx');
    assert.match(asset.identity_key, /#edition=.+&format=xlsx&release=.+&size=.+/u);
    assert.equal(asset.item_specific_terms_status, 'pass_ons_ogl_v3');
    assert.equal(asset.direct_asset_url, null);
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
  }
});

test('ONS identity tranche accounts for four primaries and three reserves', () => {
  const identity = j(IDENTITY);

  assert.deepEqual(identity.aggregate, {
    resolved_asset_identity_count: 7,
    primary_count: 4,
    reserve_count: 3,
    direct_asset_url_known_count: 0,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
  });
});

test('ONS identity tranche leaves twelve v2 identities and all content gates closed', () => {
  const identity = j(IDENTITY);

  assert.equal(identity.boundary.source_bytes_opened, false);
  assert.equal(identity.boundary.workbook_structure_inspected, false);
  assert.equal(identity.boundary.targets_authored, false);
  assert.equal(identity.boundary.candidate_generation_performed, false);
  assert.equal(identity.boundary.real_source_winner_scoring_performed, false);
  assert.deepEqual(identity.next_gate, {
    name:
      'excel_exact_ons_identity_mirror_then_resolve_remaining_v2_asset_identities',
    exact_excel_mirror_required: true,
    remaining_v2_asset_identity_count: 12,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
