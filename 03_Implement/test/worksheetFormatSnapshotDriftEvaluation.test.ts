import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWorksheetFormatSnapshotDriftSignals,
  type WorksheetFormatSnapshotDriftCase,
} from '../src/experimental/worksheetFormatSnapshotDriftEvaluation.js';
import {
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  type WorksheetFormatSourceProfile,
} from '../src/experimental/worksheetFormatPrototype.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const STRUCTURE_ONLY_PROFILE: WorksheetFormatSourceProfile = {
  id: 'snapshot-structure-only-v1',
  evidence: ['structure'],
};

type SnapshotOptions = {
  fill?: FormatFillTone | null;
  titleHeaderGap?: number;
  firstBodyGap?: number;
  partialFirstBody?: boolean;
  majorityOccupancy?: string;
  recurringBodyMergeBoundary?: number;
};

function snapshot(
  labels: readonly string[],
  options: SnapshotOptions = {},
): WorksheetFormatSnapshot {
  const fill = options.fill === undefined ? 'dark' : options.fill;
  const titleRow = 0;
  const headerRow = 1 + (options.titleHeaderGap ?? 0);
  const firstBodyRow = headerRow + 1 + (options.firstBodyGap ?? 0);
  const cells: Array<{
    row: number;
    column: number;
    text: string;
    fillTone?: FormatFillTone;
  }> = [{ row: titleRow, column: 0, text: '基準表' }];

  labels.forEach((label, column) => {
    cells.push({
      row: headerRow,
      column,
      text: label,
      ...(fill ? { fillTone: fill } : {}),
    });
  });

  const occupancy = options.majorityOccupancy ?? '1'.repeat(labels.length);
  for (let bodyOffset = 0; bodyOffset < 3; bodyOffset += 1) {
    labels.forEach((_, column) => {
      const majorityPresent = occupancy[column] !== '0';
      const present = majorityPresent || bodyOffset === 0;
      const firstBodyOmitted =
        options.partialFirstBody
        && bodyOffset === 0
        && column === labels.length - 1;
      if (present && !firstBodyOmitted) {
        cells.push({
          row: firstBodyRow + bodyOffset,
          column,
          text: `r${bodyOffset + 1}c${column + 1}`,
        });
      }
    });
  }

  const merges = [{
    startRow: titleRow,
    startColumn: 0,
    endRow: titleRow,
    endColumn: labels.length - 1,
  }];

  if (options.recurringBodyMergeBoundary !== undefined) {
    for (let bodyOffset = 0; bodyOffset < 2; bodyOffset += 1) {
      merges.push({
        startRow: firstBodyRow + bodyOffset,
        startColumn: options.recurringBodyMergeBoundary,
        endRow: firstBodyRow + bodyOffset,
        endColumn: options.recurringBodyMergeBoundary + 1,
      });
    }
  }

  return { cells, merges };
}

function prototype(
  id: string,
  labels: readonly string[],
  options: SnapshotOptions = {},
) {
  return { id, snapshot: snapshot(labels, options) };
}

const NINE = [
  'ID', 'サービス', '項目', '型', '必須',
  '判定', '確認者', '備考', '期限',
] as const;
const NINE_RENAMED = [
  'ID', 'サービス', '項目', '型', '必須',
  '状態', '確認者', '備考', '期限',
] as const;
const SEVEN = ['ID', '項目', '型', '必須', '判定', '確認者', '備考'] as const;
const SEVEN_RENAMED = ['ID', '項目', '型', '必須', '状態', '確認者', '備考'] as const;

function corpus(): WorksheetFormatSnapshotDriftCase[] {
  const fillPrototype = prototype('target', NINE);
  const structurePrototype = prototype('target', SEVEN);

  return [
    {
      id: 'fill exact',
      expectedReview: false,
      observationSnapshot: snapshot(NINE),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill one-label rename',
      expectedReview: false,
      observationSnapshot: snapshot(NINE_RENAMED),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill label plus title-header gap',
      expectedReview: true,
      observationSnapshot: snapshot(NINE_RENAMED, { titleHeaderGap: 1 }),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill label plus first-body gap',
      expectedReview: true,
      observationSnapshot: snapshot(NINE_RENAMED, { firstBodyGap: 1 }),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill label plus partial first body',
      expectedReview: true,
      observationSnapshot: snapshot(NINE_RENAMED, { partialFirstBody: true }),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill label plus occupancy drift',
      expectedReview: true,
      observationSnapshot: snapshot(NINE_RENAMED, { majorityOccupancy: '111111110' }),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill label plus recurring merge drift',
      expectedReview: true,
      observationSnapshot: snapshot(NINE_RENAMED, { recurringBodyMergeBoundary: 0 }),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill evidence unavailable',
      expectedReview: false,
      observationSnapshot: snapshot(NINE, { fill: null }),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill clearly novel labels',
      expectedReview: false,
      observationSnapshot: snapshot(Array.from({ length: 9 }, (_, index) => `X${index + 1}`)),
      prototypeSnapshots: [fillPrototype],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'fill near-tied prototypes',
      expectedReview: true,
      observationSnapshot: snapshot([
        'ID', 'サービス', '項目', '型', '必須',
        '内容', '確認者', '備考', '期限',
      ]),
      prototypeSnapshots: [
        prototype('value', [
          'ID', 'サービス', '項目', '型', '必須',
          '値', '確認者', '備考', '期限',
        ]),
        prototype('description', [
          'ID', 'サービス', '項目', '型', '必須',
          '説明', '確認者', '備考', '期限',
        ]),
      ],
      sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    },
    {
      id: 'structure exact',
      expectedReview: false,
      observationSnapshot: snapshot(SEVEN),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure one-label rename',
      expectedReview: false,
      observationSnapshot: snapshot(SEVEN_RENAMED),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure label plus title-header gap',
      expectedReview: true,
      observationSnapshot: snapshot(SEVEN_RENAMED, { titleHeaderGap: 1 }),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure label plus first-body gap',
      expectedReview: true,
      observationSnapshot: snapshot(SEVEN_RENAMED, { firstBodyGap: 1 }),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure label plus partial first body',
      expectedReview: true,
      observationSnapshot: snapshot(SEVEN_RENAMED, { partialFirstBody: true }),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure label plus occupancy drift',
      expectedReview: true,
      observationSnapshot: snapshot(SEVEN_RENAMED, { majorityOccupancy: '1111110' }),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure label plus recurring merge drift',
      expectedReview: true,
      observationSnapshot: snapshot(SEVEN_RENAMED, { recurringBodyMergeBoundary: 0 }),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure two-label drift',
      expectedReview: true,
      observationSnapshot: snapshot([
        'ID', '名称', '型', '必須', '状態', '確認者', '備考',
      ]),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure clearly novel labels',
      expectedReview: false,
      observationSnapshot: snapshot(Array.from({ length: 7 }, (_, index) => `X${index + 1}`)),
      prototypeSnapshots: [structurePrototype],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
    {
      id: 'structure near-tied prototypes',
      expectedReview: true,
      observationSnapshot: snapshot([
        'ID', '項目', '型', '必須', '内容', '確認者', '備考',
      ]),
      prototypeSnapshots: [
        prototype('value', ['ID', '項目', '型', '必須', '値', '確認者', '備考']),
        prototype('description', ['ID', '項目', '型', '必須', '説明', '確認者', '備考']),
      ],
      sourceProfile: STRUCTURE_ONLY_PROFILE,
    },
  ];
}

test('snapshot corpus exercises adapter-produced structural families and source-profile filtering', () => {
  const result = evaluateWorksheetFormatSnapshotDriftSignals(corpus());

  assert.equal(result.materializedCases.length, 20);

  const titleGap = result.materializedCases.find(
    (entry) => entry.id === 'fill label plus title-header gap',
  );
  assert.ok(
    titleGap?.comparedObservationFeatures.includes('layout:title-header-gap:1'),
  );

  const bodyGap = result.materializedCases.find(
    (entry) => entry.id === 'fill label plus first-body gap',
  );
  assert.ok(
    bodyGap?.comparedObservationFeatures.includes('layout:first-body-gap:1'),
  );

  const partial = result.materializedCases.find(
    (entry) => entry.id === 'fill label plus partial first body',
  );
  assert.ok(
    partial?.comparedObservationFeatures.includes('layout:first-body-coverage:partial'),
  );

  const occupancy = result.materializedCases.find(
    (entry) => entry.id === 'fill label plus occupancy drift',
  );
  assert.ok(
    occupancy?.comparedObservationFeatures.includes('layout:body-majority-occupancy:111111110'),
  );

  const merge = result.materializedCases.find(
    (entry) => entry.id === 'fill label plus recurring merge drift',
  );
  assert.ok(
    merge?.comparedObservationFeatures.includes(
      'layout:body-majority-horizontal-merge-links:10000000',
    ),
  );

  const structure = result.materializedCases.find(
    (entry) => entry.id === 'structure exact',
  );
  assert.deepEqual(structure?.sourceEvidence, ['structure']);
  assert.equal(
    structure?.rawObservationFeatures.includes('header:dark-fill'),
    true,
  );
  assert.equal(
    structure?.comparedObservationFeatures.includes('header:dark-fill'),
    false,
  );
});

test('snapshot-level boundary warning remains precise but low recall', () => {
  const { signals } = evaluateWorksheetFormatSnapshotDriftSignals(corpus());

  assert.deepEqual(signals.boundaryWarning, {
    cases: 20,
    expectedReviewCases: 13,
    flaggedCases: 4,
    truePositive: 4,
    falsePositive: 0,
    falseNegative: 9,
    trueNegative: 7,
    precision: 1,
    recall: 0.307692,
    falsePositiveRate: 0,
  });
});

test('fixed matched-deviation signal changes strength across source profiles', () => {
  const { signals } = evaluateWorksheetFormatSnapshotDriftSignals(corpus());

  assert.deepEqual(signals.matchedDeviationHigh, {
    cases: 20,
    expectedReviewCases: 13,
    flaggedCases: 6,
    truePositive: 6,
    falsePositive: 0,
    falseNegative: 7,
    trueNegative: 7,
    precision: 1,
    recall: 0.461538,
    falsePositiveRate: 0,
  });

  const fillGap = signals.cases.find(
    (entry) => entry.id === 'fill label plus first-body gap',
  );
  const structureGap = signals.cases.find(
    (entry) => entry.id === 'structure label plus first-body gap',
  );

  assert.equal(fillGap?.deviationScore, 0.176471);
  assert.equal(fillGap?.matchedDeviationHigh, false);
  assert.equal(structureGap?.deviationScore, 0.214286);
  assert.equal(structureGap?.matchedDeviationHigh, true);
});

test('raw different-family count remains stable for adapter-produced multi-family drift', () => {
  const { signals } = evaluateWorksheetFormatSnapshotDriftSignals(corpus());

  assert.deepEqual(signals.matchedDifferentFamilyCountHigh, {
    cases: 20,
    expectedReviewCases: 13,
    flaggedCases: 10,
    truePositive: 10,
    falsePositive: 0,
    falseNegative: 3,
    trueNegative: 7,
    precision: 1,
    recall: 0.769231,
    falsePositiveRate: 0,
  });

  for (const id of [
    'fill label plus title-header gap',
    'fill label plus first-body gap',
    'fill label plus partial first body',
    'fill label plus occupancy drift',
    'fill label plus recurring merge drift',
    'structure label plus title-header gap',
    'structure label plus first-body gap',
    'structure label plus partial first body',
    'structure label plus occupancy drift',
    'structure label plus recurring merge drift',
  ]) {
    assert.equal(
      signals.cases.find((entry) => entry.id === id)?.differentFamilyCount,
      3,
    );
  }
});

test('penalizing ablation-family count remains noisier after adapter materialization', () => {
  const { signals } = evaluateWorksheetFormatSnapshotDriftSignals(corpus());

  assert.deepEqual(signals.matchedPenalizingFamilyCountHigh, {
    cases: 20,
    expectedReviewCases: 13,
    flaggedCases: 8,
    truePositive: 7,
    falsePositive: 1,
    falseNegative: 6,
    trueNegative: 6,
    precision: 0.875,
    recall: 0.538462,
    falsePositiveRate: 0.142857,
  });

  const falsePositive = signals.cases.find(
    (entry) => entry.id === 'fill one-label rename',
  );
  assert.equal(falsePositive?.expectedReview, false);
  assert.equal(falsePositive?.differentFamilyCount, 2);
  assert.equal(falsePositive?.penalizingFamilyCount, 4);
});

test('boundary plus raw family difference covers snapshot-level review cases without promoting a production rule', () => {
  const { signals } = evaluateWorksheetFormatSnapshotDriftSignals(corpus());

  assert.deepEqual(signals.boundaryOrDifferentFamilyCount, {
    cases: 20,
    expectedReviewCases: 13,
    flaggedCases: 13,
    truePositive: 13,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 7,
    precision: 1,
    recall: 1,
    falsePositiveRate: 0,
  });

  assert.deepEqual(signals.boundaryOrDeviationOrDifferentFamilyCount, {
    cases: 20,
    expectedReviewCases: 13,
    flaggedCases: 13,
    truePositive: 13,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 7,
    precision: 1,
    recall: 1,
    falsePositiveRate: 0,
  });
});
