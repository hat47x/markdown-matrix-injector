import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countWorksheetFormatDifferentFamilies,
  evaluateWorksheetFormatDriftSignals,
  type WorksheetFormatDriftEvaluationCase,
} from '../src/experimental/worksheetFormatMultiFamilyDriftEvaluation.js';

function tableFeatures(
  labels: readonly string[],
  options: {
    fill?: 'dark' | null;
    occupancy?: string;
    bodyMergeMask?: string;
  } = {},
): string[] {
  const columnCount = labels.length;
  const fill = options.fill === undefined ? 'dark' : options.fill;
  const features = [
    'region:table',
    'header:row',
    'region:title-row',
    `layout:title-span:${columnCount}`,
    'layout:title-header-gap:0',
    `layout:${columnCount}-columns`,
    'layout:header-contiguous',
    'body:present',
    'layout:first-body-gap:0',
    'layout:first-body-coverage:full',
    `layout:body-majority-occupancy:${options.occupancy ?? '1'.repeat(columnCount)}`,
  ];

  if (fill) {
    features.push('header:fill-present', `header:${fill}-fill`);
  }

  labels.forEach((label, index) => {
    features.push(`column:${label}`);
    features.push(`column-position:${index}:${label}`);
  });

  if (options.bodyMergeMask) {
    features.push(
      'merge:body-horizontal-recurring',
      `layout:body-majority-horizontal-merge-links:${options.bodyMergeMask}`,
    );
  }

  return features;
}

function renamed(
  labels: readonly string[],
  entries: readonly [index: number, label: string][],
): string[] {
  const result = [...labels];
  for (const [index, label] of entries) result[index] = label;
  return result;
}

function buildWidthCases(
  width: 5 | 7 | 9,
  labels: readonly string[],
  fill: 'dark' | null,
): WorksheetFormatDriftEvaluationCase[] {
  const baseline = tableFeatures(labels, { fill });
  const oneLabel = renamed(labels, [[2, '変更']]);
  const mergeMask = `1${'0'.repeat(width - 2)}`;

  return [
    {
      id: `${width}-column exact`,
      expectedReview: false,
      observationFeatures: baseline,
      prototypes: [{ id: 'target', features: baseline }],
    },
    {
      id: `${width}-column one-label rename`,
      expectedReview: false,
      observationFeatures: tableFeatures(oneLabel, { fill }),
      prototypes: [{ id: 'target', features: baseline }],
    },
    {
      id: `${width}-column label plus occupancy drift`,
      expectedReview: true,
      observationFeatures: tableFeatures(oneLabel, {
        fill,
        occupancy: `${'1'.repeat(width - 1)}0`,
      }),
      prototypes: [{ id: 'target', features: baseline }],
    },
    {
      id: `${width}-column label plus merge drift`,
      expectedReview: true,
      observationFeatures: tableFeatures(oneLabel, { fill }),
      prototypes: [{
        id: 'target',
        features: tableFeatures(labels, { fill, bodyMergeMask: mergeMask }),
      }],
    },
    {
      id: `${width}-column clearly novel labels`,
      expectedReview: false,
      observationFeatures: tableFeatures(
        Array.from({ length: width }, (_, index) => `X${index + 1}`),
        { fill },
      ),
      prototypes: [{ id: 'target', features: baseline }],
    },
    {
      id: `${width}-column two-label drift`,
      expectedReview: true,
      observationFeatures: tableFeatures(
        renamed(labels, [[0, '変更A'], [1, '変更B']]),
        { fill },
      ),
      prototypes: [{ id: 'target', features: baseline }],
    },
  ];
}

function heldOutCorpus(): WorksheetFormatDriftEvaluationCase[] {
  return [
    ...buildWidthCases(
      5,
      ['ID', '項目', '型', '必須', '備考'],
      'dark',
    ),
    ...buildWidthCases(
      7,
      ['ID', '項目', '型', '必須', '判定', '確認者', '備考'],
      null,
    ),
    ...buildWidthCases(
      9,
      ['ID', 'サービス', '項目', '型', '必須', '判定', '確認者', '備考', '期限'],
      'dark',
    ),
  ];
}

test('one label rename occupies two representation families while an additional structural drift occupies a third', () => {
  const labels = ['ID', '項目', '型', '必須', '備考'];
  const baseline = tableFeatures(labels);
  const oneLabel = tableFeatures(renamed(labels, [[2, '変更']]));
  const labelAndOccupancy = tableFeatures(
    renamed(labels, [[2, '変更']]),
    { occupancy: '11110' },
  );

  assert.equal(
    countWorksheetFormatDifferentFamilies(oneLabel, baseline),
    2,
  );
  assert.equal(
    countWorksheetFormatDifferentFamilies(labelAndOccupancy, baseline),
    3,
  );
});

test('held-out corpus keeps structure-plus-fill and structure-only conditions separate from the prior corpus', () => {
  const corpus = heldOutCorpus();
  assert.equal(corpus.length, 18);
  assert.equal(corpus.filter((entry) => entry.expectedReview).length, 9);

  const sevenColumn = corpus.filter((entry) => entry.id.startsWith('7-column'));
  assert.equal(sevenColumn.length, 6);
  for (const entry of sevenColumn) {
    assert.equal(
      entry.observationFeatures.some((feature) => feature.endsWith('-fill')),
      false,
    );
    for (const prototype of entry.prototypes) {
      assert.equal(
        prototype.features.some((feature) => feature.endsWith('-fill')),
        false,
      );
    }
  }
});

test('boundary warnings remain precise but cover only one third of held-out review cases', () => {
  const result = evaluateWorksheetFormatDriftSignals(heldOutCorpus());

  assert.deepEqual(result.boundaryWarning, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 3,
    truePositive: 3,
    falsePositive: 0,
    falseNegative: 6,
    trueNegative: 9,
    precision: 1,
    recall: 0.333333,
    falsePositiveRate: 0,
  });
});

test('deviation and raw different-family count each improve recall without false positives but miss different review shapes', () => {
  const result = evaluateWorksheetFormatDriftSignals(heldOutCorpus());

  assert.deepEqual(result.matchedDeviationHigh, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 6,
    truePositive: 6,
    falsePositive: 0,
    falseNegative: 3,
    trueNegative: 9,
    precision: 1,
    recall: 0.666667,
    falsePositiveRate: 0,
  });

  assert.deepEqual(result.matchedDifferentFamilyCountHigh, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 6,
    truePositive: 6,
    falsePositive: 0,
    falseNegative: 3,
    trueNegative: 9,
    precision: 1,
    recall: 0.666667,
    falsePositiveRate: 0,
  });
});

test('penalizing ablation-family count is noisier because sparse projection can change ablation direction', () => {
  const result = evaluateWorksheetFormatDriftSignals(heldOutCorpus());

  assert.deepEqual(result.matchedPenalizingFamilyCountHigh, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 6,
    truePositive: 5,
    falsePositive: 1,
    falseNegative: 4,
    trueNegative: 8,
    precision: 0.833333,
    recall: 0.555556,
    falsePositiveRate: 0.111111,
  });

  const oneLabel = result.cases.find(
    (entry) => entry.id === '5-column one-label rename',
  );
  assert.equal(oneLabel?.differentFamilyCount, 2);
  assert.equal(oneLabel?.penalizingFamilyCount, 3);

  const wideMerge = result.cases.find(
    (entry) => entry.id === '9-column label plus merge drift',
  );
  assert.equal(wideMerge?.differentFamilyCount, 3);
  assert.equal(wideMerge?.penalizingFamilyCount, 1);
});

test('boundary plus deviation plus different-family count covers the held-out corpus but remains evaluation evidence only', () => {
  const result = evaluateWorksheetFormatDriftSignals(heldOutCorpus());

  assert.deepEqual(result.boundaryOrDeviation, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 7,
    truePositive: 7,
    falsePositive: 0,
    falseNegative: 2,
    trueNegative: 9,
    precision: 1,
    recall: 0.777778,
    falsePositiveRate: 0,
  });

  assert.deepEqual(result.boundaryOrDifferentFamilyCount, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 8,
    truePositive: 8,
    falsePositive: 0,
    falseNegative: 1,
    trueNegative: 9,
    precision: 1,
    recall: 0.888889,
    falsePositiveRate: 0,
  });

  assert.deepEqual(result.boundaryOrDeviationOrDifferentFamilyCount, {
    cases: 18,
    expectedReviewCases: 9,
    flaggedCases: 9,
    truePositive: 9,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 9,
    precision: 1,
    recall: 1,
    falsePositiveRate: 0,
  });
});
