import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V0 =
  'structured-artifact-sai2-real-source-discovery-manifest-v0.json';
const V1 =
  'structured-artifact-sai2-real-source-discovery-manifest-v1.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('SAI-2B discovery v1 is a prospective metadata-only amendment of v0', () => {
  const v0 = j(V0);
  const v1 = j(V1);

  assert.equal(
    v1.amendment_provenance.supersedes_manifest_id,
    v0.manifest_id,
  );
  assert.equal(
    v1.amendment_provenance.supersedes_git_blob_sha,
    '4922fd56a473ed4f4e69e8416357ea020355346b',
  );
  assert.equal(
    v1.amendment_provenance.workbook_bytes_opened_before_amendment,
    false,
  );
  assert.equal(
    v1.amendment_provenance.candidate_or_ranker_behavior_consulted,
    false,
  );
});

test('v1 rejects both ABS survey-questionnaire candidates before download', () => {
  const v1 = j(V1);
  assert.deepEqual(
    v1.rejected_sources.map((x: any) => x.source_id),
    [
      'sai2b-primary-abs-lfs-questionnaire',
      'sai2b-reserve-abs-qualifications-questionnaire',
    ],
  );
  for (const rejected of v1.rejected_sources) {
    assert.equal(
      rejected.rejection_reason,
      'item_terms_or_third_party_rights_fail',
    );
    assert.equal(rejected.direct_asset_requested, false);
    assert.equal(rejected.workbook_bytes_opened, false);
    assert.equal(rejected.reentry_allowed, false);
  }
});

test('v1 replaces only the rejected non-tabular primary and reserve', () => {
  const v0 = j(V0);
  const v1 = j(V1);

  assert.equal(v1.primary_sources.length, 16);
  assert.equal(v1.reserve_sources.length, 8);
  assert.equal(
    v1.primary_sources.some(
      (x: any) =>
        x.source_id ===
        'sai2b-primary-defra-natural-capital-template',
    ),
    true,
  );
  assert.equal(
    v1.reserve_sources.some(
      (x: any) =>
        x.source_id ===
        'sai2b-reserve-gla-london-cartogram-xlsx',
    ),
    true,
  );

  const unchangedPrimaryV0 = v0.primary_sources
    .filter(
      (x: any) =>
        x.source_id !== 'sai2b-primary-abs-lfs-questionnaire',
    )
    .map((x: any) => x.source_id);
  const unchangedPrimaryV1 = v1.primary_sources
    .filter(
      (x: any) =>
        x.source_id !==
        'sai2b-primary-defra-natural-capital-template',
    )
    .map((x: any) => x.source_id);
  assert.deepEqual(unchangedPrimaryV1, unchangedPrimaryV0);
});

test('v1 final primary pool preserves preregistered publisher and stratum constraints', () => {
  const v1 = j(V1);
  const publisherCounts = new Map<string, number>();
  const stratumCounts = new Map<string, number>();

  for (const source of v1.primary_sources) {
    publisherCounts.set(
      source.publisher_id,
      (publisherCounts.get(source.publisher_id) ?? 0) + 1,
    );
    stratumCounts.set(
      source.requested_stratum,
      (stratumCounts.get(source.requested_stratum) ?? 0) + 1,
    );
  }

  assert.equal(publisherCounts.size >= 4, true);
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

test('v1 remains byte-blind and opens only exact mirror then terms/asset identity', () => {
  const v1 = j(V1);

  assert.equal(v1.discovery_policy.source_bytes_opened, false);
  assert.equal(v1.discovery_policy.direct_asset_requests_performed, false);
  assert.equal(v1.boundary.source_bytes_opened, false);
  assert.equal(v1.boundary.targets_authored, false);
  assert.equal(v1.boundary.candidate_generation_performed, false);
  assert.equal(v1.boundary.real_source_winner_scoring_performed, false);
  assert.deepEqual(v1.next_gate, {
    name:
      'excel_exact_discovery_manifest_v1_mirror_then_complete_item_terms_and_exact_asset_identity',
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
