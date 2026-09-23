import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWorksheetFormatFillEvidence,
  type WorksheetFormatFillEvidenceCase,
} from '../src/experimental/worksheetFormatFillEvidenceEvaluation.js';
import type {
  FormatFillTone,
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

type SnapshotOptions = {
  fill?: FormatFillTone | null;
  occupancy?: string;
};

function snapshot(
  labels: readonly string[],
  options: SnapshotOptions = {},
): WorksheetFormatSnapshot {
  const fill = options.fill === undefined ? 'dark' : options.fill;
  const occupancy = options.occupancy ?? '1'.repeat(labels.length);
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

  for (let bodyOffset = 0; bodyOffset < 3; bodyOffset += 1) {
    labels.forEach((_, column) => {
      const majorityPresent = occupancy[column] !== '0';
      const present = majorityPresent || bodyOffset === 0;
      if (present) {
        cells.push({
          row: 2 + bodyOffset,
          column,
          text: `r${bodyOffset + 1}c${column + 1}`,
        });
      }
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

function singlePrototypeCase(
  id: string,
  prototypeLabels: readonly string[],
  observationLabels: readonly string[],
  prototypeFill: FormatFillTone | null = 'dark',
  observationFill: FormatFillTone | null = 'dark',
): WorksheetFormatFillEvidenceCase {
  return {
    id,
    observationSnapshot: snapshot(observationLabels, { fill: observationFill }),
    prototypeSnapshots: [{
      id: 'baseline',
      snapshot: snapshot(prototypeLabels, { fill: prototypeFill }),
    }],
  };
}

const BASE = ['ID', 'Item', 'State', 'Note'] as const;

test('same fill modestly supports one-label drift but leaves exact matches unchanged', () => {
  const result = evaluateWorksheetFormatFillEvidence([
    singlePrototypeCase('exact', BASE, BASE),
    singlePrototypeCase(
      'one-label',
      BASE,
      ['ID', 'Item', 'Status', 'Note'],
    ),
  ]);

  const exact = result.cases[0];
  assert.equal(exact?.withFill.match.status, 'matched');
  assert.equal(exact?.withFill.topConfidence, 1);
  assert.equal(exact?.structureOnly.topConfidence, 1);
  assert.equal(exact?.topConfidenceDelta, 0);

  const oneLabel = result.cases[1];
  assert.equal(oneLabel?.withFill.match.status, 'matched');
  assert.equal(oneLabel?.structureOnly.match.status, 'matched');
  assert.equal(oneLabel?.withFill.topConfidence, 0.811594);
  assert.equal(oneLabel?.structureOnly.topConfidence, 0.8);
  assert.equal(oneLabel?.topConfidenceDelta, 0.011594);
});

test('shared fill can move a two-label structural drift across the acceptance gate', () => {
  const result = evaluateWorksheetFormatFillEvidence([
    singlePrototypeCase(
      'two-label',
      BASE,
      ['ID', 'Name', 'Status', 'Note'],
    ),
  ]);
  const entry = result.cases[0];

  assert.equal(entry?.structureOnly.match.status, 'novel');
  assert.equal(entry?.structureOnly.topConfidence, 0.675441);
  assert.equal(entry?.withFill.match.status, 'matched');
  assert.equal(entry?.withFill.topConfidence, 0.724571);
  assert.equal(entry?.topConfidenceDelta, 0.04913);
  assert.equal(entry?.statusChanged, true);
});

test('fill-only deviation remains a deviation rather than an automatic format split', () => {
  const result = evaluateWorksheetFormatFillEvidence([
    singlePrototypeCase('tone-drift', BASE, BASE, 'dark', 'light'),
  ]);
  const entry = result.cases[0];

  assert.equal(entry?.withFill.match.status, 'matched');
  assert.equal(entry?.withFill.topConfidence, 0.90107);
  assert.equal(entry?.structureOnly.match.status, 'matched');
  assert.equal(entry?.structureOnly.topConfidence, 1);
  assert.equal(entry?.topConfidenceDelta, -0.09893);
});

test('missing fill lowers confidence when the fill-aware profile expects evidence', () => {
  const result = evaluateWorksheetFormatFillEvidence([
    singlePrototypeCase('missing-fill-exact', BASE, BASE, 'dark', null),
    singlePrototypeCase(
      'missing-fill-one-label',
      BASE,
      ['ID', 'Item', 'Status', 'Note'],
      'dark',
      null,
    ),
  ]);

  const exact = result.cases[0];
  assert.equal(exact?.withFill.match.status, 'matched');
  assert.equal(exact?.withFill.topConfidence, 0.866667);
  assert.equal(exact?.structureOnly.topConfidence, 1);

  const oneLabel = result.cases[1];
  assert.equal(oneLabel?.withFill.match.status, 'matched');
  assert.equal(oneLabel?.withFill.topConfidence, 0.73631);
  assert.equal(oneLabel?.structureOnly.topConfidence, 0.8);
});

test('fill can disambiguate prototypes whose structure is otherwise identical', () => {
  const result = evaluateWorksheetFormatFillEvidence([{
    id: 'fill-only-discrimination',
    observationSnapshot: snapshot(BASE, { fill: 'dark' }),
    prototypeSnapshots: [
      { id: 'dark', snapshot: snapshot(BASE, { fill: 'dark' }) },
      { id: 'light', snapshot: snapshot(BASE, { fill: 'light' }) },
    ],
  }]);
  const entry = result.cases[0];

  assert.equal(entry?.withFill.match.status, 'matched');
  assert.equal(entry?.withFill.match.winner?.prototypeId, 'dark');
  assert.equal(entry?.withFill.topConfidence, 1);
  assert.equal(entry?.withFill.topTwoMargin, 0.09893);

  assert.equal(entry?.structureOnly.match.status, 'ambiguous');
  assert.equal(entry?.structureOnly.topConfidence, 1);
  assert.equal(entry?.structureOnly.topTwoMargin, 0);
});

test('missing fill does not force a winner between fill-only prototypes', () => {
  const result = evaluateWorksheetFormatFillEvidence([{
    id: 'fill-unavailable-discrimination',
    observationSnapshot: snapshot(BASE, { fill: null }),
    prototypeSnapshots: [
      { id: 'dark', snapshot: snapshot(BASE, { fill: 'dark' }) },
      { id: 'light', snapshot: snapshot(BASE, { fill: 'light' }) },
    ],
  }]);
  const entry = result.cases[0];

  assert.equal(entry?.withFill.match.status, 'ambiguous');
  assert.equal(entry?.withFill.topPrototypeId, 'light');
  assert.equal(entry?.withFill.topConfidence, 0.881905);
  assert.equal(entry?.withFill.topTwoMargin, 0.015238);

  assert.equal(entry?.structureOnly.match.status, 'ambiguous');
  assert.equal(entry?.structureOnly.topTwoMargin, 0);
});

test('fill mismatch can narrow a structurally clear winner into ambiguity', () => {
  const labels = ['ID', 'State', 'Note'] as const;
  const result = evaluateWorksheetFormatFillEvidence([{
    id: 'fill-narrows-margin',
    observationSnapshot: snapshot(labels, { fill: 'dark' }),
    prototypeSnapshots: [
      { id: 'correct-no-fill', snapshot: snapshot(labels, { fill: null }) },
      {
        id: 'wrong-but-dark',
        snapshot: snapshot(['ID', 'State', 'Memo'], { fill: 'dark' }),
      },
    ],
  }]);
  const entry = result.cases[0];

  assert.equal(entry?.withFill.match.status, 'ambiguous');
  assert.equal(entry?.withFill.topPrototypeId, 'correct-no-fill');
  assert.equal(entry?.withFill.topConfidence, 0.859649);
  assert.equal(entry?.withFill.topTwoMargin, 0.044411);

  assert.equal(entry?.structureOnly.match.status, 'matched');
  assert.equal(entry?.structureOnly.match.winner?.prototypeId, 'correct-no-fill');
  assert.equal(entry?.structureOnly.topConfidence, 1);
  assert.equal(entry?.structureOnly.topTwoMargin, 0.214035);
});

test('matching fill does not rescue a clearly different table', () => {
  const result = evaluateWorksheetFormatFillEvidence([
    singlePrototypeCase(
      'clearly-novel',
      BASE,
      ['Code', 'Name', 'Type', 'Memo'],
    ),
  ]);
  const entry = result.cases[0];

  assert.equal(entry?.withFill.match.status, 'novel');
  assert.equal(entry?.withFill.topConfidence, 0.482086);
  assert.equal(entry?.structureOnly.match.status, 'novel');
  assert.equal(entry?.structureOnly.topConfidence, 0.411852);
});
