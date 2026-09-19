import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveFormatProfile,
  assertFormatProfile,
  assertFormatProfileCompatible,
  createFormatProfileCandidate,
  FORMAT_PROFILE_SCHEMA_VERSION,
  formatProfileToWorksheetPrototype,
  type FormatProfileV1,
} from '../src/experimental/formatProfile.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

function baselineSnapshot(): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Release table' },
      { row: 1, column: 0, text: 'ID', fillTone: 'dark' },
      { row: 1, column: 1, text: 'State', fillTone: 'dark' },
      { row: 1, column: 2, text: 'Note', fillTone: 'dark' },
      { row: 2, column: 0, text: 'R-001' },
      { row: 2, column: 1, text: 'ready' },
      { row: 2, column: 2, text: 'memo' },
    ],
    merges: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 }],
  };
}

function candidate(): FormatProfileV1 {
  const prototype = createWorksheetFormatPrototype(
    'release-table',
    baselineSnapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return createFormatProfileCandidate({
    id: 'release-table',
    label: 'Release Table',
    purpose: 'Release decision worksheet format',
    prototype,
    sourceKind: 'xlsx',
    sourceDigest: 'sha256:baseline',
  });
}

test('creates a candidate only from a complete worksheet prototype contract', () => {
  const profile = candidate();

  assert.equal(profile.schemaVersion, FORMAT_PROFILE_SCHEMA_VERSION);
  assert.equal(profile.status, 'candidate');
  assert.equal(profile.featureVersion, WORKSHEET_FORMAT_FEATURE_VERSION);
  assert.equal(
    profile.sourceProfileId,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
  );
  assert.deepEqual(profile.sourceEvidence, ['fill', 'structure']);
  assert.ok(profile.features.length > 0);
  assert.deepEqual(
    [...profile.features],
    [...profile.features].sort(),
  );
  assert.equal(profile.approval, undefined);
  assert.doesNotThrow(() => assertFormatProfile(profile));
});

test('requires explicit human approval before a profile can become a matcher prototype', () => {
  const profile = candidate();

  assert.throws(
    () => formatProfileToWorksheetPrototype(
      profile,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ),
    /approved Format Profile/,
  );

  const approved = approveFormatProfile(profile, {
    approvedBy: 'reviewer-a',
    approvalReference: 'review:format-profile-001',
  });
  const prototype = formatProfileToWorksheetPrototype(
    approved,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval?.kind, 'human');
  assert.equal(prototype.id, approved.id);
  assert.deepEqual(prototype.features, approved.features);
  assert.equal(prototype.featureVersion, WORKSHEET_FORMAT_FEATURE_VERSION);
});

test('rejects candidate profiles that pretend to carry approval metadata', () => {
  const invalid: FormatProfileV1 = {
    ...candidate(),
    approval: {
      kind: 'human',
      approvedBy: 'reviewer-a',
      approvalReference: 'review:unexpected',
    },
  };

  assert.throws(
    () => assertFormatProfile(invalid),
    /Candidate Format Profile must not contain approval/,
  );
});

test('rejects approved profiles without explicit human approval metadata', () => {
  const invalid = {
    ...candidate(),
    status: 'approved',
  } as FormatProfileV1;

  assert.throws(
    () => assertFormatProfile(invalid),
    /explicit human approval/,
  );
});

test('fails closed on feature-version and source-profile incompatibility', () => {
  const approved = approveFormatProfile(candidate(), {
    approvedBy: 'reviewer-a',
    approvalReference: 'review:format-profile-001',
  });

  const wrongVersion: FormatProfileV1 = {
    ...approved,
    featureVersion: 'worksheet-format-v0',
  };
  assert.throws(
    () => assertFormatProfileCompatible(
      wrongVersion,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ),
    /feature version/,
  );

  assert.throws(
    () => assertFormatProfileCompatible(approved, {
      id: 'other-source-profile',
      evidence: ['structure'],
    }),
    /source profile or evidence contract/,
  );
});

test('rejects non-canonical feature lists and unstable ids', () => {
  const profile = candidate();

  assert.throws(
    () => assertFormatProfile({
      ...profile,
      features: [...profile.features].reverse(),
    }),
    /normalized, unique, and sorted/,
  );

  assert.throws(
    () => createFormatProfileCandidate({
      id: 'release table',
      label: 'Release Table',
      purpose: 'test',
      prototype: createWorksheetFormatPrototype(
        'release-table',
        baselineSnapshot(),
        SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      ),
      sourceKind: 'xlsx',
      sourceDigest: 'sha256:baseline',
    }),
    /stable ASCII identifier/,
  );
});

test('approval is an explicit copy and does not mutate the candidate', () => {
  const original = candidate();
  const approved = approveFormatProfile(original, {
    approvedBy: 'reviewer-a',
    approvalReference: 'review:format-profile-001',
    approvedAt: '2026-09-19T20:30:00+09:00',
  });

  assert.equal(original.status, 'candidate');
  assert.equal(original.approval, undefined);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval?.approvedAt, '2026-09-19T20:30:00+09:00');
});
