import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptClosedChoiceResponse,
  type ClosedChoiceQuestion,
} from '../src/experimental/closedChoiceJudgment.js';
import type {
  CognitiveObservation,
  CognitiveProviderDescriptor,
} from '../src/experimental/cognitiveContract.js';
import {
  createCognitiveReviewEnvelope,
  type CognitiveReviewEnvelope,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION,
  createCognitiveReviewPresentation,
} from '../src/experimental/cognitiveReviewPresentation.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  formatProfileToWorksheetPrototype,
  type FormatProfileV1,
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

const sourceDigest = 'sha256:review-presentation-source';

function snapshot(labels: readonly string[]): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      ...labels.map((label, column) => ({
        row: 1,
        column,
        text: label,
        fillTone: 'dark' as const,
      })),
      ...labels.map((_, column) => ({
        row: 2,
        column,
        text: `value-${column + 1}`,
      })),
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: labels.length - 1,
    }],
  };
}

function approvedProfile(
  id: string,
  labels: readonly string[],
): FormatProfileV1 {
  const prototype = createWorksheetFormatPrototype(
    id,
    snapshot(labels),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return approveFormatProfile(
    createFormatProfileCandidate({
      id,
      label: `Profile ${id}`,
      purpose: `Presentation fixture ${id}`,
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: `sha256:baseline-${id}`,
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: `review:${id}`,
    },
  );
}

function perceptionObservation(): CognitiveObservation<{ kind: string }> {
  return {
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
}

function judgmentObservation(): CognitiveObservation<{ review: string }> {
  return {
    id: 'judgment-observation',
    kind: 'format-review-route',
    schemaVersion: 'format-review-route-v1',
    payload: { review: 'fixture' },
    provenance: {
      sourceKind: 'derived-review-state',
      sourceDigest,
    },
  };
}

const judgmentProvider: CognitiveProviderDescriptor = {
  id: 'mmi.closed-choice.stub',
  version: '1',
  category: 'judgment',
  executionBoundary: 'local',
  capabilities: ['closed-choice'],
};

const judgmentQuestion: ClosedChoiceQuestion<
  'format-review' | 'evidence-review'
> = {
  id: 'format-review-route-v1',
  semantics: 'Choose review route.',
  choices: ['format-review', 'evidence-review'],
};

function envelopeFor(
  profiles: readonly FormatProfileV1[],
  labels: readonly string[],
  judgmentMode: 'decision' | 'abstained' | 'none' = 'none',
) {
  const prototypes = profiles.map((profile) =>
    formatProfileToWorksheetPrototype(
      profile,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ),
  );
  const match = matchWorksheetFormatSnapshot(
    snapshot(labels),
    prototypes,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const perception = adaptWorksheetFormatMatchToCognitiveOutcome(
    perceptionObservation(),
    match,
  );

  const judgment = judgmentMode === 'none'
    ? undefined
    : adaptClosedChoiceResponse(
        judgmentObservation(),
        judgmentProvider,
        judgmentQuestion,
        judgmentMode === 'decision'
          ? {
              status: 'decision',
              choice: 'format-review',
              probability: 0.8,
              confidence: 0.7,
              distribution: {
                'format-review': 0.8,
                'evidence-review': 0.2,
              },
            }
          : {
              status: 'abstained',
              reasonCode: 'LOW_INFORMATION',
              confidence: 0.3,
            },
      );

  return createCognitiveReviewEnvelope({
    perception,
    approvedProfiles: profiles,
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ...(judgment === undefined ? {} : { judgment }),
  });
}

test('projects matched review into clearly separated Authority, Perception, Judgment and Provenance sections', () => {
  const profile = approvedProfile('release-table', ['ID', 'State', 'Note']);
  const presentation = createCognitiveReviewPresentation(
    envelopeFor([profile], ['ID', 'State', 'Note'], 'decision'),
  );

  assert.equal(
    presentation.schemaVersion,
    COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION,
  );
  assert.equal(presentation.audience, 'human-review');
  assert.equal(presentation.authority.role, 'authority-boundary');
  assert.equal(presentation.authority.disposition, 'review-only');
  assert.equal(presentation.authority.writeAuthority, 'none');
  assert.equal(presentation.authority.applyStatus, 'not-authorized');

  assert.equal(presentation.perception.role, 'cognitive-perception');
  assert.equal(presentation.perception.classification, 'matched');
  assert.equal(presentation.perception.candidates[0]?.rank, 1);
  assert.equal(
    presentation.perception.candidates[0]?.profileLabel,
    'Profile release-table',
  );

  assert.equal(presentation.judgment.role, 'cognitive-judgment');
  assert.equal(presentation.judgment.state, 'proposal');
  if (presentation.judgment.state !== 'proposal') {
    throw new Error('expected proposal');
  }
  assert.equal(presentation.judgment.disposition, 'proposal-only');
  assert.equal(presentation.judgment.choice, 'format-review');

  assert.equal(presentation.provenance.role, 'provenance');
  assert.equal(presentation.provenance.sourceDigest, sourceDigest);
  assert.equal(
    presentation.provenance.profiles[0]?.approvalReference,
    'review:release-table',
  );
});

test('preserves ambiguous candidate ranking and does not invent a winner', () => {
  const left = approvedProfile('left', ['ID', 'State']);
  const right = approvedProfile('right', ['ID', 'State']);
  const presentation = createCognitiveReviewPresentation(
    envelopeFor([left, right], ['ID', 'State']),
  );

  assert.equal(presentation.perception.classification, 'ambiguous');
  assert.equal(presentation.perception.winnerPrototypeId, undefined);
  assert.deepEqual(
    presentation.perception.candidates.map((candidate) => candidate.prototypeId),
    ['left', 'right'],
  );
  assert.deepEqual(
    presentation.perception.candidates.map((candidate) => candidate.rank),
    [1, 2],
  );
  assert.equal(presentation.judgment.state, 'not-requested');
});

test('preserves novel no-candidate state without synthetic profile rows', () => {
  const presentation = createCognitiveReviewPresentation(
    envelopeFor([], ['Code', 'Type', 'Owner']),
  );

  assert.equal(presentation.perception.classification, 'novel');
  assert.deepEqual(presentation.perception.candidates, []);
  assert.deepEqual(presentation.provenance.profiles, []);
});

test('keeps Judgment abstention as a non-decision with its own metrics', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const presentation = createCognitiveReviewPresentation(
    envelopeFor([profile], ['ID', 'State'], 'abstained'),
  );

  assert.equal(presentation.judgment.state, 'non-decision');
  if (presentation.judgment.state !== 'non-decision') {
    throw new Error('expected non-decision');
  }
  assert.equal(presentation.judgment.status, 'abstained');
  assert.equal(presentation.judgment.reasonCode, 'LOW_INFORMATION');
  assert.equal(
    presentation.judgment.metrics[0]?.providerId,
    judgmentProvider.id,
  );
});

test('keeps provider metrics in separate sections without a combined score', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const presentation = createCognitiveReviewPresentation(
    envelopeFor([profile], ['ID', 'State'], 'decision'),
  );

  assert.ok(presentation.perception.metrics.length > 0);
  assert.ok(
    presentation.perception.metrics.every(
      (metric) => metric.providerId === 'mmi.fly-worksheet-format',
    ),
  );

  if (presentation.judgment.state !== 'proposal') {
    throw new Error('expected proposal');
  }
  assert.ok(
    presentation.judgment.metrics.every(
      (metric) => metric.providerId === judgmentProvider.id,
    ),
  );

  const serialized = JSON.stringify(presentation);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('combinedScore'), false);
  assert.equal(serialized.includes('totalScore'), false);
});

test('does not expose raw worksheet cells or full format feature arrays', () => {
  const profile = approvedProfile('release-table', ['ID', 'State', 'Note']);
  const presentation = createCognitiveReviewPresentation(
    envelopeFor([profile], ['ID', 'State', 'Note'], 'decision'),
  );

  const serialized = JSON.stringify(presentation);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('"apply"'), false);
  assert.equal(serialized.includes('value-1'), false);
});

test('fails closed on tampered envelope authority state and candidate/profile binding', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const envelope = envelopeFor([profile], ['ID', 'State']);

  const completed = {
    ...envelope,
    authorityRevalidation: envelope.authorityRevalidation.map(
      (requirement, index) => index === 0
        ? { ...requirement, state: 'completed' as never }
        : requirement,
    ),
  } as CognitiveReviewEnvelope;

  assert.throws(
    () => createCognitiveReviewPresentation(completed),
    /cannot display completed Authority revalidation/,
  );

  const wrongBinding = {
    ...envelope,
    profiles: [{
      ...envelope.profiles[0]!,
      id: 'other-profile',
    }],
  } as CognitiveReviewEnvelope;

  assert.throws(
    () => createCognitiveReviewPresentation(wrongBinding),
    /candidate\/Profile binding mismatch/,
  );
});

test('fails closed on tampered schema, disposition, and write authority', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const envelope = envelopeFor([profile], ['ID', 'State']);

  assert.throws(
    () => createCognitiveReviewPresentation({
      ...envelope,
      schemaVersion: 'other-schema' as never,
    }),
    /Unsupported cognitive review envelope schema/,
  );

  assert.throws(
    () => createCognitiveReviewPresentation({
      ...envelope,
      disposition: 'auto-apply' as never,
    }),
    /review-only disposition/,
  );

  assert.throws(
    () => createCognitiveReviewPresentation({
      ...envelope,
      writeAuthority: 'write' as never,
    }),
    /writeAuthority=none/,
  );
});
