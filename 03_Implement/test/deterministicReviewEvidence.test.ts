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
  createCognitiveReviewPresentation,
} from '../src/experimental/cognitiveReviewPresentation.js';
import {
  AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
  type AuthorityRevalidationCheckResult,
  type AuthorityRevalidationReceiptV1,
} from '../src/experimental/authorityRevalidationReceipt.js';
import {
  createVerifiedCognitiveReviewSurface,
} from '../src/experimental/authorityVerificationOverlay.js';
import {
  DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
  DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION,
  createDeterministicReviewEvidenceSurface,
  createWorksheetFormatDeterministicReviewEvidence,
} from '../src/experimental/deterministicReviewEvidence.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  formatProfileToWorksheetPrototype,
} from '../src/experimental/formatProfile.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
} from '../src/experimental/flyWorksheetFormatPerceptionProvider.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  evaluateWorksheetFormatFillReviewTelemetry,
  type WorksheetFormatFillReviewCase,
} from '../src/experimental/worksheetFormatFillReviewTelemetry.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const SOURCE_DIGEST = 'sha256:deterministic-review-source';

function snapshot(
  labels: readonly string[],
  fill: FormatFillTone | null = 'dark',
): WorksheetFormatSnapshot {
  const cells: Array<{
    row: number;
    column: number;
    text: string;
    fillTone?: FormatFillTone;
  }> = [{ row: 0, column: 0, text: 'Table' }];

  labels.forEach((label, column) => {
    cells.push({
      row: 1,
      column,
      text: label,
      ...(fill ? { fillTone: fill } : {}),
    });
  });

  for (let row = 2; row < 5; row += 1) {
    labels.forEach((_, column) => {
      cells.push({
        row,
        column,
        text: `r${row - 1}c${column + 1}`,
      });
    });
  }

  return {
    cells,
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: labels.length - 1,
    }],
  };
}

interface PrototypeFixture {
  id: string;
  label: string;
  snapshot: WorksheetFormatSnapshot;
}

function artifacts(
  observationSnapshot: WorksheetFormatSnapshot,
  prototypes: readonly PrototypeFixture[],
) {
  const profiles = prototypes.map((entry) => {
    const rawPrototype = createWorksheetFormatPrototype(
      entry.id,
      entry.snapshot,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    );
    return approveFormatProfile(
      createFormatProfileCandidate({
        id: entry.id,
        label: entry.label,
        purpose: 'Deterministic review evidence fixture',
        prototype: rawPrototype,
        sourceKind: 'xlsx-baseline',
        sourceDigest: `sha256:baseline-${entry.id}`,
      }),
      {
        approvedBy: 'reviewer-a',
        approvalReference: `review:${entry.id}`,
      },
    );
  });

  const match = matchWorksheetFormatSnapshot(
    observationSnapshot,
    profiles.map((profile) =>
      formatProfileToWorksheetPrototype(
        profile,
        SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      )),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const observation: CognitiveObservation<{ kind: string }> = {
    id: 'perception',
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    payload: { kind: 'worksheet-format' },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest: SOURCE_DIGEST,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
  };

  const envelope = createCognitiveReviewEnvelope({
    perception: adaptWorksheetFormatMatchToCognitiveOutcome(
      observation,
      match,
    ),
    approvedProfiles: profiles,
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  });
  const presentation = createCognitiveReviewPresentation(envelope);
  const verified = createVerifiedCognitiveReviewSurface(
    envelope,
    presentation,
    receipt(envelope),
  );

  return { envelope, presentation, verified };
}

function receipt(
  envelope: ReturnType<typeof createCognitiveReviewEnvelope>,
): AuthorityRevalidationReceiptV1 {
  return {
    schemaVersion: AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
    envelopeSchemaVersion: envelope.schemaVersion,
    sourceDigest: SOURCE_DIGEST,
    scope: 'review-evidence',
    issuer: {
      kind: 'authority-plane',
      componentId: 'mmi.authority.deterministic-review-test',
      componentVersion: '1',
      runId: 'run-deterministic-review',
    },
    checks: envelope.authorityRevalidation.map((requirement) => {
      const status: AuthorityRevalidationCheckResult['status'] =
        requirement.appliesTo === 'always'
          ? 'passed'
          : 'not-applicable';
      return {
        check: requirement.check,
        status,
        evidenceCode: status === 'passed'
          ? `${requirement.check.toUpperCase().replaceAll('-', '_')}_PASSED`
          : 'NO_EXECUTABLE_PROPOSAL',
      };
    }),
  };
}

function evaluateCase(
  entry: WorksheetFormatFillReviewCase,
) {
  const result = evaluateWorksheetFormatFillReviewTelemetry([entry]);
  const first = result.cases[0];
  assert.ok(first);
  return first;
}

test('projects decision-impact as deterministic review evidence beside Cognitive and Authority artifacts', () => {
  const base = snapshot(
    ['ID', 'Item', 'Type', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const drift = snapshot(
    ['Code', 'Item', 'Name', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const entry: WorksheetFormatFillReviewCase = {
    id: 'acceptance',
    expectedReview: true,
    observationSnapshot: drift,
    prototypeSnapshots: [{ id: 'base', snapshot: base }],
  };
  const result = evaluateCase(entry);
  assert.deepEqual(result.telemetry, ['fill-supported-acceptance']);

  const { envelope, verified } = artifacts(drift, [{
    id: 'base',
    label: 'Base Format',
    snapshot: base,
  }]);

  const evidence = createWorksheetFormatDeterministicReviewEvidence(
    envelope,
    result,
  );
  const surface = createDeterministicReviewEvidenceSurface(
    envelope,
    verified,
    evidence,
  );

  assert.equal(
    evidence.schemaVersion,
    DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
  );
  assert.equal(evidence.role, 'deterministic-review-evidence');
  assert.equal(evidence.producer.kind, 'deterministic-analysis');
  assert.equal(evidence.producer.executionBoundary, 'local');
  assert.deepEqual(evidence.reasons, [{
    code: 'fill-supported-acceptance',
    category: 'decision-impact',
    reviewRole: 'review-relevant',
  }]);
  assert.equal(evidence.reviewRelevantReasonCount, 1);
  assert.equal(evidence.diagnosticReasonCount, 0);
  assert.equal(evidence.comparison.control.status, 'novel');
  assert.equal(evidence.comparison.primary.status, 'matched');

  assert.equal(
    surface.schemaVersion,
    DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION,
  );
  assert.equal(surface.audience, 'human-review');
  assert.equal(surface.surface, verified);
  assert.equal(surface.deterministicReviewEvidence, evidence);
  assert.equal(surface.surface.review.authority.writeAuthority, 'none');
  assert.equal(surface.surface.review.authority.applyStatus, 'not-authorized');
});

test('keeps essential-unavailable separate from broad fill-unavailable', () => {
  const labels = ['ID', 'State', 'Note'];
  const observationSnapshot = snapshot(labels, null);
  const dark = snapshot(labels, 'dark');
  const light = snapshot(labels, 'light');
  const entry: WorksheetFormatFillReviewCase = {
    id: 'essential-unavailable',
    expectedReview: true,
    observationSnapshot,
    prototypeSnapshots: [
      { id: 'dark', snapshot: dark },
      { id: 'light', snapshot: light },
    ],
  };
  const result = evaluateCase(entry);
  assert.deepEqual(result.telemetry, [
    'fill-unavailable',
    'fill-unavailable-for-discrimination',
  ]);

  const { envelope } = artifacts(observationSnapshot, [
    { id: 'dark', label: 'Dark Format', snapshot: dark },
    { id: 'light', label: 'Light Format', snapshot: light },
  ]);
  const evidence = createWorksheetFormatDeterministicReviewEvidence(
    envelope,
    result,
  );

  assert.deepEqual(evidence.reasons, [
    {
      code: 'fill-unavailable',
      category: 'diagnostic',
      reviewRole: 'diagnostic-only',
    },
    {
      code: 'fill-unavailable-for-discrimination',
      category: 'evidence-unavailable',
      reviewRole: 'review-relevant',
    },
  ]);
  assert.equal(evidence.reviewRelevantReasonCount, 1);
  assert.equal(evidence.diagnosticReasonCount, 1);
});

test('keeps fill tone disagreement diagnostic-only when the matcher decision is unchanged', () => {
  const labels = ['ID', 'State', 'Note', 'Owner'];
  const dark = snapshot(labels, 'dark');
  const light = snapshot(labels, 'light');
  const entry: WorksheetFormatFillReviewCase = {
    id: 'tone-drift',
    expectedReview: false,
    observationSnapshot: light,
    prototypeSnapshots: [{ id: 'dark', snapshot: dark }],
  };
  const result = evaluateCase(entry);
  assert.deepEqual(result.telemetry, ['fill-tone-disagreement']);

  const { envelope } = artifacts(light, [{
    id: 'dark',
    label: 'Dark Format',
    snapshot: dark,
  }]);
  const evidence = createWorksheetFormatDeterministicReviewEvidence(
    envelope,
    result,
  );

  assert.deepEqual(evidence.reasons, [{
    code: 'fill-tone-disagreement',
    category: 'diagnostic',
    reviewRole: 'diagnostic-only',
  }]);
  assert.equal(evidence.reviewRelevantReasonCount, 0);
  assert.equal(evidence.diagnosticReasonCount, 1);
});

test('rejects deterministic evidence whose primary candidate scores do not match Perception', () => {
  const base = snapshot(
    ['ID', 'Item', 'Type', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const drift = snapshot(
    ['Code', 'Item', 'Name', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const result = evaluateCase({
    id: 'tampered-score',
    expectedReview: true,
    observationSnapshot: drift,
    prototypeSnapshots: [{ id: 'base', snapshot: base }],
  });
  const { envelope } = artifacts(drift, [{
    id: 'base',
    label: 'Base Format',
    snapshot: base,
  }]);

  const first = result.withFill.match.candidates[0];
  assert.ok(first);
  const tampered = {
    ...result,
    withFill: {
      ...result.withFill,
      match: {
        ...result.withFill.match,
        candidates: [{
          ...first,
          confidence: first.confidence - 0.01,
        }],
      },
    },
  };

  assert.throws(
    () => createWorksheetFormatDeterministicReviewEvidence(
      envelope,
      tampered,
    ),
    /candidate does not match Perception/,
  );
});

test('rejects deterministic evidence whose source profile does not match Perception', () => {
  const base = snapshot(['ID', 'State', 'Note'], 'dark');
  const result = evaluateCase({
    id: 'profile-mismatch',
    expectedReview: false,
    observationSnapshot: base,
    prototypeSnapshots: [{ id: 'base', snapshot: base }],
  });
  const { envelope } = artifacts(base, [{
    id: 'base',
    label: 'Base Format',
    snapshot: base,
  }]);

  assert.throws(
    () => createWorksheetFormatDeterministicReviewEvidence(
      envelope,
      {
        ...result,
        withFill: {
          ...result.withFill,
          sourceProfileId: 'other-profile',
        },
      },
    ),
    /source profile does not match Perception/,
  );
});

test('rejects evidence attachment when source identity is changed after evidence creation', () => {
  const base = snapshot(['ID', 'State', 'Note'], 'dark');
  const result = evaluateCase({
    id: 'source-mismatch',
    expectedReview: false,
    observationSnapshot: base,
    prototypeSnapshots: [{ id: 'base', snapshot: base }],
  });
  const { envelope, verified } = artifacts(base, [{
    id: 'base',
    label: 'Base Format',
    snapshot: base,
  }]);
  const evidence = createWorksheetFormatDeterministicReviewEvidence(
    envelope,
    result,
  );

  assert.throws(
    () => createDeterministicReviewEvidenceSurface(
      envelope,
      verified,
      {
        ...evidence,
        sourceDigest: 'sha256:other-source',
      },
    ),
    /source digest does not match/,
  );
});

test('does not mutate existing review artifacts and does not serialize evaluation labels or raw worksheet content', () => {
  const base = snapshot(
    ['ID', 'Item', 'Type', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const drift = snapshot(
    ['Code', 'Item', 'Name', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const result = evaluateCase({
    id: 'serialization',
    expectedReview: true,
    observationSnapshot: drift,
    prototypeSnapshots: [{ id: 'base', snapshot: base }],
  });
  const { envelope, verified } = artifacts(drift, [{
    id: 'base',
    label: 'Base Format',
    snapshot: base,
  }]);
  const envelopeBefore = structuredClone(envelope);
  const verifiedBefore = structuredClone(verified);

  const evidence = createWorksheetFormatDeterministicReviewEvidence(
    envelope,
    result,
  );
  const surface = createDeterministicReviewEvidenceSurface(
    envelope,
    verified,
    evidence,
  );
  const serializedEvidence = JSON.stringify(
    surface.deterministicReviewEvidence,
  );

  assert.deepEqual(envelope, envelopeBefore);
  assert.deepEqual(verified, verifiedBefore);
  assert.equal(serializedEvidence.includes('expectedReview'), false);
  assert.equal(serializedEvidence.includes('"cells"'), false);
  assert.equal(serializedEvidence.includes('"features"'), false);
  assert.equal(serializedEvidence.includes('"judgment"'), false);
  assert.equal(serializedEvidence.includes('"authorityVerification"'), false);
  assert.equal(serializedEvidence.includes('"apply"'), false);
  assert.equal(serializedEvidence.includes('accepted'), false);
});
