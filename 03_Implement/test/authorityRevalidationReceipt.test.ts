import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import {
  createCognitiveReviewEnvelope,
  type AuthorityRevalidationCheck,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
  bindAuthorityRevalidationReceipt,
  type AuthorityRevalidationCheckResult,
  type AuthorityRevalidationReceiptV1,
  type AuthorityRevalidationScope,
} from '../src/experimental/authorityRevalidationReceipt.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  formatProfileToWorksheetPrototype,
} from '../src/experimental/formatProfile.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
} from '../src/experimental/flyWorksheetFormatPerceptionProvider.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const sourceDigest = 'sha256:authority-revalidation-source';

function snapshot(): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      { row: 1, column: 0, text: 'ID', fillTone: 'dark' },
      { row: 1, column: 1, text: 'State', fillTone: 'dark' },
      { row: 2, column: 0, text: '1' },
      { row: 2, column: 1, text: 'ready' },
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    }],
  };
}

function reviewEnvelope() {
  const rawPrototype = createWorksheetFormatPrototype(
    'release-table',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Authority receipt fixture',
      prototype: rawPrototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline-release-table',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );

  const match = matchWorksheetFormatSnapshot(
    snapshot(),
    [
      formatProfileToWorksheetPrototype(
        profile,
        SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      ),
    ],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const observation: CognitiveObservation<{ kind: string }> = {
    id: 'perception-observation',
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    payload: { kind: 'worksheet-format' },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
  };

  return createCognitiveReviewEnvelope({
    perception: adaptWorksheetFormatMatchToCognitiveOutcome(
      observation,
      match,
    ),
    approvedProfiles: [profile],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  });
}

function receipt(
  scope: AuthorityRevalidationScope,
  overrides: Partial<Record<
    AuthorityRevalidationCheck,
    AuthorityRevalidationCheckResult['status']
  >> = {},
): AuthorityRevalidationReceiptV1 {
  const envelope = reviewEnvelope();
  const checks = envelope.authorityRevalidation.map((requirement) => {
    const defaultStatus: AuthorityRevalidationCheckResult['status'] =
      requirement.appliesTo === 'always'
        ? 'passed'
        : scope === 'review-evidence'
          ? 'not-applicable'
          : 'passed';
    const status = overrides[requirement.check] ?? defaultStatus;
    return {
      check: requirement.check,
      status,
      evidenceCode: status === 'not-applicable'
        ? 'NO_EXECUTABLE_PROPOSAL'
        : `${requirement.check.toUpperCase().replaceAll('-', '_')}_${status.toUpperCase()}`,
    };
  });

  return {
    schemaVersion: AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
    envelopeSchemaVersion: envelope.schemaVersion,
    sourceDigest,
    scope,
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.authority.test-harness',
      componentVersion: '1',
      runId: `run-${scope}`,
    },
    checks,
  };
}

test('binds a review-evidence receipt without mutating pending envelope requirements', () => {
  const envelope = reviewEnvelope();
  const before = structuredClone(envelope.authorityRevalidation);
  const binding = bindAuthorityRevalidationReceipt(
    envelope,
    receipt('review-evidence'),
  );

  assert.equal(binding.status, 'satisfied');
  assert.deepEqual(binding.failedChecks, []);
  assert.deepEqual(
    binding.checks
      .filter((result) =>
        ['parser', 'parameter-schema', 'resolver', 'containment', 'source-existence', 'preview']
          .includes(result.check))
      .map((result) => result.status),
    new Array(6).fill('not-applicable'),
  );
  assert.deepEqual(envelope.authorityRevalidation, before);
  assert.ok(
    envelope.authorityRevalidation.every(
      (requirement) => requirement.state === 'pending',
    ),
  );
});

test('blocks review-evidence binding when an always check fails', () => {
  const binding = bindAuthorityRevalidationReceipt(
    reviewEnvelope(),
    receipt('review-evidence', {
      'profile-compatibility': 'failed',
    }),
  );

  assert.equal(binding.status, 'blocked');
  assert.deepEqual(binding.failedChecks, ['profile-compatibility']);
});

test('accepts executable-proposal scope only when all conditional checks are evaluated', () => {
  const satisfied = bindAuthorityRevalidationReceipt(
    reviewEnvelope(),
    receipt('executable-proposal'),
  );
  assert.equal(satisfied.status, 'satisfied');

  const blocked = bindAuthorityRevalidationReceipt(
    reviewEnvelope(),
    receipt('executable-proposal', {
      containment: 'failed',
    }),
  );
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.failedChecks, ['containment']);
});

test('rejects applicability violations for both scopes', () => {
  assert.throws(
    () => bindAuthorityRevalidationReceipt(
      reviewEnvelope(),
      receipt('review-evidence', {
        parser: 'passed',
      }),
    ),
    /must be not-applicable in review-evidence scope/,
  );

  assert.throws(
    () => bindAuthorityRevalidationReceipt(
      reviewEnvelope(),
      receipt('executable-proposal', {
        preview: 'not-applicable',
      }),
    ),
    /cannot be not-applicable in executable-proposal scope/,
  );

  assert.throws(
    () => bindAuthorityRevalidationReceipt(
      reviewEnvelope(),
      receipt('review-evidence', {
        'source-identity': 'not-applicable',
      }),
    ),
    /Always-required Authority check cannot be not-applicable/,
  );
});

test('rejects source digest mismatch', () => {
  const mismatched = {
    ...receipt('review-evidence'),
    sourceDigest: 'sha256:other-source',
  };

  assert.throws(
    () => bindAuthorityRevalidationReceipt(reviewEnvelope(), mismatched),
    /source digest does not match/,
  );
});

test('rejects duplicate, missing, and extra check results', () => {
  const base = receipt('review-evidence');

  assert.throws(
    () => bindAuthorityRevalidationReceipt(reviewEnvelope(), {
      ...base,
      checks: [...base.checks, base.checks[0]!],
    }),
    /Duplicate Authority revalidation check result/,
  );

  assert.throws(
    () => bindAuthorityRevalidationReceipt(reviewEnvelope(), {
      ...base,
      checks: base.checks.slice(1),
    }),
    /missing checks/,
  );

  assert.throws(
    () => bindAuthorityRevalidationReceipt(reviewEnvelope(), {
      ...base,
      checks: [
        ...base.checks,
        {
          check: 'unknown-check' as never,
          status: 'passed',
          evidenceCode: 'UNKNOWN',
        },
      ],
    }),
    /extra check/,
  );
});

test('requires non-empty evidence codes and Authority issuer metadata', () => {
  const base = receipt('review-evidence');
  assert.throws(
    () => bindAuthorityRevalidationReceipt(reviewEnvelope(), {
      ...base,
      checks: base.checks.map((result, index) =>
        index === 0
          ? { ...result, evidenceCode: '   ' }
          : result),
    }),
    /evidenceCode/,
  );

  assert.throws(
    () => bindAuthorityRevalidationReceipt(reviewEnvelope(), {
      ...base,
      issuer: {
        ...base.issuer,
        componentId: '   ',
      },
    }),
    /issuer.componentId/,
  );
});

test('canonicalizes binding check order to the envelope requirement order', () => {
  const envelope = reviewEnvelope();
  const base = receipt('review-evidence');
  const binding = bindAuthorityRevalidationReceipt(envelope, {
    ...base,
    checks: [...base.checks].reverse(),
  });

  assert.deepEqual(
    binding.checks.map((result) => result.check),
    envelope.authorityRevalidation.map((requirement) => requirement.check),
  );
});
