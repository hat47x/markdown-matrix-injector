import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWorksheetFormatFillReviewTelemetry,
  type WorksheetFormatFillReviewCase,
} from '../src/experimental/worksheetFormatFillReviewTelemetry.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

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

function rename(
  labels: readonly string[],
  changes: readonly [number, string][],
): string[] {
  const result = [...labels];
  for (const [index, value] of changes) result[index] = value;
  return result;
}

function widthCases(width: 6 | 8): WorksheetFormatFillReviewCase[] {
  const base = Array.from({ length: width }, (_, index) => `C${index}`);
  const oneLabel = rename(base, [[1, 'X1']]);
  const twoLabel = rename(base, [[0, 'X0'], [1, 'X1']]);
  const wrongFillCandidate = rename(base, [[width - 1, 'W0']]);
  const clearlyNovel = Array.from({ length: width }, (_, index) => `Z${index}`);

  return [
    {
      id: `${width}-exact`,
      expectedReview: false,
      observationSnapshot: snapshot(base, 'dark'),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
    {
      id: `${width}-one-label-same-fill`,
      expectedReview: false,
      observationSnapshot: snapshot(oneLabel, 'dark'),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
    {
      id: `${width}-two-label-same-fill`,
      expectedReview: true,
      observationSnapshot: snapshot(twoLabel, 'dark'),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
    {
      id: `${width}-tone-drift`,
      expectedReview: false,
      observationSnapshot: snapshot(base, 'light'),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
    {
      id: `${width}-missing-fill-exact`,
      expectedReview: false,
      observationSnapshot: snapshot(base, null),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
    {
      id: `${width}-missing-fill-one-label`,
      expectedReview: false,
      observationSnapshot: snapshot(oneLabel, null),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
    {
      id: `${width}-fill-only-discrimination`,
      expectedReview: true,
      observationSnapshot: snapshot(base, 'dark'),
      prototypeSnapshots: [
        { id: 'dark', snapshot: snapshot(base, 'dark') },
        { id: 'light', snapshot: snapshot(base, 'light') },
      ],
    },
    {
      id: `${width}-fill-unavailable-discrimination`,
      expectedReview: true,
      observationSnapshot: snapshot(base, null),
      prototypeSnapshots: [
        { id: 'dark', snapshot: snapshot(base, 'dark') },
        { id: 'light', snapshot: snapshot(base, 'light') },
      ],
    },
    {
      id: `${width}-structure-fill-conflict`,
      expectedReview: true,
      observationSnapshot: snapshot(base, 'dark'),
      prototypeSnapshots: [
        { id: 'correct-no-fill', snapshot: snapshot(base, null) },
        { id: 'wrong-dark', snapshot: snapshot(wrongFillCandidate, 'dark') },
      ],
    },
    {
      id: `${width}-clearly-novel`,
      expectedReview: false,
      observationSnapshot: snapshot(clearlyNovel, 'dark'),
      prototypeSnapshots: [{ id: 'base', snapshot: snapshot(base, 'dark') }],
    },
  ];
}

function heldOutCorpus(): WorksheetFormatFillReviewCase[] {
  return [...widthCases(6), ...widthCases(8)];
}

test('held-out corpus is balanced and independent from the earlier three/four-column fill examples', () => {
  const corpus = heldOutCorpus();

  assert.equal(corpus.length, 20);
  assert.equal(corpus.filter((entry) => entry.expectedReview).length, 8);
  assert.equal(corpus.filter((entry) => !entry.expectedReview).length, 12);
});

test('decision-impact telemetry is precise but misses fill that is essential and unavailable', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(heldOutCorpus());

  assert.deepEqual(result.decisionImpact, {
    cases: 20,
    expectedReviewCases: 8,
    flaggedCases: 6,
    truePositive: 6,
    falsePositive: 0,
    falseNegative: 2,
    trueNegative: 12,
    precision: 1,
    recall: 0.75,
    falsePositiveRate: 0,
  });

  const sixSupport = result.cases.find(
    (entry) => entry.id === '6-two-label-same-fill',
  );
  assert.equal(sixSupport?.structureOnly.match.status, 'novel');
  assert.equal(sixSupport?.withFill.match.status, 'matched');
  assert.ok(sixSupport?.telemetry.includes('fill-supported-acceptance'));

  const eightPenalty = result.cases.find(
    (entry) => entry.id === '8-two-label-same-fill',
  );
  assert.equal(eightPenalty?.structureOnly.match.status, 'matched');
  assert.equal(eightPenalty?.withFill.match.status, 'novel');
  assert.ok(eightPenalty?.telemetry.includes('fill-induced-rejection'));
});

test('essential-unavailable telemetry identifies structurally equivalent fill-only prototypes', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(heldOutCorpus());

  assert.deepEqual(result.essentialUnavailable, {
    cases: 20,
    expectedReviewCases: 8,
    flaggedCases: 2,
    truePositive: 2,
    falsePositive: 0,
    falseNegative: 6,
    trueNegative: 12,
    precision: 1,
    recall: 0.25,
    falsePositiveRate: 0,
  });

  for (const width of [6, 8] as const) {
    const entry = result.cases.find(
      (value) => value.id === `${width}-fill-unavailable-discrimination`,
    );
    assert.deepEqual(entry?.telemetry, [
      'fill-unavailable',
      'fill-unavailable-for-discrimination',
    ]);
    assert.equal(entry?.withFill.match.status, 'ambiguous');
    assert.equal(entry?.structureOnly.match.status, 'ambiguous');
  }
});

test('high-impact telemetry covers the held-out review set without treating broad fill facts as gates', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(heldOutCorpus());

  assert.deepEqual(result.highImpactReviewTelemetry, {
    cases: 20,
    expectedReviewCases: 8,
    flaggedCases: 8,
    truePositive: 8,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 12,
    precision: 1,
    recall: 1,
    falsePositiveRate: 0,
  });

  for (const width of [6, 8] as const) {
    const conflict = result.cases.find(
      (entry) => entry.id === `${width}-structure-fill-conflict`,
    );
    assert.equal(conflict?.structureOnly.match.status, 'matched');
    assert.equal(conflict?.withFill.match.status, 'ambiguous');
    assert.ok(conflict?.telemetry.includes('fill-induced-ambiguity'));

    const discrimination = result.cases.find(
      (entry) => entry.id === `${width}-fill-only-discrimination`,
    );
    assert.equal(discrimination?.structureOnly.match.status, 'ambiguous');
    assert.equal(discrimination?.withFill.match.status, 'matched');
    assert.ok(
      discrimination?.telemetry.includes('fill-supported-disambiguation'),
    );
  }
});

test('broad fill-unavailable telemetry is noisy on stable exact and one-label cases', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(heldOutCorpus());

  assert.deepEqual(result.broadFillUnavailable, {
    cases: 20,
    expectedReviewCases: 8,
    flaggedCases: 6,
    truePositive: 2,
    falsePositive: 4,
    falseNegative: 6,
    trueNegative: 8,
    precision: 0.333333,
    recall: 0.25,
    falsePositiveRate: 0.333333,
  });

  for (const id of [
    '6-missing-fill-exact',
    '6-missing-fill-one-label',
    '8-missing-fill-exact',
    '8-missing-fill-one-label',
  ]) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry?.expectedReview, false);
    assert.deepEqual(entry?.telemetry, ['fill-unavailable']);
  }
});

test('broad tone disagreement is a diagnostic fact, not a per-case review decision', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(heldOutCorpus());

  assert.deepEqual(result.broadFillDisagreement, {
    cases: 20,
    expectedReviewCases: 8,
    flaggedCases: 2,
    truePositive: 0,
    falsePositive: 2,
    falseNegative: 8,
    trueNegative: 10,
    precision: 0,
    recall: 0,
    falsePositiveRate: 0.166667,
  });

  for (const width of [6, 8] as const) {
    const entry = result.cases.find(
      (value) => value.id === `${width}-tone-drift`,
    );
    assert.equal(entry?.withFill.match.status, 'matched');
    assert.equal(entry?.structureOnly.match.status, 'matched');
    assert.deepEqual(entry?.telemetry, ['fill-tone-disagreement']);
  }
});

test('treating every fill fact as a review flag reintroduces avoidable noise', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(heldOutCorpus());

  assert.deepEqual(result.anyTelemetry, {
    cases: 20,
    expectedReviewCases: 8,
    flaggedCases: 14,
    truePositive: 8,
    falsePositive: 6,
    falseNegative: 0,
    trueNegative: 6,
    precision: 0.571429,
    recall: 1,
    falsePositiveRate: 0.5,
  });

  for (const id of ['6-exact', '6-one-label-same-fill', '8-exact', '8-one-label-same-fill']) {
    assert.deepEqual(
      result.cases.find((entry) => entry.id === id)?.telemetry,
      [],
    );
  }
});
