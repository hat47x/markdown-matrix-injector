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

test('SAI-2B discovery correction remains prospective and byte-blind', () => {
  const manifest = readManifest();

  assert.equal(
    manifest.upstream.preregistration_git_blob_sha,
    'e4e4b030e070b37f63d25d41e1817c620102740e',
  );
  assert.equal(
    manifest.correction_provenance.superseded_metadata_only_commit,
    '0aef20b890683ee008237ce73cd85f3fc672e825',
  );
  assert.equal(manifest.discovery_policy.source_bytes_opened, false);
  assert.equal(manifest.discovery_policy.direct_asset_requests_performed, false);
  assert.equal(manifest.discovery_policy.workbook_structure_inspected, false);
  assert.equal(manifest.discovery_policy.targets_authored, false);
  assert.equal(manifest.discovery_policy.candidate_generation_performed, false);
});

test('discovery freezes sixteen primaries and eight reserves before opening bytes', () => {
  const manifest = readManifest();

  assert.equal(manifest.primary_sources.length, 16);
  assert.equal(manifest.reserve_sources.length, 8);
  assert.equal(
    new Set(
      [...manifest.primary_sources, ...manifest.reserve_sources]
        .map((source: any) => source.source_id),
    ).size,
    24,
  );

  const publishers = new Map<string, number>();
  const strata = new Map<string, number>();
  for (const source of manifest.primary_sources) {
    publishers.set(
      source.publisher_id,
      (publishers.get(source.publisher_id) ?? 0) + 1,
    );
    strata.set(
      source.requested_stratum,
      (strata.get(source.requested_stratum) ?? 0) + 1,
    );
  }
  assert.deepEqual(
    Object.fromEntries([...publishers.entries()].sort()),
    { abs: 4, ons: 4, 'stats-nz': 4, 'us-census': 4 },
  );
  assert.deepEqual(
    Object.fromEntries([...strata.entries()].sort()),
    {
      ambiguous_peer_regions: 4,
      clear_primary_with_context: 4,
      clear_single_primary_table: 4,
      non_tabular_or_form: 4,
    },
  );

  const reserveStrata = new Map<string, number>();
  for (const source of manifest.reserve_sources) {
    reserveStrata.set(
      source.requested_stratum,
      (reserveStrata.get(source.requested_stratum) ?? 0) + 1,
    );
  }
  assert.deepEqual(
    Object.fromEntries([...reserveStrata.entries()].sort()),
    {
      ambiguous_peer_regions: 2,
      clear_primary_with_context: 2,
      clear_single_primary_table: 2,
      non_tabular_or_form: 2,
    },
  );
});

test('publisher terms are not promoted to item-level redistribution approval', () => {
  const manifest = readManifest();

  assert.equal(manifest.publishers.length, 4);
  for (const publisher of manifest.publishers) {
    assert.equal(publisher.item_specific_exception_check_required, true);
    assert.equal(
      publisher.redistribution_status,
      'publisher_default_basis_only_not_item_verified',
    );
  }

  for (const source of [
    ...manifest.primary_sources,
    ...manifest.reserve_sources,
  ]) {
    assert.equal(source.item_specific_terms_status, 'pending');
    assert.equal(source.direct_asset_url, null);
    assert.equal(source.source_digest, null);
    assert.equal(source.sheet_identity, null);
    assert.equal(source.target, null);
    assert.equal(source.status, 'discovered_not_materialized');
  }
});

test('replacement reasons are frozen before content review and cannot use model behavior', () => {
  const manifest = readManifest();

  assert.deepEqual(manifest.pool_policy.replacement_reasons, [
    'item_terms_or_third_party_rights_fail',
    'not_exactly_xlsx_or_bytes_unreadable',
    'duplicate_workbook_identity',
    'pii_or_confidential_content',
    'blind_target_authority_unresolved',
    'blind_target_review_stratum_mismatch',
  ]);
  assert.equal(
    manifest.pool_policy.replacement_allowed_only_before_candidate_generation,
    true,
  );
  assert.equal(
    manifest.pool_policy.ranker_candidate_or_metric_behavior_may_influence_replacement,
    false,
  );
});

test('only exact mirror, item terms, and asset identity resolution are opened next', () => {
  const manifest = readManifest();

  assert.deepEqual(manifest.boundary, {
    source_discovery_performed: true,
    publisher_level_reuse_basis_reviewed: true,
    item_specific_terms_review_completed: false,
    exact_asset_identity_frozen: false,
    source_bytes_opened: false,
    workbook_structure_inspected: false,
    targets_authored: false,
    candidate_generation_performed: false,
    portable_feature_capture_performed: false,
    real_source_winner_scoring_performed: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(manifest.next_gate, {
    name:
      'excel_exact_discovery_manifest_mirror_then_item_terms_and_exact_asset_identity',
    exact_discovery_manifest_mirror_required: true,
    item_specific_terms_review_admitted_after_mirror: true,
    exact_asset_identity_resolution_admitted_after_mirror: true,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    portable_feature_capture_admitted: false,
    scoring_admitted: false,
  });
});
