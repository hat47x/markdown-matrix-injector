import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWorksheetFormatFillReview,
} from '../src/experimental/worksheetFormatFillReviewAnalysis.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  evaluateWorksheetFormatFillReviewTelemetry,
  type WorksheetFormatFillReviewCase,
} from '../src/experimental/worksheetFormatFillReviewTelemetry.js';

function snapshot(
  labels: readonly string[],
  fill: FormatFillTone | null = 'dark',
): WorksheetFormatSnapshot {
  return {
    cells: labels.flatMap((label, column) => [
      {
        row: 1,
        column,
        text: label,
        ...(fill ? { fillTone: fill } : {}),
      },
      { row: 2, column, text: `v${column + 1}` },
    ]),
  };
}

test('analysis reproduces decision-impact without evaluation labels', () => {
  const base = snapshot(
    ['ID', 'Item', 'Type', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const drift = snapshot(
    ['Code', 'Item', 'Name', 'Required', 'Decision', 'Reviewer'],
    'dark',
  );
  const result = analyzeWorksheetFormatFillReview([{
    id: 'acceptance',
    observationSnapshot: drift,
    prototypeSnapshots: [{ id: 'base', snapshot: base }],
  }]).cases[0];

  assert.ok(result);
  assert.deepEqual(result.telemetry, ['fill-supported-acceptance']);
  assert.equal(result.decisionImpact, true);
  assert.equal('expectedReview' in result, false);
});

test('analysis keeps essential-unavailable separate from broad unavailability', () => {
  const labels = ['ID', 'State', 'Note'];
  const result = analyzeWorksheetFormatFillReview([{
    id: 'essential-unavailable',
    observationSnapshot: snapshot(labels, null),
    prototypeSnapshots: [
      { id: 'dark', snapshot: snapshot(labels, 'dark') },
      { id: 'light', snapshot: snapshot(labels, 'light') },
    ],
  }]).cases[0];

  assert.ok(result);
  assert.deepEqual(result.telemetry, [
    'fill-unavailable',
    'fill-unavailable-for-discrimination',
  ]);
  assert.equal(result.essentialUnavailable, true);
  assert.equal(result.highImpactReviewTelemetry, true);
});

test('analysis keeps fill-tone disagreement diagnostic-only', () => {
  const labels = ['ID', 'State', 'Note', 'Owner'];
  const result = analyzeWorksheetFormatFillReview([{
    id: 'tone-drift',
    observationSnapshot: snapshot(labels, 'light'),
    prototypeSnapshots: [{
      id: 'dark',
      snapshot: snapshot(labels, 'dark'),
    }],
  }]).cases[0];

  assert.ok(result);
  assert.deepEqual(result.telemetry, ['fill-tone-disagreement']);
  assert.equal(result.decisionImpact, false);
  assert.equal(result.highImpactReviewTelemetry, false);
  assert.equal(result.broadFillDisagreement, true);
});

test('evaluation wrapper preserves labels while reusing analysis telemetry', () => {
  const entry: WorksheetFormatFillReviewCase = {
    id: 'wrapper',
    expectedReview: true,
    observationSnapshot: snapshot(['ID', 'State', 'Note'], 'light'),
    prototypeSnapshots: [{
      id: 'dark',
      snapshot: snapshot(['ID', 'State', 'Note'], 'dark'),
    }],
  };

  const analysis = analyzeWorksheetFormatFillReview([entry]).cases[0];
  const evaluation =
    evaluateWorksheetFormatFillReviewTelemetry([entry]).cases[0];

  assert.ok(analysis);
  assert.ok(evaluation);
  assert.deepEqual(evaluation.telemetry, analysis.telemetry);
  assert.equal(evaluation.expectedReview, true);
  assert.equal('expectedReview' in analysis, false);
});

test('serialized analysis contains no evaluation label', () => {
  const result = analyzeWorksheetFormatFillReview([{
    id: 'serialization',
    observationSnapshot: snapshot(['ID', 'State'], 'dark'),
    prototypeSnapshots: [{
      id: 'base',
      snapshot: snapshot(['ID', 'State'], 'dark'),
    }],
  }]).cases[0];

  assert.ok(result);
  assert.equal(JSON.stringify(result).includes('expectedReview'), false);
});
