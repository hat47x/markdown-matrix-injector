import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deriveMmiStructuredArtifactBodyCandidateSignal,
  isStructuredArtifactPlainNumericLike,
  MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
  STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS,
} from '../src/experimental/structuredArtifactBodyCandidateSignal.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const DESIGN_MANIFEST =
  'structured-artifact-prospective-corpus-v0.json';
const EXPECTATIONS =
  'structured-artifact-body-candidate-design-expectation-v0.json';

type MatchedSource = {
  source_family_id: string;
  rows: Array<Array<string | null>>;
  merges: Array<{
    start_row: number;
    start_col: number;
    end_row: number;
    end_col: number;
  }>;
};

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function toSnapshot(source: MatchedSource): WorksheetFormatSnapshot {
  const cells: Array<{
    row: number;
    column: number;
    text: string;
  }> = [];

  source.rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value !== null) {
        cells.push({
          row: rowIndex,
          column: columnIndex,
          text: value,
        });
      }
    });
  });

  return {
    cells,
    merges: source.merges.map((merge) => ({
      startRow: merge.start_row - 1,
      startColumn: merge.start_col - 1,
      endRow: merge.end_row - 1,
      endColumn: merge.end_col - 1,
    })),
  };
}

test('numeric-like v0 is deliberately narrow and target-independent', () => {
  for (const value of [
    '0',
    '42',
    '-7',
    '+3.5',
    '.25',
    '900',
  ]) {
    assert.equal(
      isStructuredArtifactPlainNumericLike(value),
      true,
      value,
    );
  }
  for (const value of [
    '2026-09-25',
    'A-17',
    '10%',
    '1,000',
    '12 ms',
    'Open',
  ]) {
    assert.equal(
      isStructuredArtifactPlainNumericLike(value),
      false,
      value,
    );
  }
});

test('MMI body candidate matches the frozen SAI-0E design expectations only', () => {
  const manifest = readJson(DESIGN_MANIFEST);
  const expectations = readJson(EXPECTATIONS);
  const expected = new Map(
    expectations.cases.map((entry: any) => [
      entry.source_family_id,
      entry.value,
    ]),
  );

  assert.equal(
    expectations.method_semantics,
    STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS,
  );
  assert.deepEqual(expectations.boundary, {
    holdout_scored: false,
    neutral_adapter_changed: false,
    training_performed: false,
  });
  assert.equal(manifest.cases.length, 12);
  assert.equal(expected.size, 12);

  for (const entry of manifest.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    assert.ok(sourceName);
    const source = readJson(sourceName) as MatchedSource;

    const signal =
      deriveMmiStructuredArtifactBodyCandidateSignal(
        toSnapshot(source),
      );

    assert.equal(
      signal.value,
      expected.get(entry.source_family_id),
      entry.source_family_id,
    );
    assert.equal(signal.kind, 'categorical');
    assert.equal(
      signal.method,
      MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
    );
    assert.equal(signal.confidence, null);
  }
});

test('candidate requires at least two later body rows and a strict numeric majority', () => {
  const oneBody: WorksheetFormatSnapshot = {
    cells: [
      { row: 0, column: 0, text: 'Name' },
      { row: 0, column: 1, text: 'Value' },
      { row: 1, column: 0, text: 'A' },
      { row: 1, column: 1, text: '1' },
    ],
    merges: [],
  };
  assert.equal(
    deriveMmiStructuredArtifactBodyCandidateSignal(oneBody).value,
    'absent',
  );

  const tie: WorksheetFormatSnapshot = {
    cells: [
      { row: 0, column: 0, text: 'Name' },
      { row: 0, column: 1, text: 'Value' },
      { row: 1, column: 0, text: 'A' },
      { row: 1, column: 1, text: '1' },
      { row: 2, column: 0, text: 'B' },
      { row: 2, column: 1, text: 'text' },
    ],
    merges: [],
  };
  assert.equal(
    deriveMmiStructuredArtifactBodyCandidateSignal(tie).value,
    'absent',
  );
});

test('candidate can skip a one-cell merged-title row without using target header boundary', () => {
  const snapshot: WorksheetFormatSnapshot = {
    cells: [
      { row: 0, column: 0, text: 'Report' },
      { row: 1, column: 0, text: 'Name' },
      { row: 1, column: 1, text: 'Value' },
      { row: 2, column: 0, text: 'A' },
      { row: 2, column: 1, text: '1' },
      { row: 3, column: 0, text: 'B' },
      { row: 3, column: 1, text: '2' },
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    }],
  };

  assert.equal(
    deriveMmiStructuredArtifactBodyCandidateSignal(snapshot).value,
    'present',
  );
});
