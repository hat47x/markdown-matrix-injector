import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorksheetFormatBalanceWarning,
  evaluateWorksheetFormatBalanceWarningCorpus,
  type WorksheetFormatBalanceEvaluationCase,
} from '../src/experimental/worksheetFormatBalanceWarningEvaluation.js';
import {
  evaluateWorksheetFormatBalanceGate,
} from '../src/experimental/worksheetFormatScoringStrategyComparison.js';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

function tableFeatures(
  labels: readonly string[],
  options: {
    fill?: string | null;
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

function prototype(
  id: string,
  labels: readonly string[],
  options: Parameters<typeof tableFeatures>[1] = {},
) {
  return { id, features: tableFeatures(labels, options) };
}

const release6 = ['ID', '項目', '判定', '確認者', '備考', '期限'] as const;
const release8 = ['ID', '項目', '判定', '確認者', '環境', '方式', '備考', '期限'] as const;
const release10 = [
  'ID', 'サービス', '項目', '型', '必須',
  '判定', '確認者', '環境', '備考', '期限',
] as const;

function corpus(): WorksheetFormatBalanceEvaluationCase[] {
  return [
    {
      id: '6-column exact',
      expectedReview: false,
      observationFeatures: tableFeatures(release6),
      prototypes: [prototype('release', release6)],
    },
    {
      id: '6-column one-label rename',
      expectedReview: false,
      observationFeatures: tableFeatures(['ID', '項目', '状態', '確認者', '備考', '期限']),
      prototypes: [prototype('release', release6)],
    },
    {
      id: '6-column two-label near gate',
      expectedReview: true,
      observationFeatures: tableFeatures(['ID', '項目', '状態', '担当者', '備考', '期限']),
      prototypes: [prototype('release', release6)],
    },
    {
      id: '6-column fill unavailable',
      expectedReview: false,
      observationFeatures: tableFeatures(release6, { fill: null }),
      prototypes: [prototype('release', release6)],
    },
    {
      id: '6-column rename plus recurring occupancy drift',
      expectedReview: true,
      observationFeatures: tableFeatures(
        ['ID', '項目', '状態', '確認者', '備考', '期限'],
        { occupancy: '111110' },
      ),
      prototypes: [prototype('release', release6)],
    },
    {
      id: '8-column exact',
      expectedReview: false,
      observationFeatures: tableFeatures(release8),
      prototypes: [prototype('release8', release8)],
    },
    {
      id: '8-column one-label rename',
      expectedReview: false,
      observationFeatures: tableFeatures(
        ['ID', '項目', '状態', '確認者', '環境', '方式', '備考', '期限'],
      ),
      prototypes: [prototype('release8', release8)],
    },
    {
      id: '8-column two-label drift',
      expectedReview: true,
      observationFeatures: tableFeatures(
        ['ID', '項目', '状態', '担当者', '環境', '方式', '備考', '期限'],
      ),
      prototypes: [prototype('release8', release8)],
    },
    {
      id: '8-column three-label drift',
      expectedReview: true,
      observationFeatures: tableFeatures(
        ['ID', '項目', '状態', '担当者', '環境', '種別', '備考', '期限'],
      ),
      prototypes: [prototype('release8', release8)],
    },
    {
      id: '8-column merge loss plus one label drift',
      expectedReview: true,
      observationFeatures: tableFeatures(
        ['ID', '項目', '状態', '確認者', '環境', '方式', '備考', '期限'],
      ),
      prototypes: [prototype('release8', release8, { bodyMergeMask: '1000000' })],
    },
    {
      id: '10-column exact',
      expectedReview: false,
      observationFeatures: tableFeatures(release10),
      prototypes: [prototype('release10', release10)],
    },
    {
      id: '10-column one-label rename',
      expectedReview: false,
      observationFeatures: tableFeatures(
        ['ID', 'サービス', '項目', '型', '必須', '状態', '確認者', '環境', '備考', '期限'],
      ),
      prototypes: [prototype('release10', release10)],
    },
    {
      id: '10-column three-label drift',
      expectedReview: true,
      observationFeatures: tableFeatures(
        ['ID', 'サービス', '項目', '種別', '必須', '状態', '担当者', '環境', '備考', '期限'],
      ),
      prototypes: [prototype('release10', release10)],
    },
    {
      id: '10-column four-label drift',
      expectedReview: true,
      observationFeatures: tableFeatures(
        ['ID', 'サービス', '名称', '種別', '要否', '状態', '担当者', '環境', '備考', '期限'],
      ),
      prototypes: [prototype('release10', release10)],
    },
    {
      id: '6-column clearly different table',
      expectedReview: false,
      observationFeatures: tableFeatures(['サービス', '接続先', '方式', '認証', '方向', '備考']),
      prototypes: [prototype('release', release6)],
    },
    {
      id: '6-column near-tied prototypes',
      expectedReview: true,
      observationFeatures: tableFeatures(['ID', '項目', '内容', '確認者', '備考', '期限']),
      prototypes: [
        prototype('value', ['ID', '項目', '値', '確認者', '備考', '期限']),
        prototype('description', ['ID', '項目', '説明', '確認者', '備考', '期限']),
      ],
    },
  ];
}

test('warning codes are separated into boundary and composition concerns', () => {
  assert.equal(classifyWorksheetFormatBalanceWarning('confidence-near-gate'), 'boundary');
  assert.equal(classifyWorksheetFormatBalanceWarning('winner-margin-near-gate'), 'boundary');
  assert.equal(classifyWorksheetFormatBalanceWarning('column-family-share-high'), 'composition');
  assert.equal(classifyWorksheetFormatBalanceWarning('single-family-share-high'), 'composition');
});

test('treating every warning as a review flag has high recall but substantial noise', () => {
  const result = evaluateWorksheetFormatBalanceWarningCorpus(corpus());

  assert.deepEqual(result.anyWarning, {
    cases: 16,
    expectedReviewCases: 8,
    flaggedCases: 12,
    truePositive: 7,
    falsePositive: 5,
    falseNegative: 1,
    trueNegative: 3,
    precision: 0.583333,
    recall: 0.875,
    falsePositiveRate: 0.625,
  });
});

test('boundary warnings are precise but miss many multi-family drift cases', () => {
  const result = evaluateWorksheetFormatBalanceWarningCorpus(corpus());

  assert.deepEqual(result.boundaryWarning, {
    cases: 16,
    expectedReviewCases: 8,
    flaggedCases: 2,
    truePositive: 2,
    falsePositive: 0,
    falseNegative: 6,
    trueNegative: 8,
    precision: 1,
    recall: 0.25,
    falsePositiveRate: 0,
  });
});

test('composition warnings are exposure signals rather than reliable per-case review decisions', () => {
  const result = evaluateWorksheetFormatBalanceWarningCorpus(corpus());

  assert.deepEqual(result.compositionWarning, {
    cases: 16,
    expectedReviewCases: 8,
    flaggedCases: 10,
    truePositive: 5,
    falsePositive: 5,
    falseNegative: 3,
    trueNegative: 3,
    precision: 0.5,
    recall: 0.625,
    falsePositiveRate: 0.625,
  });

  for (const id of ['8-column exact', '10-column exact']) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry?.expectedReview, false);
    assert.equal(entry?.flaggedByCompositionWarning, true);
  }
});

test('current warnings miss a matched multi-family drift that merits review', () => {
  const result = evaluateWorksheetFormatBalanceWarningCorpus(corpus());
  const entry = result.cases.find(
    (value) => value.id === '6-column rename plus recurring occupancy drift',
  );

  assert.equal(entry?.expectedReview, true);
  assert.equal(entry?.gate.match.status, 'matched');
  assert.equal(entry?.gate.match.candidates[0]?.confidence, 0.768919);
  assert.equal(entry?.gate.match.candidates[0]?.deviationScore, 0.214286);
  assert.deepEqual(entry?.gate.warnings, []);
});

test('metadata preamble does not create a balance warning in a stable six-column table', () => {
  const plain = extractWorksheetFormatFeatures(practicalSnapshot(release6, 0)).features;
  const withPreamble = extractWorksheetFormatFeatures(practicalSnapshot(release6, 3)).features;

  assert.deepEqual(withPreamble, plain);

  const gate = evaluateWorksheetFormatBalanceGate(
    withPreamble,
    [{ id: 'release', features: plain }],
  );
  assert.equal(gate.match.status, 'matched');
  assert.equal(gate.match.winner?.confidence, 1);
  assert.deepEqual(gate.warnings, []);
});

function practicalSnapshot(
  labels: readonly string[],
  metadataRows: number,
): WorksheetFormatSnapshot {
  const titleRow = metadataRows;
  const headerRow = titleRow + 1;
  const cells: Array<{
    row: number;
    column: number;
    text: string;
    fillTone?: 'dark';
  }> = [];

  for (let row = 0; row < metadataRows; row += 1) {
    cells.push({ row, column: 0, text: `meta-${row + 1}` });
  }

  cells.push({ row: titleRow, column: 0, text: 'リリース判定表' });
  labels.forEach((label, column) => {
    cells.push({ row: headerRow, column, text: label, fillTone: 'dark' });
  });

  for (let offset = 1; offset <= 3; offset += 1) {
    labels.forEach((_, column) => {
      cells.push({
        row: headerRow + offset,
        column,
        text: `r${offset}c${column + 1}`,
      });
    });
  }

  return {
    cells,
    merges: [{
      startRow: titleRow,
      startColumn: 0,
      endRow: titleRow,
      endColumn: labels.length - 1,
    }],
  };
}
