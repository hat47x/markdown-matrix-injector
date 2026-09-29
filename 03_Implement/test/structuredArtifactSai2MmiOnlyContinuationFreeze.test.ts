import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('./fixtures/', import.meta.url);
const FREEZE =
  'structured-artifact-sai2-mmi-only-continuation-freeze-v0.json';
const V7 =
  'structured-artifact-sai2-offline-handoff-runtime-conformance-closure-v7.json';

function j(name: string): any {
  return JSON.parse(readFileSync(new URL(name, ROOT), 'utf8'));
}

test('MMI-only continuation binds authoritative v7 and attempt-003', () => {
  const freeze = j(FREEZE);
  const v7 = j(V7);

  assert.equal(
    freeze.authority.runtime_conformance_git_blob_sha,
    '245d11b331f25c4eafda3e797cd05b27e7ee40e2',
  );
  assert.equal(
    freeze.authority.runtime_conformance_closure_id,
    v7.closure_id,
  );
  assert.equal(
    freeze.authority.authoritative_progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(freeze.authority.frozen_ordinal, 1);
  assert.equal(freeze.authority.frozen_source_id, 'sai2b-primary-ons-x01');
});

test('Excel is frozen as historical evidence and no longer a mutation target', () => {
  const freeze = j(FREEZE);

  assert.deepEqual(freeze.frozen_consumer, {
    repository: 'hat47x/excel-houganshi-normalizer',
    status: 'frozen_no_further_work_required',
    last_cross_repo_conformance: 'v7',
    no_future_mirror_required_for_mmi_only_changes: true,
    historical_evidence_retained: true,
    historical_runtime_bindings_remain_read_only: true,
  });
  assert.equal(freeze.scientific_scope.excel_execution_or_mutation_admitted, false);
  assert.equal(
    freeze.scientific_scope.cross_repo_equivalence_claims_after_freeze_admitted,
    false,
  );
});

test('MMI-only continuation preserves branch and scientific boundaries', () => {
  const freeze = j(FREEZE);

  assert.deepEqual(freeze.active_consumer, {
    repository: 'hat47x/markdown-matrix-injector',
    status: 'active',
    retained_branch: 'research/structured-artifact-sai2-region-proposal-v0',
    branch_must_merge_back_to_main: true,
    continuation_branch_creation_admitted: false,
  });
  assert.equal(freeze.scientific_scope.current_source_identity_change_admitted, false);
  assert.equal(freeze.scientific_scope.reserve_substitution_admitted, false);
  assert.equal(
    freeze.scientific_scope.ordinal_2_before_mmi_ordinal_1_success_admitted,
    false,
  );
});

test('external importer evidence does not become MMI payload success', () => {
  const freeze = j(FREEZE);

  assert.equal(freeze.current_evidence.external_binary_import_observed, true);
  assert.equal(freeze.current_evidence.external_binary_import_content_length, 422304);
  assert.equal(
    freeze.current_evidence.external_binary_import_content_type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.equal(
    freeze.current_evidence.external_binary_import_verifier_accessible_bytes,
    false,
  );
  assert.equal(freeze.current_evidence.payload_bytes_present_in_mmi, false);
  assert.equal(freeze.current_evidence.source_digest_present_in_mmi, false);
  assert.equal(freeze.current_evidence.ordinal_2_admitted, false);
});

test('only MMI-local exact ordinal-1 binary validation is admitted next', () => {
  const freeze = j(FREEZE);

  assert.equal(
    freeze.next_gate.name,
    'mmi_only_external_binary_fetch_same_frozen_ordinal_1_request',
  );
  assert.equal(freeze.next_gate.excel_mirror_required, false);
  assert.equal(freeze.next_gate.source_identity_change_admitted, false);
  assert.equal(freeze.next_gate.reserve_substitution_admitted, false);
  assert.equal(freeze.next_gate.workbook_semantic_inspection_admitted, false);
  assert.equal(freeze.next_gate.candidate_generation_admitted, false);
  assert.equal(freeze.next_gate.scoring_admitted, false);
});
