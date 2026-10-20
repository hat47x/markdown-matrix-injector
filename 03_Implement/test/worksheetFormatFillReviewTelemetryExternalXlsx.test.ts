import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readXlsxFormatSnapshot,
} from '../src/experimental/xlsxFormatSnapshotReader.js';
import {
  evaluateWorksheetFormatFillReviewTelemetry,
  type WorksheetFormatFillReviewCase,
} from '../src/experimental/worksheetFormatFillReviewTelemetry.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const THEME_SHA256 =
  '45d925f4e7d26e5110d05f79a22b2d9b0d67ec73ca8db581cf0a7633d93a4a07';
const RGB_SHA256 =
  'ac561a7f5ca19aeb642fe288a897e036081811274ffd109938215e49e94393e1';

function fixtureBytes(relativePath: string, expectedSha256: string): Buffer {
  const fixturePath = fileURLToPath(new URL(relativePath, import.meta.url));
  const encoded = fs.readFileSync(fixturePath, 'utf8').replace(/\s+/gu, '');
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  );
  return bytes;
}

function loadExternalSnapshots(): {
  themeDark: WorksheetFormatSnapshot;
  themeLightTint: WorksheetFormatSnapshot;
  rgbFill: WorksheetFormatSnapshot;
  metadataGapped: WorksheetFormatSnapshot;
  noTitle: WorksheetFormatSnapshot;
} {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-fill-telemetry-'));
  const themePath = path.join(directory, 'theme.xlsx');
  const rgbPath = path.join(directory, 'rgb.xlsx');

  try {
    fs.writeFileSync(
      themePath,
      fixtureBytes(
        './fixtures/libreoffice-theme-fill-boundary.xlsx.base64',
        THEME_SHA256,
      ),
    );
    fs.writeFileSync(
      rgbPath,
      fixtureBytes(
        './fixtures/libreoffice-rgb-format-boundary.xlsx.base64',
        RGB_SHA256,
      ),
    );

    const read = (absolutePath: string, sheetName: string) =>
      readXlsxFormatSnapshot({ absolutePath, sheetName }).snapshot;

    return {
      themeDark: read(themePath, 'Theme Dark'),
      themeLightTint: read(themePath, 'Theme Light Tint'),
      rgbFill: read(rgbPath, 'RGB Fill'),
      metadataGapped: read(rgbPath, 'Metadata Gapped'),
      noTitle: read(rgbPath, 'No Title'),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function withoutFill(snapshot: WorksheetFormatSnapshot): WorksheetFormatSnapshot {
  return {
    cells: snapshot.cells.map((cell) => {
      const { fillTone: _fillTone, ...rest } = cell;
      return rest;
    }),
    merges: (snapshot.merges ?? []).map((merge) => ({ ...merge })),
  };
}

function practicalCorpus(): WorksheetFormatFillReviewCase[] {
  const external = loadExternalSnapshots();

  return [
    {
      id: 'theme-exact',
      expectedReview: false,
      observationSnapshot: external.themeDark,
      prototypeSnapshots: [
        { id: 'theme-dark', snapshot: external.themeDark },
      ],
    },
    {
      id: 'theme-fill-only-discrimination',
      expectedReview: true,
      observationSnapshot: external.themeDark,
      prototypeSnapshots: [
        { id: 'theme-dark', snapshot: external.themeDark },
        { id: 'theme-light', snapshot: external.themeLightTint },
      ],
    },
    {
      id: 'theme-fill-unavailable-for-discrimination',
      expectedReview: true,
      observationSnapshot: withoutFill(external.themeDark),
      prototypeSnapshots: [
        { id: 'theme-dark', snapshot: external.themeDark },
        { id: 'theme-light', snapshot: external.themeLightTint },
      ],
    },
    {
      id: 'theme-tone-drift',
      expectedReview: false,
      observationSnapshot: external.themeLightTint,
      prototypeSnapshots: [
        { id: 'theme-dark', snapshot: external.themeDark },
      ],
    },
    {
      id: 'theme-fill-missing-exact',
      expectedReview: false,
      observationSnapshot: withoutFill(external.themeDark),
      prototypeSnapshots: [
        { id: 'theme-dark', snapshot: external.themeDark },
      ],
    },
    {
      id: 'rgb-exact',
      expectedReview: false,
      observationSnapshot: external.rgbFill,
      prototypeSnapshots: [
        { id: 'rgb', snapshot: external.rgbFill },
      ],
    },
    {
      id: 'metadata-gapped-exact',
      expectedReview: false,
      observationSnapshot: external.metadataGapped,
      prototypeSnapshots: [
        { id: 'metadata-gapped', snapshot: external.metadataGapped },
      ],
    },
    {
      id: 'metadata-gapped-fill-missing',
      expectedReview: false,
      observationSnapshot: withoutFill(external.metadataGapped),
      prototypeSnapshots: [
        { id: 'metadata-gapped', snapshot: external.metadataGapped },
      ],
    },
    {
      id: 'no-title-exact',
      expectedReview: false,
      observationSnapshot: external.noTitle,
      prototypeSnapshots: [
        { id: 'no-title', snapshot: external.noTitle },
      ],
    },
  ];
}

test('external-XLSX practical corpus is reader-derived and review labels are independent of broad fill facts', () => {
  const corpus = practicalCorpus();

  assert.equal(corpus.length, 9);
  assert.equal(corpus.filter((entry) => entry.expectedReview).length, 2);
  assert.equal(corpus.filter((entry) => !entry.expectedReview).length, 7);
});

test('external theme dark/light pair reproduces fill-supported disambiguation', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());
  const entry = result.cases.find(
    (value) => value.id === 'theme-fill-only-discrimination',
  );

  assert.equal(entry?.structureOnly.match.status, 'ambiguous');
  assert.equal(entry?.withFill.match.status, 'matched');
  assert.equal(entry?.withFill.match.winner?.prototypeId, 'theme-dark');
  assert.deepEqual(entry?.telemetry, ['fill-supported-disambiguation']);
});

test('external theme pair with stripped observation fill reproduces essential-unavailable telemetry', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());
  const entry = result.cases.find(
    (value) => value.id === 'theme-fill-unavailable-for-discrimination',
  );

  assert.equal(entry?.structureOnly.match.status, 'ambiguous');
  assert.equal(entry?.withFill.match.status, 'ambiguous');
  assert.deepEqual(entry?.telemetry, [
    'fill-unavailable',
    'fill-unavailable-for-discrimination',
  ]);
});

test('theme tone drift remains a broad diagnostic fact rather than high-impact review telemetry', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());
  const entry = result.cases.find((value) => value.id === 'theme-tone-drift');

  assert.equal(entry?.structureOnly.match.status, 'matched');
  assert.equal(entry?.withFill.match.status, 'matched');
  assert.deepEqual(entry?.telemetry, ['fill-tone-disagreement']);
  assert.equal(entry?.highImpactReviewTelemetry, false);
});

test('external RGB, gapped-header, and title-less exact snapshots stay quiet', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());

  for (const id of [
    'theme-exact',
    'rgb-exact',
    'metadata-gapped-exact',
    'no-title-exact',
  ]) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry?.withFill.match.status, 'matched');
    assert.equal(entry?.structureOnly.match.status, 'matched');
    assert.deepEqual(entry?.telemetry, []);
  }
});

test('broad fill unavailability remains noisy on practical reader-derived snapshots', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());

  assert.deepEqual(result.broadFillUnavailable, {
    cases: 9,
    expectedReviewCases: 2,
    flaggedCases: 3,
    truePositive: 1,
    falsePositive: 2,
    falseNegative: 1,
    trueNegative: 5,
    precision: 0.333333,
    recall: 0.5,
    falsePositiveRate: 0.285714,
  });

  for (const id of [
    'theme-fill-missing-exact',
    'metadata-gapped-fill-missing',
  ]) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry?.expectedReview, false);
    assert.deepEqual(entry?.telemetry, ['fill-unavailable']);
  }
});

test('high-impact telemetry stays precise on external-XLSX practical cases', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());

  assert.deepEqual(result.decisionImpact, {
    cases: 9,
    expectedReviewCases: 2,
    flaggedCases: 1,
    truePositive: 1,
    falsePositive: 0,
    falseNegative: 1,
    trueNegative: 7,
    precision: 1,
    recall: 0.5,
    falsePositiveRate: 0,
  });

  assert.deepEqual(result.essentialUnavailable, {
    cases: 9,
    expectedReviewCases: 2,
    flaggedCases: 1,
    truePositive: 1,
    falsePositive: 0,
    falseNegative: 1,
    trueNegative: 7,
    precision: 1,
    recall: 0.5,
    falsePositiveRate: 0,
  });

  assert.deepEqual(result.highImpactReviewTelemetry, {
    cases: 9,
    expectedReviewCases: 2,
    flaggedCases: 2,
    truePositive: 2,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 7,
    precision: 1,
    recall: 1,
    falsePositiveRate: 0,
  });
});

test('collapsing all practical fill telemetry into one flag still adds avoidable noise', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(practicalCorpus());

  assert.deepEqual(result.broadFillDisagreement, {
    cases: 9,
    expectedReviewCases: 2,
    flaggedCases: 1,
    truePositive: 0,
    falsePositive: 1,
    falseNegative: 2,
    trueNegative: 6,
    precision: 0,
    recall: 0,
    falsePositiveRate: 0.142857,
  });

  assert.deepEqual(result.anyTelemetry, {
    cases: 9,
    expectedReviewCases: 2,
    flaggedCases: 5,
    truePositive: 2,
    falsePositive: 3,
    falseNegative: 0,
    trueNegative: 4,
    precision: 0.4,
    recall: 1,
    falsePositiveRate: 0.428571,
  });
});
