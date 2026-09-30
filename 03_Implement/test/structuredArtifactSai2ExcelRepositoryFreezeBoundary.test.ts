import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const value = JSON.parse(
  readFileSync(
    new URL(
      './fixtures/structured-artifact-sai2-excel-repository-freeze-boundary-v0.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

test('Excel repository freeze requires explicit unfreeze and forbids access', () => {
  assert.equal(value.directive.received_at_utc, '2026-09-29T13:29:09Z');
  assert.equal(
    value.directive.repository,
    'hat47x/excel-houganshi-normalizer',
  );
  assert.equal(value.directive.status, 'frozen_by_explicit_user_instruction');
  assert.equal(value.directive.reads_admitted, false);
  assert.equal(value.directive.writes_admitted, false);
  assert.equal(value.directive.mirror_updates_admitted, false);
  assert.equal(value.directive.explicit_unfreeze_required, true);
});

test('freeze retains historical authority without extending equivalence', () => {
  assert.equal(
    value.retained_cross_repo_authority.closure_git_blob_sha,
    '245d11b331f25c4eafda3e797cd05b27e7ee40e2',
  );
  assert.equal(
    value.retained_cross_repo_authority.progress_snapshot_git_blob_sha,
    '0bd83e077beec9825392b44484ff4d6d95026509',
  );
  assert.equal(
    value.scientific_stop_lines
      .cross_repo_independent_verification_deferred_until_explicit_unfreeze,
    true,
  );
  assert.equal(
    value.scientific_stop_lines.cross_repo_equivalence_extension_admitted,
    false,
  );
  assert.equal(
    value.scientific_stop_lines.ordinal_2_admitted_by_mmi_local_verifier,
    false,
  );
});

test('MMI may validate exact local payload while semantic gates remain closed', () => {
  assert.equal(value.active_mmi.local_payload_validation_admitted, true);
  assert.equal(value.scientific_stop_lines.source_identity_change_admitted, false);
  assert.equal(value.scientific_stop_lines.reserve_substitution_admitted, false);
  assert.equal(
    value.scientific_stop_lines.workbook_semantic_inspection_admitted,
    false,
  );
  assert.equal(value.scientific_stop_lines.target_authoring_admitted, false);
  assert.equal(value.scientific_stop_lines.candidate_generation_admitted, false);
  assert.equal(value.scientific_stop_lines.feature_capture_admitted, false);
  assert.equal(value.scientific_stop_lines.scoring_admitted, false);
  assert.equal(value.scientific_stop_lines.metrics_admitted, false);
});
