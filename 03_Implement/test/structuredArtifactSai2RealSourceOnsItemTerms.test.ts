import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const TERMS =
  'structured-artifact-sai2-real-source-item-terms-ons-v0.json';
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v1.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('ONS item-terms review covers only frozen discovery-v1 pool members', () => {
  const terms = j(TERMS);
  const discovery = j(DISCOVERY);
  const pool = new Map(
    [...discovery.primary_sources, ...discovery.reserve_sources]
      .map((x: any) => [x.source_id, x]),
  );

  assert.equal(
    terms.discovery_manifest_git_blob_sha,
    'b192a0bacbe2f2ac67c328da46bc0939ad39aca2',
  );
  assert.equal(terms.publisher_id, 'ons');
  assert.equal(terms.items.length, 7);

  for (const item of terms.items) {
    const frozen: any = pool.get(item.source_id);
    assert.ok(frozen);
    assert.equal(frozen.publisher_id, 'ons');
    assert.equal(item.role, frozen.role);
    assert.equal(item.requested_stratum, frozen.requested_stratum);
  }
});

test('ONS dataset items pass OGL review without claiming unresolved href identity', () => {
  const terms = j(TERMS);

  assert.equal(terms.publisher_terms.license, 'Open Government Licence v3.0');
  for (const item of terms.items) {
    assert.equal(
      item.item_specific_terms_status,
      'pass_ogl_v3_no_dataset_page_exception_observed',
    );
    assert.equal(
      item.exact_asset_identity_status,
      'pending_href_resolution_without_dereference',
    );
    assert.equal(item.direct_asset_url, null);
    assert.equal(item.asset_dereferenced, false);
    assert.equal(item.source_digest, null);
  }
  assert.deepEqual(terms.aggregate, {
    reviewed_item_count: 7,
    terms_pass_count: 7,
    terms_fail_count: 0,
    exact_asset_identity_resolved_count: 0,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
  });
});

test('ONS terms tranche keeps all content and evaluation gates closed', () => {
  const terms = j(TERMS);

  assert.deepEqual(terms.boundary, {
    item_specific_terms_review_performed: true,
    exact_asset_identity_resolution_performed: false,
    source_bytes_opened: false,
    workbook_structure_inspected: false,
    sheet_selection_performed: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
  });
  assert.equal(terms.next_gate.ons_source_byte_open_admitted, false);
  assert.equal(terms.next_gate.target_authoring_admitted, false);
  assert.equal(terms.next_gate.candidate_generation_admitted, false);
  assert.equal(terms.next_gate.scoring_admitted, false);
});
