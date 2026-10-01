import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V1 =
  'structured-artifact-sai2-real-source-discovery-manifest-v1.json';
const V2 =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('discovery v2 is prospective and supersedes v1 before byte open', () => {
  const v1 = j(V1);
  const v2 = j(V2);

  assert.equal(
    v2.amendment_provenance.supersedes_manifest_id,
    v1.manifest_id,
  );
  assert.equal(
    v2.amendment_provenance.supersedes_git_blob_sha,
    'b192a0bacbe2f2ac67c328da46bc0939ad39aca2',
  );
  assert.equal(
    v2.amendment_provenance.workbook_bytes_opened_before_amendment,
    false,
  );
  assert.equal(
    v2.amendment_provenance.candidate_or_ranker_behavior_consulted,
    false,
  );
});

test('v2 excludes all five Census candidates before download', () => {
  const v2 = j(V2);
  const rejected = v2.rejected_sources.filter(
    (x: any) => x.publisher_id === 'us-census',
  );

  assert.deepEqual(
    rejected.map((x: any) => x.source_id),
    [
      'sai2b-primary-census-spm-threshold',
      'sai2b-primary-census-hst-enroll01',
      'sai2b-primary-census-inc-ed',
      'sai2b-primary-census-tax-parameter-workbook',
      'sai2b-reserve-census-table15',
    ],
  );
  for (const item of rejected) {
    assert.equal(
      item.rejection_reason,
      'item_terms_or_third_party_rights_fail',
    );
    assert.equal(item.direct_asset_requested, false);
    assert.equal(item.workbook_bytes_opened, false);
    assert.equal(item.source_digest, null);
    assert.equal(item.reentry_allowed, false);
  }
});

test('v2 replaces only four Census primaries and one Census reserve', () => {
  const v2 = j(V2);

  const primaryIds = new Set(
    v2.primary_sources.map((x: any) => x.source_id),
  );
  const reserveIds = new Set(
    v2.reserve_sources.map((x: any) => x.source_id),
  );

  for (const id of [
    'sai2b-primary-stockport-contracts-register',
    'sai2b-primary-ea-licence-abstracts',
    'sai2b-primary-fca-mortgage-detailed-q3-2023',
    'sai2b-primary-defra-qds-template',
  ]) {
    assert.equal(primaryIds.has(id), true);
  }
  assert.equal(
    reserveIds.has('sai2b-reserve-cheltenham-fraud-2025-26'),
    true,
  );
  assert.equal(
    [...primaryIds, ...reserveIds].some(
      (id) => String(id).includes('census'),
    ),
    false,
  );
});

test('v2 preserves 16 primaries, four requested strata, and publisher caps', () => {
  const v2 = j(V2);
  const publisherCounts = new Map<string, number>();
  const stratumCounts = new Map<string, number>();

  assert.equal(v2.primary_sources.length, 16);
  assert.equal(v2.reserve_sources.length, 8);

  for (const source of v2.primary_sources) {
    publisherCounts.set(
      source.publisher_id,
      (publisherCounts.get(source.publisher_id) ?? 0) + 1,
    );
    stratumCounts.set(
      source.requested_stratum,
      (stratumCounts.get(source.requested_stratum) ?? 0) + 1,
    );
  }

  assert.equal(publisherCounts.size, 7);
  assert.equal(
    [...publisherCounts.values()].every((count) => count <= 4),
    true,
  );
  assert.deepEqual(
    Object.fromEntries([...stratumCounts.entries()].sort()),
    {
      ambiguous_peer_regions: 4,
      clear_primary_with_context: 4,
      clear_single_primary_table: 4,
      non_tabular_or_form: 4,
    },
  );
});

test('all v2 replacements are metadata-only explicit-OGL candidates', () => {
  const v2 = j(V2);
  const replacementIds = new Set([
    'sai2b-primary-stockport-contracts-register',
    'sai2b-primary-ea-licence-abstracts',
    'sai2b-primary-fca-mortgage-detailed-q3-2023',
    'sai2b-primary-defra-qds-template',
    'sai2b-reserve-cheltenham-fraud-2025-26',
  ]);

  const replacements = [
    ...v2.primary_sources,
    ...v2.reserve_sources,
  ].filter((x: any) => replacementIds.has(x.source_id));

  assert.equal(replacements.length, 5);
  for (const item of replacements) {
    assert.equal(item.item_specific_terms_status, 'pass_dataset_level_ogl');
    assert.equal(item.direct_asset_url, null);
    assert.equal(item.source_digest, null);
    assert.equal(item.sheet_identity, null);
    assert.equal(item.target, null);
    assert.equal(item.status, 'discovered_not_materialized');
  }
});

test('v2 still forbids source opening and evaluation before Excel mirror', () => {
  const v2 = j(V2);

  assert.equal(v2.boundary.source_bytes_opened, false);
  assert.equal(v2.boundary.targets_authored, false);
  assert.equal(v2.boundary.candidate_generation_performed, false);
  assert.equal(v2.boundary.real_source_winner_scoring_performed, false);
  assert.equal(v2.boundary.product_runtime_authority, false);
  assert.deepEqual(v2.next_gate, {
    name:
      'excel_exact_discovery_manifest_v2_mirror_then_complete_exact_asset_identity',
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
