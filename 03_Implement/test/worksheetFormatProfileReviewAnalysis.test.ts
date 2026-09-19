import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  type FormatProfileV1,
} from '../src/experimental/formatProfile.js';
import {
  analyzeWorksheetFormatFillReview,
} from '../src/experimental/worksheetFormatFillReviewAnalysis.js';
import {
  analyzeWorksheetFormatFillReviewFromProfiles,
} from '../src/experimental/worksheetFormatProfileReviewAnalysis.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from '../src/experimental/worksheetFormatPrototype.js';

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
    cells.push({
      row: 2,
      column,
      text: `v${column + 1}`,
    });
  });

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

function approvedProfile(
  id: string,
  baseline: WorksheetFormatSnapshot,
): FormatProfileV1 {
  const prototype = createWorksheetFormatPrototype(
    id,
    baseline,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return approveFormatProfile(
    createFormatProfileCandidate({
      id,
      label: id,
      purpose: 'Profile-backed fill review fixture',
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

function compareWithSnapshotAnalysis(
  id: string,
  observationSnapshot: WorksheetFormatSnapshot,
  baselines: readonly {
    id: string;
    snapshot: WorksheetFormatSnapshot;
  }[],
) {
  const snapshotResult = analyzeWorksheetFormatFillReview([{
    id,
    observationSnapshot,
    prototypeSnapshots: baselines,
  }]).cases[0];
  const profileResult =
    analyzeWorksheetFormatFillReviewFromProfiles([{
      id,
      observationSnapshot,
      approvedProfiles: baselines.map((entry) =>
        approvedProfile(entry.id, entry.snapshot)),
    }]).cases[0];

  assert.ok(snapshotResult);
  assert.ok(profileResult);
  assert.deepEqual(profileResult.telemetry, snapshotResult.telemetry);
  assert.equal(
    profileResult.decisionImpact,
    snapshotResult.decisionImpact,
  );
  assert.equal(
    profileResult.essentialUnavailable,
    snapshotResult.essentialUnavailable,
  );
  return profileResult;
}

test('matches snapshot-based decision-impact analysis without baseline snapshots at runtime', () => {
  const base = snapshot(
    ['ID', 'Item', 'Type', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const drift = snapshot(
    ['Code', 'Item', 'Name', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );

  const result = compareWithSnapshotAnalysis(
    'acceptance',
    drift,
    [{ id: 'base', snapshot: base }],
  );

  assert.deepEqual(result.telemetry, ['fill-supported-acceptance']);
});

test('reproduces fill-unavailable-for-discrimination from approved Profile features', () => {
  const labels = ['ID', 'State', 'Note'];
  const result = compareWithSnapshotAnalysis(
    'essential-unavailable',
    snapshot(labels, null),
    [
      { id: 'dark', snapshot: snapshot(labels, 'dark') },
      { id: 'light', snapshot: snapshot(labels, 'light') },
    ],
  );

  assert.deepEqual(result.telemetry, [
    'fill-unavailable',
    'fill-unavailable-for-discrimination',
  ]);
  assert.equal(result.essentialUnavailable, true);
});

test('reproduces diagnostic fill-tone disagreement from approved Profile features', () => {
  const labels = ['ID', 'State', 'Note', 'Owner'];
  const result = compareWithSnapshotAnalysis(
    'tone-drift',
    snapshot(labels, 'light'),
    [{ id: 'dark', snapshot: snapshot(labels, 'dark') }],
  );

  assert.deepEqual(result.telemetry, ['fill-tone-disagreement']);
  assert.equal(result.highImpactReviewTelemetry, false);
});

test('rejects an unapproved Format Profile', () => {
  const baseline = snapshot(['ID', 'State'], 'dark');
  const rawPrototype = createWorksheetFormatPrototype(
    'candidate',
    baseline,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const candidate = createFormatProfileCandidate({
    id: 'candidate',
    label: 'candidate',
    purpose: 'unapproved',
    prototype: rawPrototype,
    sourceKind: 'xlsx-baseline',
    sourceDigest: 'sha256:candidate',
  });

  assert.throws(
    () => analyzeWorksheetFormatFillReviewFromProfiles([{
      id: 'candidate',
      observationSnapshot: baseline,
      approvedProfiles: [candidate],
    }]),
    /approved Format Profile/,
  );
});

test('rejects a Profile whose source profile contract was changed', () => {
  const baseline = snapshot(['ID', 'State'], 'dark');
  const profile = approvedProfile('base', baseline);
  const tampered: FormatProfileV1 = {
    ...profile,
    sourceProfileId: 'other-source-profile',
  };

  assert.throws(
    () => analyzeWorksheetFormatFillReviewFromProfiles([{
      id: 'source-profile-mismatch',
      observationSnapshot: baseline,
      approvedProfiles: [tampered],
    }]),
    /source profile or evidence contract/,
  );
});

test('does not mutate approved Profiles or observation snapshot', () => {
  const baseline = snapshot(['ID', 'State', 'Note'], 'dark');
  const observation = snapshot(['ID', 'State', 'Note'], 'light');
  const profile = approvedProfile('base', baseline);
  const profileBefore = structuredClone(profile);
  const observationBefore = structuredClone(observation);

  analyzeWorksheetFormatFillReviewFromProfiles([{
    id: 'immutability',
    observationSnapshot: observation,
    approvedProfiles: [profile],
  }]);

  assert.deepEqual(profile, profileBefore);
  assert.deepEqual(observation, observationBefore);
});
