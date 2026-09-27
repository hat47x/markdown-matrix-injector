import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const TERMS =
  'structured-artifact-sai2-real-source-item-terms-open-license-publishers-v0.json';
const DISCOVERY =
  'structured-artifact-sai2-real-source-discovery-manifest-v1.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('open-license terms tranche covers twelve retained non-Census pool members', () => {
  const terms = j(TERMS);
  const discovery = j(DISCOVERY);
  const pool = new Map(
    [...discovery.primary_sources, ...discovery.reserve_sources]
      .map((x: any) => [x.source_id, x]),
  );

  assert.equal(terms.items.length, 12);
  assert.deepEqual(
    [...new Set(terms.items.map((x: any) => x.publisher_id))].sort(),
    ['abs', 'defra', 'gla', 'stats-nz'],
  );
  for (const item of terms.items) {
    const frozen: any = pool.get(item.source_id);
    assert.ok(frozen);
    assert.equal(item.publisher_id, frozen.publisher_id);
    assert.equal(item.role, frozen.role);
    assert.equal(item.requested_stratum, frozen.requested_stratum);
  }
});

test('all twelve items pass explicit/default open licences but href identity remains unresolved', () => {
  const terms = j(TERMS);

  assert.equal(terms.aggregate.reviewed_item_count, 12);
  assert.equal(terms.aggregate.terms_pass_count, 12);
  assert.equal(terms.aggregate.terms_fail_count, 0);
  assert.equal(
    terms.aggregate.total_terms_reviewed_with_ons_tranche,
    19,
  );
  assert.equal(terms.aggregate.census_terms_still_pending_count, 5);

  for (const item of terms.items) {
    assert.match(item.item_specific_terms_status, /^pass_/u);
    assert.equal(
      item.exact_asset_identity_status,
      'pending_href_resolution_without_dereference',
    );
    assert.equal(item.direct_asset_url, null);
    assert.equal(item.asset_dereferenced, false);
    assert.equal(item.source_digest, null);
  }
});

test('Census remains fail-closed on redistribution scope', () => {
  const terms = j(TERMS);

  assert.equal(terms.census_boundary.source_ids.length, 5);
  assert.equal(
    terms.census_boundary.status,
    'pending_redistribution_scope_review_due_foreign_copyright_and_third_party_caveat',
  );
  assert.equal(
    terms.census_boundary.source_byte_open_admitted,
    false,
  );
});

test('terms review still forbids all workbook and evaluation work', () => {
  const terms = j(TERMS);

  assert.equal(terms.boundary.all_24_pool_items_terms_closed, false);
  assert.equal(terms.boundary.source_bytes_opened, false);
  assert.equal(terms.boundary.workbook_structure_inspected, false);
  assert.equal(terms.boundary.targets_authored, false);
  assert.equal(terms.boundary.candidate_generation_performed, false);
  assert.equal(terms.boundary.real_source_winner_scoring_performed, false);
  assert.equal(terms.boundary.product_runtime_authority, false);
  assert.equal(terms.next_gate.source_byte_open_admitted, false);
  assert.equal(terms.next_gate.candidate_generation_admitted, false);
  assert.equal(terms.next_gate.scoring_admitted, false);
});
