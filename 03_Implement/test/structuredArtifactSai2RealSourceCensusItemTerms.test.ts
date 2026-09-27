import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v1.json';
const CENSUS_IDENTITY =
  'structured-artifact-sai2-real-source-asset-identity-us-census-v1.json';
const TERMS =
  'structured-artifact-sai2-real-source-item-terms-us-census-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('Census terms review covers exactly the five frozen v1 Census pool members', () => {
  const discovery = j(DISCOVERY);
  const terms = j(TERMS);
  const pool = [
    ...discovery.primary_sources,
    ...discovery.reserve_sources,
  ].filter((x: any) => x.publisher_id === 'us-census');

  assert.equal(terms.items.length, 5);
  assert.deepEqual(
    terms.items.map((x: any) => x.source_id).sort(),
    pool.map((x: any) => x.source_id).sort(),
  );
  assert.equal(
    terms.discovery_manifest_git_blob_sha,
    'b192a0bacbe2f2ac67c328da46bc0939ad39aca2',
  );
});

test('Census public-use evidence does not overclaim worldwide raw redistribution rights', () => {
  const terms = j(TERMS);

  for (const item of terms.items) {
    assert.match(item.public_use_status, /^pass_public_/);
    assert.equal(
      item.international_raw_redistribution_status,
      'unresolved_foreign_copyright_scope',
    );
    assert.equal(
      item.item_specific_terms_status,
      'review_complete_fail_closed_for_raw_redistribution_outside_us',
    );
    assert.equal(item.source_byte_open_admitted, false);
    assert.equal(item.asset_dereferenced, false);
    assert.equal(item.source_digest, null);
  }

  assert.deepEqual(terms.aggregate, {
    reviewed_item_count: 5,
    public_use_pass_count: 5,
    international_raw_redistribution_pass_count: 0,
    international_raw_redistribution_unresolved_count: 5,
    source_byte_open_admitted_count: 0,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
    all_24_pool_items_terms_reviewed: true,
    non_census_terms_pass_count: 19,
    census_terms_fail_closed_count: 5,
  });
});

test('Census terms review preserves already-resolved metadata identity without opening assets', () => {
  const identity = j(CENSUS_IDENTITY);
  const terms = j(TERMS);
  const identityBySource = new Map(
    identity.assets.map((x: any) => [x.source_id, x]),
  );

  for (const item of terms.items) {
    const asset: any = identityBySource.get(item.source_id);
    assert.ok(asset);
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
  }
});

test('terms closure keeps source-byte and evaluation gates closed', () => {
  const terms = j(TERMS);

  assert.deepEqual(terms.boundary, {
    item_specific_terms_review_performed: true,
    all_24_pool_items_terms_reviewed: true,
    all_24_pool_items_redistribution_passed: false,
    source_bytes_opened: false,
    workbook_structure_inspected: false,
    sheet_selection_performed: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(terms.next_gate, {
    name:
      'resolve_19_non_census_exact_asset_identities_and_prospectively_replace_or_license_census_before_byte_open',
    non_census_exact_asset_identity_remaining_count: 19,
    census_pool_members_requiring_replacement_or_explicit_worldwide_redistribution_permission:
      5,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
