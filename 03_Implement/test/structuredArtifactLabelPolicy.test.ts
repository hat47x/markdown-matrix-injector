import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertStructuredArtifactReferenceTarget,
} from '../src/experimental/structuredArtifactNeutralTarget.js';
import {
  assertStructuredArtifactLabelPolicy,
  assertStructuredArtifactHoldoutCorpus,
  canonicalStructuredArtifactLabelPolicyJson,
  canonicalStructuredArtifactHoldoutCorpusJson,
  structuredArtifactLabelPolicyDigest,
  structuredArtifactHoldoutCorpusDigest,
} from '../src/experimental/structuredArtifactLabelPolicy.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const POLICY = 'structured-artifact-label-policy-v0.json';
const HOLDOUT = 'structured-artifact-holdout-corpus-v0.json';

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function sha256File(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

test('SAI-0F freezes label semantics and the eight-family holdout before observation generation', () => {
  const policyText = readFileSync(new URL(POLICY, FIXTURE_ROOT), 'utf8');
  const holdoutText = readFileSync(new URL(HOLDOUT, FIXTURE_ROOT), 'utf8');
  const policy = JSON.parse(policyText);
  const holdout = JSON.parse(holdoutText);

  assertStructuredArtifactLabelPolicy(policy);
  assertStructuredArtifactHoldoutCorpus(holdout);
  assert.equal(canonicalStructuredArtifactLabelPolicyJson(policy), policyText);
  assert.equal(canonicalStructuredArtifactHoldoutCorpusJson(holdout), holdoutText);
  assert.equal(
    structuredArtifactLabelPolicyDigest(policy),
    'sha256:3e249bc9e2f15de99c25c87b686efda1a8b97eaeb9fb57cec791593645d2a65b',
  );
  assert.equal(
    structuredArtifactHoldoutCorpusDigest(holdout),
    'sha256:7a40a779ea293956aa047fd1da96da7aa13a85cd659fca3da3d8b85f715951a7',
  );
  assert.equal(holdout.cases.length, 8);
});

test('holdout targets obey label-status semantics and exact-source binding', () => {
  const holdout = readJson(HOLDOUT);
  assertStructuredArtifactHoldoutCorpus(holdout);

  for (const entry of holdout.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    const targetName = entry.target_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(targetName);

    const source = readJson(sourceName);
    const target = readJson(targetName);
    assertStructuredArtifactReferenceTarget(target);

    assert.equal(target.source.source_digest, sha256File(sourceName));
    assert.equal(target.source.source_family_id, entry.source_family_id);
    assert.equal(source.source_family_id, entry.source_family_id);
    assert.equal(target.source.workbook_or_document, source.workbook_or_document);

    const tableLike = target.labels['region.table_like'];
    const ambiguity = target.labels['region.ambiguous_or_non_table'];
    if (entry.label_status === 'clear_positive') {
      assert.equal(tableLike?.value, true);
      assert.equal(ambiguity, undefined);
    } else if (entry.label_status === 'clear_negative') {
      assert.equal(tableLike?.value, false);
      assert.equal(ambiguity?.value, true);
    } else {
      assert.equal(tableLike, undefined);
      assert.equal(ambiguity?.value, true);
    }

    for (const label of Object.values(target.labels) as any[]) {
      assert.equal(
        label.labeler_or_rule_version,
        'sai-0f-table-like-semantics-v0',
      );
      assert.equal(label.blind_to_candidate_model, true);
      assert.equal(label.confidence, null);
    }
  }
});

test('historical KV target is preserved but excluded from future table-like fitting', () => {
  const policy = readJson(POLICY);
  const legacy = readJson(
    'structured-artifact-matched-target-non-table-kv-pairs-v0.json',
  );

  assert.equal(
    legacy.labels['region.table_like'].value,
    false,
  );
  assert.deepEqual(
    policy.legacy_design_exclusions,
    ['sai-h2-non-table-kv-pairs-v0'],
  );
});

test('holdout includes a clear positive all-text table so numeric transition cannot define table-like', () => {
  const target = readJson(
    'structured-artifact-holdout-target-table-text-records-4x3-v0.json',
  );
  const source = readJson(
    'structured-artifact-holdout-source-table-text-records-4x3-v0.json',
  );

  assert.equal(target.labels['region.table_like'].value, true);
  assert.ok(
    source.rows.slice(1).every(
      (row: unknown[]) => row.every((value) => typeof value === 'string'),
    ),
  );
});

test('SAI-0F policy and holdout fail closed on post-hoc scoring or relabeling', () => {
  const policy = readJson(POLICY);
  policy.boundary.historical_targets_rewritten = true;
  assert.throws(
    () => assertStructuredArtifactLabelPolicy(policy),
    /forbids target rewriting/,
  );

  const holdout = readJson(HOLDOUT);
  holdout.boundary.feature_scoring_performed = true;
  assert.throws(
    () => assertStructuredArtifactHoldoutCorpus(holdout),
    /must be frozen before observations, scoring, splitting, training, or runtime use/,
  );

  const relabeled = readJson(HOLDOUT);
  relabeled.cases[6].label_status = 'clear_negative';
  assert.throws(
    () => assertStructuredArtifactHoldoutCorpus(relabeled),
    /3 positive \/ 3 negative \/ 2 ambiguous/,
  );
});
