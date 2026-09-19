import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
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

const FIXTURE_SHA256 =
  'aeeb605c4bcd88a02df6ecf09a83db962141d6f6c90bd96375d67feeeb937973';

function fixturePath(): string {
  return fileURLToPath(new URL(
    './fixtures/libreoffice-fill-impact-family.xlsx',
    import.meta.url,
  ));
}

function verifyFixture(): void {
  const bytes = fs.readFileSync(fixturePath());
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    FIXTURE_SHA256,
  );
}

function readSheet(sheetName: string): WorksheetFormatSnapshot {
  return readXlsxFormatSnapshot({
    absolutePath: fixturePath(),
    sheetName,
  }).snapshot;
}

function impactCorpus(): WorksheetFormatFillReviewCase[] {
  const w6BaseDark = readSheet('W6 Base Dark');
  const w6TwoDriftDark = readSheet('W6 Two Drift Dark');
  const w6BaseNoFill = readSheet('W6 Base No Fill');
  const w6WrongDark = readSheet('W6 Wrong Dark');

  const w8BaseDark = readSheet('W8 Base Dark');
  const w8TwoDriftDark = readSheet('W8 Two Drift Dark');

  const w3BaseDark = readSheet('W3 Base Dark');
  const w3ACodeDark = readSheet('W3 A Code Dark');
  const w3BCategoryLight = readSheet('W3 B Category Light');

  return [
    {
      id: 'fill-supported-acceptance',
      expectedReview: true,
      observationSnapshot: w6TwoDriftDark,
      prototypeSnapshots: [
        { id: 'w6-base', snapshot: w6BaseDark },
      ],
    },
    {
      id: 'fill-induced-ambiguity',
      expectedReview: true,
      observationSnapshot: w6BaseDark,
      prototypeSnapshots: [
        { id: 'w6-correct-no-fill', snapshot: w6BaseNoFill },
        { id: 'w6-wrong-dark', snapshot: w6WrongDark },
      ],
    },
    {
      id: 'fill-induced-rejection',
      expectedReview: true,
      observationSnapshot: w8TwoDriftDark,
      prototypeSnapshots: [
        { id: 'w8-base', snapshot: w8BaseDark },
      ],
    },
    {
      id: 'fill-changed-winner',
      expectedReview: true,
      observationSnapshot: w3BaseDark,
      prototypeSnapshots: [
        { id: 'w3-a-code-dark', snapshot: w3ACodeDark },
        { id: 'w3-b-category-light', snapshot: w3BCategoryLight },
      ],
    },
    {
      id: 'w6-exact-control',
      expectedReview: false,
      observationSnapshot: w6BaseDark,
      prototypeSnapshots: [
        { id: 'w6-base', snapshot: w6BaseDark },
      ],
    },
    {
      id: 'w8-exact-control',
      expectedReview: false,
      observationSnapshot: w8BaseDark,
      prototypeSnapshots: [
        { id: 'w8-base', snapshot: w8BaseDark },
      ],
    },
    {
      id: 'w3-exact-control',
      expectedReview: false,
      observationSnapshot: w3BaseDark,
      prototypeSnapshots: [
        { id: 'w3-base', snapshot: w3BaseDark },
      ],
    },
  ];
}

test('LibreOffice fill-impact family fixture remains byte-exact and reader-visible', () => {
  verifyFixture();

  const w6 = readSheet('W6 Base Dark');
  const w8 = readSheet('W8 Base Dark');
  const w3 = readSheet('W3 B Category Light');

  assert.deepEqual(
    w6.cells
      .filter((cell) => cell.row === 1)
      .map((cell) => [cell.column, cell.text, cell.fillTone]),
    [
      [0, 'ID', 'dark'],
      [1, 'Item', 'dark'],
      [2, 'Type', 'dark'],
      [3, 'Required', 'dark'],
      [4, 'Decision', 'dark'],
      [5, 'Reviewer', 'dark'],
    ],
  );
  assert.deepEqual(w6.merges, [{
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 5,
  }]);

  assert.equal(
    w8.cells.find((cell) => cell.row === 1 && cell.column === 7)?.text,
    'Owner',
  );
  assert.equal(
    w3.cells.find((cell) => cell.row === 1 && cell.column === 1)?.text,
    'Category',
  );
  assert.equal(
    w3.cells.find((cell) => cell.row === 1 && cell.column === 1)?.fillTone,
    'light',
  );
});

test('external family reproduces fill-supported-acceptance', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(impactCorpus());
  const entry = result.cases.find(
    (value) => value.id === 'fill-supported-acceptance',
  );

  assert.equal(entry?.structureOnly.match.status, 'novel');
  assert.equal(entry?.structureOnly.topConfidence, 0.6849);
  assert.equal(entry?.withFill.match.status, 'matched');
  assert.equal(entry?.withFill.topConfidence, 0.71216);
  assert.deepEqual(entry?.telemetry, ['fill-supported-acceptance']);
});

test('external family reproduces fill-induced-ambiguity', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(impactCorpus());
  const entry = result.cases.find(
    (value) => value.id === 'fill-induced-ambiguity',
  );

  assert.equal(entry?.structureOnly.match.status, 'matched');
  assert.equal(
    entry?.structureOnly.match.winner?.prototypeId,
    'w6-correct-no-fill',
  );
  assert.equal(entry?.structureOnly.topTwoMargin, 0.178667);

  assert.equal(entry?.withFill.match.status, 'ambiguous');
  assert.equal(entry?.withFill.topPrototypeId, 'w6-correct-no-fill');
  assert.equal(entry?.withFill.topTwoMargin, 0.047703);
  assert.deepEqual(entry?.telemetry, ['fill-induced-ambiguity']);
});

test('external family reproduces fill-induced-rejection', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(impactCorpus());
  const entry = result.cases.find(
    (value) => value.id === 'fill-induced-rejection',
  );

  assert.equal(entry?.structureOnly.match.status, 'matched');
  assert.equal(entry?.structureOnly.topConfidence, 0.711663);
  assert.equal(entry?.withFill.match.status, 'novel');
  assert.equal(entry?.withFill.topConfidence, 0.698596);
  assert.deepEqual(entry?.telemetry, ['fill-induced-rejection']);
});

test('external family reproduces a fill-driven top-candidate change', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(impactCorpus());
  const entry = result.cases.find(
    (value) => value.id === 'fill-changed-winner',
  );

  assert.equal(entry?.structureOnly.match.status, 'ambiguous');
  assert.equal(entry?.structureOnly.topPrototypeId, 'w3-b-category-light');
  assert.equal(entry?.structureOnly.topConfidence, 0.801203);
  assert.equal(entry?.structureOnly.topTwoMargin, 0.015238);

  assert.equal(entry?.withFill.match.status, 'matched');
  assert.equal(entry?.withFill.match.winner?.prototypeId, 'w3-a-code-dark');
  assert.equal(entry?.withFill.topConfidence, 0.8);
  assert.equal(entry?.withFill.topTwoMargin, 0.057576);

  assert.deepEqual(entry?.telemetry, [
    'fill-supported-disambiguation',
    'fill-changed-winner',
    'fill-tone-disagreement',
  ]);
});

test('exact controls remain quiet across three table widths', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(impactCorpus());

  for (const id of [
    'w6-exact-control',
    'w8-exact-control',
    'w3-exact-control',
  ]) {
    const entry = result.cases.find((value) => value.id === id);
    assert.equal(entry?.structureOnly.match.status, 'matched');
    assert.equal(entry?.withFill.match.status, 'matched');
    assert.deepEqual(entry?.telemetry, []);
  }
});

test('impact-family corpus is coverage evidence rather than a precision benchmark', () => {
  const result = evaluateWorksheetFormatFillReviewTelemetry(impactCorpus());

  assert.deepEqual(result.decisionImpact, {
    cases: 7,
    expectedReviewCases: 4,
    flaggedCases: 4,
    truePositive: 4,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 3,
    precision: 1,
    recall: 1,
    falsePositiveRate: 0,
  });

  assert.deepEqual(result.highImpactReviewTelemetry, result.decisionImpact);

  // One changed-winner case also records the broad tone disagreement. This
  // corpus is intentionally constructed to cover reason codes, so these
  // metrics must not be interpreted as population-level quality.
  assert.deepEqual(result.broadFillDisagreement, {
    cases: 7,
    expectedReviewCases: 4,
    flaggedCases: 1,
    truePositive: 1,
    falsePositive: 0,
    falseNegative: 3,
    trueNegative: 3,
    precision: 1,
    recall: 0.25,
    falsePositiveRate: 0,
  });
});
