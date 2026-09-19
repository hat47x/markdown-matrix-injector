import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatObservationIdentityFromMatch,
  createWorksheetFormatObservationIdentityFromSnapshot,
  assertWorksheetFormatObservationIdentityMatchesSnapshot,
  WORKSHEET_FORMAT_OBSERVATION_IDENTITY_REPRESENTATION,
} from '../src/experimental/worksheetFormatObservationIdentity.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from '../src/experimental/worksheetFormatPrototype.js';

function snapshot(
  labels: readonly string[],
  fillTone: 'dark' | 'light' = 'dark',
  bodyPrefix = 'value',
): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      ...labels.map((label, column) => ({
        row: 1,
        column,
        text: label,
        fillTone,
      })),
      ...labels.map((_, column) => ({
        row: 2,
        column,
        text: `${bodyPrefix}-${column + 1}`,
      })),
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: labels.length - 1,
    }],
  };
}

test('match-derived and snapshot-derived identities are identical for the same compared format state', () => {
  const observed = snapshot(['ID', 'State', 'Note']);
  const prototype = createWorksheetFormatPrototype(
    'baseline',
    observed,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const match = matchWorksheetFormatSnapshot(
    observed,
    [prototype],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const fromMatch = createWorksheetFormatObservationIdentityFromMatch(
    'sha256:source-a',
    match,
  );
  const fromSnapshot = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    observed,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.deepEqual(fromSnapshot, fromMatch);
  assert.match(fromMatch.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    fromMatch.representation,
    WORKSHEET_FORMAT_OBSERVATION_IDENTITY_REPRESENTATION,
  );
});

test('body cell values do not change format identity when observable format features stay the same', () => {
  const left = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['ID', 'State', 'Note'], 'dark', 'left'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const right = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['ID', 'State', 'Note'], 'dark', 'right'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.equal(left.digest, right.digest);
});

test('header or fill changes produce a different format identity', () => {
  const baseline = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['ID', 'State', 'Note'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const renamed = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['Code', 'State', 'Note'], 'dark'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const lighter = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['ID', 'State', 'Note'], 'light'),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.notEqual(baseline.digest, renamed.digest);
  assert.notEqual(baseline.digest, lighter.digest);
});

test('source identity participates in the derived-state digest', () => {
  const observed = snapshot(['ID', 'State', 'Note']);
  const left = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    observed,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const right = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-b',
    observed,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.notEqual(left.digest, right.digest);
  assert.notEqual(left.sourceDigest, right.sourceDigest);
});

test('assertion rejects a snapshot that does not match the Perception identity', () => {
  const identity = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['ID', 'State', 'Note']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  assert.throws(
    () => assertWorksheetFormatObservationIdentityMatchesSnapshot(
      identity,
      'sha256:source-a',
      snapshot(['Code', 'State', 'Note']),
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ),
    /observation identity does not match/,
  );
});

test('serialized identity contains no raw feature vector or header labels', () => {
  const identity = createWorksheetFormatObservationIdentityFromSnapshot(
    'sha256:source-a',
    snapshot(['Sensitive-ID', 'Internal-State', 'Reviewer-Note']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const serialized = JSON.stringify(identity);

  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('Sensitive-ID'), false);
  assert.equal(serialized.includes('Internal-State'), false);
  assert.equal(serialized.includes('Reviewer-Note'), false);
});
