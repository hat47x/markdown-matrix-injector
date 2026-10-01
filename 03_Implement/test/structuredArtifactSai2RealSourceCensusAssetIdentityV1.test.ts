import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V1 = 'structured-artifact-sai2-real-source-discovery-manifest-v1.json';
const OLD = 'structured-artifact-sai2-real-source-asset-identity-us-census-v0.json';
const REBOUND = 'structured-artifact-sai2-real-source-asset-identity-us-census-v1.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('Census identities rebind unchanged to discovery v1 members', () => {
  const discovery = j(V1);
  const oldTranche = j(OLD);
  const rebound = j(REBOUND);
  const pool = new Map(
    [...discovery.primary_sources, ...discovery.reserve_sources]
      .map((x: any) => [x.source_id, x]),
  );

  assert.equal(
    rebound.discovery_manifest_git_blob_sha,
    'b192a0bacbe2f2ac67c328da46bc0939ad39aca2',
  );
  assert.equal(rebound.assets.length, 5);
  assert.deepEqual(rebound.assets, oldTranche.assets);
  for (const asset of rebound.assets) {
    const frozen: any = pool.get(asset.source_id);
    assert.ok(frozen);
    assert.equal(frozen.publisher_id, 'us-census');
    assert.equal(asset.role, frozen.role);
    assert.equal(asset.requested_stratum, frozen.requested_stratum);
  }
});

test('Census v1 rebind preserves byte-blindness and pending terms', () => {
  const rebound = j(REBOUND);

  assert.equal(
    rebound.authority_status,
    'identity_bound_to_v1_terms_pending_not_authoritative_for_source_open',
  );
  assert.equal(rebound.authoritative_for_source_open, false);
  assert.deepEqual(rebound.rebound_provenance, {
    predecessor_tranche_id:
      'sai-2b-real-source-asset-identity-us-census-v0',
    predecessor_git_blob_sha:
      '2f6d62851944531e5bb2135f1a2f876e0655f608',
    discovery_v1_excel_exact_mirror_completed: true,
    asset_identity_values_changed: false,
    workbook_bytes_opened_during_rebind: false,
  });
  for (const asset of rebound.assets) {
    assert.equal(asset.asset_dereferenced, false);
    assert.equal(asset.source_digest, null);
    assert.equal(asset.item_specific_terms_status, 'pending');
  }
  assert.equal(rebound.boundary.source_bytes_opened, false);
  assert.equal(rebound.boundary.targets_authored, false);
  assert.equal(rebound.boundary.candidate_generation_performed, false);
  assert.equal(rebound.boundary.real_source_winner_scoring_performed, false);
});

test('Census v1 rebind opens only remaining metadata and terms work', () => {
  const rebound = j(REBOUND);

  assert.deepEqual(rebound.next_gate, {
    name:
      'complete_item_specific_terms_review_and_remaining_19_asset_identities',
    remaining_asset_identity_count: 19,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    scoring_admitted: false,
  });
});
