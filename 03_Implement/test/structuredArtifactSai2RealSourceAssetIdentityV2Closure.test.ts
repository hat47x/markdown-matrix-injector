import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v2.json';
const TERMS =
  'structured-artifact-sai2-real-source-item-terms-v2-closure-v0.json';
const REPLACEMENTS =
  'structured-artifact-sai2-real-source-asset-identity-v2-replacements-v0.json';
const ONS =
  'structured-artifact-sai2-real-source-asset-identity-ons-v0.json';
const REMAINING =
  'structured-artifact-sai2-real-source-asset-identity-remaining-v2-v0.json';
const CLOSURE =
  'structured-artifact-sai2-real-source-asset-identity-v2-closure-v0.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('identity closure binds the exact discovery-v2 and terms closures', () => {
  const closure = j(CLOSURE);

  assert.equal(
    closure.discovery_manifest_git_blob_sha,
    '7963bc0009129946cfa56ab1cbcc91e72884a235',
  );
  assert.equal(
    closure.terms_closure_git_blob_sha,
    'f2601cab28b89ef5bf100dbc40fcdb048d602eea',
  );
  assert.deepEqual(
    closure.identity_tranches.map((x: any) => [
      x.git_blob_sha,
      x.source_count,
      x.primary_count,
      x.reserve_count,
    ]),
    [
      ['b9c826f758aa4312d8f88645d96b4b09b36176bf', 5, 4, 1],
      ['057190806687c09d85d61a0fe12ac0a8716d0103', 7, 4, 3],
      ['c5d82b904bd4da0ff0489c160cad69e92b44baed', 12, 8, 4],
    ],
  );
});

test('identity closure covers exactly all twenty-four current v2 pool members', () => {
  const discovery = j(DISCOVERY);
  const replacements = j(REPLACEMENTS);
  const ons = j(ONS);
  const remaining = j(REMAINING);
  const closure = j(CLOSURE);

  const poolIds = [
    ...discovery.primary_sources,
    ...discovery.reserve_sources,
  ].map((x: any) => x.source_id).sort();

  const identityIds = [
    ...replacements.assets,
    ...ons.assets,
    ...remaining.assets,
  ].map((x: any) => x.source_id).sort();

  assert.equal(poolIds.length, 24);
  assert.deepEqual(identityIds, poolIds);
  assert.equal(new Set(identityIds).size, 24);
  assert.deepEqual(closure.aggregate, {
    current_pool_source_count: 24,
    primary_source_count: 16,
    reserve_source_count: 8,
    identity_resolved_count: 24,
    terms_pass_count: 24,
    source_bytes_opened_count: 0,
    source_digest_count: 0,
    workbook_structure_inspected_count: 0,
    target_authored_count: 0,
    candidate_generation_count: 0,
  });
});

test('terms closure and identity closure agree that all current pool members pass pre-byte gates', () => {
  const terms = j(TERMS);
  const closure = j(CLOSURE);

  assert.equal(terms.aggregate.current_pool_item_count, 24);
  assert.equal(terms.aggregate.current_pool_redistribution_pass_count, 24);
  assert.equal(closure.boundary.all_current_v2_terms_passed, true);
  assert.equal(closure.boundary.all_current_v2_asset_identities_resolved, true);
});

test('GLA reserve access issue remains fail-closed without blocking primary identity closure', () => {
  const closure = j(CLOSURE);

  assert.equal(closure.materialization_readiness.primary_identity_complete_count, 16);
  assert.equal(closure.materialization_readiness.reserve_identity_complete_count, 8);
  assert.equal(closure.materialization_readiness.primary_known_access_blocker_count, 0);
  assert.deepEqual(
    closure.materialization_readiness.reserve_known_access_pending_source_ids,
    ['sai2b-reserve-gla-london-cartogram-xlsx'],
  );
});

test('closure still forbids all workbook and evaluation work until Excel exact mirror', () => {
  const closure = j(CLOSURE);

  assert.equal(closure.boundary.cross_repository_identity_closure_mirrored, false);
  assert.equal(closure.boundary.source_bytes_opened, false);
  assert.equal(closure.boundary.workbook_structure_inspected, false);
  assert.equal(closure.boundary.targets_authored, false);
  assert.equal(closure.boundary.candidate_generation_performed, false);
  assert.equal(closure.boundary.real_source_winner_scoring_performed, false);
  assert.equal(closure.boundary.product_runtime_authority, false);

  assert.deepEqual(closure.next_gate, {
    name:
      'excel_exact_identity_closure_mirror_then_primary_materialization_and_blind_target_review',
    exact_excel_mirror_required: true,
    source_byte_open_admitted: false,
    primary_materialization_admitted_after_exact_excel_mirror: true,
    reserve_materialization_admitted_only_if_frozen_replacement_rule_requires_it: true,
    target_authoring_admitted: false,
    candidate_generation_admitted: false,
    portable_feature_capture_admitted: false,
    scoring_admitted: false,
  });
});
