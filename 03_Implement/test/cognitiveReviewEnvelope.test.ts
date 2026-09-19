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
  COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
  createCognitiveReviewEnvelope,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
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
  formatProfileToWorksheetPrototype as unused,
} from '../src/experimental/formatProfile.js';
import {
  createWorksheetFormatPrototype as createRawPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

void unused;

const sourceDigest = 'sha256:observed-workbook';

function snapshot(
  labels: readonly string[],
  fillTone: 'dark' | 'light' = 'dark',
): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      ...labels.map((label, column) => ({
        row: 1,
        column,
        text: label,
        fillTone,
      })),
      ...labels.map((_, column) => ({
        row: 2,
        column,
        text: `v${column + 1}`,
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
  const prototype = createRawPrototype(
    id,
    snapshot(labels),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const candidate = createFormatProfileCandidate({
    id,
    label: id,
    purpose: `Known worksheet format ${id}`,
    prototype,
    sourceKind: 'xlsx-baseline',
    sourceDigest: `sha256:baseline-${id}`,
  });
  return approveFormatProfile(candidate, {
    approvedBy: 'reviewer-a',
    approvalReference: `review:${id}`,
  });
}

function perceptionObservation(
  id: string,
  digest = sourceDigest,
): CognitiveObservation<{ kind: 'worksheet-format' }> {
  return {
    id,
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    payload: { kind: 'worksheet-format' },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest: digest,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
  };
}

function judgmentObservation(
  id: string,
  digest = sourceDigest,
): CognitiveObservation<{ review: string }> {
  return {
    id,
    kind: 'format-review-route',
    schemaVersion: 'format-review-route-v1',
    payload: { review: 'fixture' },
    provenance: {
      sourceKind: 'derived-review-state',
      sourceDigest: digest,
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
  semantics: 'Choose the review route for cognitive format evidence.',
  choices: ['format-review', 'evidence-review'],
};

function matchedPerception(
  profiles: readonly FormatProfileV1[],
  labels: readonly string[],
) {
  const prototypes = profiles.map((profile) =>
    formatProfileToPrototype(profile));
  const result = matchWorksheetFormatSnapshot(
    snapshot(labels),
    prototypes,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return adaptWorksheetFormatMatchToCognitiveOutcome(
    perceptionObservation('perception'),
    result,
  );
}

function formatProfileToPrototype(profile: FormatProfileV1) {
  return {
    id: profile.id,
    features: [...profile.features],
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: profile.sourceProfileId,
    sourceEvidence: [...profile.sourceEvidence],
  } as const;
}

test('builds a review-only envelope across approved profile, perception, and judgment', () => {
  const profile = approvedProfile('release-table', ['ID', 'State', 'Note']);
  const perception = matchedPerception(
    [profile],
    ['ID', 'State', 'Note'],
  );
  const judgment = adaptClosedChoiceResponse(
    judgmentObservation('judgment'),
    judgmentProvider,
    judgmentQuestion,
    {
      status: 'decision',
      choice: 'format-review',
      probability: 0.8,
      confidence: 0.72,
      distribution: {
        'format-review': 0.8,
        'evidence-review': 0.2,
      },
    },
  );

  const envelope = createCognitiveReviewEnvelope({
    perception,
    approvedProfiles: [profile],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    judgment,
  });

  assert.equal(
    envelope.schemaVersion,
    COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
  );
  assert.equal(envelope.disposition, 'review-only');
  assert.equal(envelope.writeAuthority, 'none');
  assert.equal(envelope.sourceDigest, sourceDigest);
  assert.equal(envelope.profiles[0]?.id, 'release-table');
  assert.equal(
    envelope.profiles[0]?.approvalReference,
    'review:release-table',
  );
  assert.equal(envelope.judgment?.status, 'signal');
  assert.ok(
    envelope.authorityRevalidation.every(
      (requirement) => requirement.state === 'pending',
    ),
  );
  assert.deepEqual(
    envelope.authorityRevalidation
      .filter((requirement) => requirement.appliesTo === 'always')
      .map((requirement) => requirement.check),
    ['source-identity', 'profile-compatibility'],
  );
  assert.equal('apply' in envelope, false);
  assert.equal('mutate' in envelope, false);
});

test('binds every visible ambiguous candidate to an approved profile', () => {
  const left = approvedProfile('left', ['ID', 'State']);
  const right = approvedProfile('right', ['ID', 'State']);
  const perception = matchedPerception([left, right], ['ID', 'State']);

  assert.equal(perception.signal.payload.classification, 'ambiguous');

  const envelope = createCognitiveReviewEnvelope({
    perception,
    approvedProfiles: [left, right],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  });

  assert.deepEqual(
    envelope.profiles.map((profile) => profile.id),
    perception.signal.payload.candidates.map(
      (candidate) => candidate.prototypeId,
    ),
  );
  assert.equal(
    perception.signal.payload.winnerPrototypeId,
    undefined,
  );
});

test('rejects a candidate Format Profile before review binding', () => {
  const prototype = createRawPrototype(
    'candidate-only',
    snapshot(['ID', 'State']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const candidate = createFormatProfileCandidate({
    id: 'candidate-only',
    label: 'candidate-only',
    purpose: 'unapproved',
    prototype,
    sourceKind: 'xlsx-baseline',
    sourceDigest: 'sha256:candidate',
  });
  const approved = approveFormatProfile(candidate, {
    approvedBy: 'reviewer-a',
    approvalReference: 'review:candidate-only',
  });
  const perception = matchedPerception(
    [approved],
    ['ID', 'State'],
  );

  assert.throws(
    () => createCognitiveReviewEnvelope({
      perception,
      approvedProfiles: [candidate],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    }),
    /requires approved Format Profiles/,
  );
});

test('rejects a missing profile for a visible Perception candidate', () => {
  const left = approvedProfile('left', ['ID', 'State']);
  const right = approvedProfile('right', ['ID', 'State']);
  const perception = matchedPerception([left, right], ['ID', 'State']);

  assert.equal(perception.signal.payload.candidates.length, 2);
  assert.throws(
    () => createCognitiveReviewEnvelope({
      perception,
      approvedProfiles: [left],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    }),
    /Missing approved Format Profile/,
  );
});

test('rejects Judgment evidence from a different source digest', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const perception = matchedPerception([profile], ['ID', 'State']);
  const judgment = adaptClosedChoiceResponse(
    judgmentObservation('judgment-other', 'sha256:other-workbook'),
    judgmentProvider,
    judgmentQuestion,
    {
      status: 'abstained',
      reasonCode: 'LOW_INFORMATION',
    },
  );

  assert.throws(
    () => createCognitiveReviewEnvelope({
      perception,
      approvedProfiles: [profile],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      judgment,
    }),
    /source digest does not match Perception/,
  );
});

test('preserves Judgment abstention without promoting it to a decision', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const perception = matchedPerception([profile], ['ID', 'State']);
  const judgment = adaptClosedChoiceResponse(
    judgmentObservation('judgment-abstain'),
    judgmentProvider,
    judgmentQuestion,
    {
      status: 'abstained',
      reasonCode: 'LOW_INFORMATION',
      confidence: 0.3,
    },
  );

  const envelope = createCognitiveReviewEnvelope({
    perception,
    approvedProfiles: [profile],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    judgment,
  });

  assert.equal(envelope.judgment?.status, 'abstained');
  assert.equal(envelope.disposition, 'review-only');
  assert.equal(envelope.writeAuthority, 'none');
});

test('allows novel no-candidate Perception without forcing a Format Profile', () => {
  const result = matchWorksheetFormatSnapshot(
    snapshot(['Code', 'Type', 'Owner']),
    [],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const perception = adaptWorksheetFormatMatchToCognitiveOutcome(
    perceptionObservation('novel-empty'),
    result,
  );

  assert.equal(perception.signal.payload.classification, 'novel');
  assert.equal(perception.signal.payload.candidates.length, 0);

  const envelope = createCognitiveReviewEnvelope({
    perception,
    approvedProfiles: [],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  });

  assert.deepEqual(envelope.profiles, []);
  assert.equal(envelope.disposition, 'review-only');
});

test('fails closed when the review source profile differs from Perception', () => {
  const profile = approvedProfile('release-table', ['ID', 'State']);
  const perception = matchedPerception([profile], ['ID', 'State']);

  assert.throws(
    () => createCognitiveReviewEnvelope({
      perception,
      approvedProfiles: [profile],
      sourceProfile: {
        id: 'other-source-profile',
        evidence: ['structure'],
      },
    }),
    /Perception source profile does not match/,
  );
});
