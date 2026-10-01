import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const V2 =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const CLOSURE =
  'structured-artifact-sai2-real-source-item-terms-v2-closure-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('v2 terms closure covers exactly the current 24-source pool', () => {
  const v2 = j(V2);
  const closure = j(CLOSURE);
  const poolIds = [
    ...v2.primary_sources,
    ...v2.reserve_sources,
  ].map((x: any) => x.source_id).sort();
  const closureIds = [
    ...closure.inherited_terms.source_ids,
    ...closure.replacement_terms.items.map((x: any) => x.source_id),
  ].sort();

  assert.equal(
    closure.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
  assert.equal(poolIds.length, 24);
  assert.deepEqual(closureIds, poolIds);
});

test('only unchanged v1 members inherit prior terms, while five replacements use v2 dataset-level OGL evidence', () => {
  const closure = j(CLOSURE);

  assert.equal(closure.inherited_terms.source_count, 19);
  assert.deepEqual(
    closure.inherited_terms.evidence.map((x: any) => [
      x.git_blob_sha,
      x.source_count,
    ]),
    [
      ['098ec6ec413ac90c338919750d91bc3512e718dc', 7],
      ['80fad2b03d61239c6756900cf24e2f8ca6fc285f', 12],
    ],
  );
  assert.equal(closure.replacement_terms.source_count, 5);
  for (const item of closure.replacement_terms.items) {
    assert.equal(item.item_specific_terms_status, 'pass_dataset_level_ogl');
  }
  assert.equal(
    closure.audit_only_rejected_terms.current_pool_authority,
    false,
  );
});

test('all current v2 pool terms pass without opening any workbook byte', () => {
  const closure = j(CLOSURE);

  assert.deepEqual(closure.aggregate, {
    current_pool_item_count: 24,
    inherited_terms_pass_count: 19,
    replacement_terms_pass_count: 5,
    current_pool_terms_reviewed_count: 24,
    current_pool_redistribution_pass_count: 24,
    current_pool_terms_fail_count: 0,
    source_bytes_opened_count: 0,
    asset_dereferenced_count: 0,
    source_digest_count: 0,
  });
  assert.equal(
    closure.boundary.current_v2_pool_item_specific_terms_review_completed,
    true,
  );
  assert.equal(
    closure.boundary.current_v2_pool_redistribution_gate_passed,
    true,
  );
  assert.equal(closure.boundary.source_bytes_opened, false);
  assert.equal(closure.boundary.candidate_generation_performed, false);
  assert.equal(closure.boundary.real_source_winner_scoring_performed, false);
});

test('the only next gate is metadata-only exact asset identity for all 24 v2 members', () => {
  const closure = j(CLOSURE);

  assert.deepEqual(closure.next_gate, {
    name: 'resolve_all_24_v2_exact_asset_identities_without_dereference',
    exact_asset_identity_remaining_count: 24,
    source_byte_open_admitted: false,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    portable_feature_capture_admitted: false,
    scoring_admitted: false,
  });
});
