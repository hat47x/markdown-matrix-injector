import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStructuredArtifactObservation,
} from '../src/experimental/structuredArtifactNeutralObservation.js';
import {
  MMI_WORKSHEET_NEUTRAL_ADAPTER_CONFIG_DIGEST,
  MMI_WORKSHEET_NEUTRAL_HEADER_METHOD,
  MMI_WORKSHEET_NEUTRAL_MERGE_METHOD,
  MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD,
  createMmiWorksheetStructuredArtifactObservation,
} from '../src/experimental/mmiWorksheetStructuredArtifactNeutralAdapter.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const digest =
  `sha256:${'a'.repeat(64)}`;

function snapshot(): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Title' },
      { row: 1, column: 0, text: 'Name', fillTone: 'gray' },
      { row: 1, column: 1, text: 'Value', fillTone: 'gray' },
      { row: 1, column: 2, text: 'Status', fillTone: 'gray' },
      { row: 2, column: 0, text: 'A' },
      { row: 2, column: 1, text: '1' },
      { row: 2, column: 2, text: 'ok' },
      { row: 3, column: 0, text: 'B' },
      { row: 3, column: 1, text: '2' },
      { row: 8, column: 8, fillTone: 'dark' },
    ],
    merges: [
      {
        startRow: 0,
        startColumn: 0,
        endRow: 0,
        endColumn: 2,
      },
      {
        startRow: 10,
        startColumn: 10,
        endRow: 10,
        endColumn: 11,
      },
    ],
  };
}

function input(
  value: WorksheetFormatSnapshot = snapshot(),
) {
  return {
    snapshot: value,
    sheetName: 'Sheet1',
    sourceDigest: digest,
    sourceFamilyId: 'family-a',
    workbookOrDocument: 'workbook-a',
    producerVersionOrGitSha: 'git:fixture',
    sourceFormat: 'xlsx' as const,
    privacyClass: 'public' as const,
  };
}

test('emits only observable product-neutral worksheet features', () => {
  const observation =
    createMmiWorksheetStructuredArtifactObservation(
      input(),
    );

  assert.doesNotThrow(
    () => assertStructuredArtifactObservation(
      observation,
    ),
  );

  assert.deepEqual(observation.region, {
    coordinate_system: 'one_based_inclusive',
    row_start: 1,
    row_end: 4,
    col_start: 1,
    col_end: 3,
    row_count: 4,
    col_count: 3,
    parent_region_id: null,
    region_role_hint: 'sheet',
  });

  assert.deepEqual(
    observation.features[
      'geometry.non_empty_ratio'
    ],
    {
      value: 9 / 12,
      kind: 'measured',
      method:
        MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD,
      confidence: null,
    },
  );
  assert.deepEqual(
    observation.features[
      'geometry.merged_cell_count'
    ],
    {
      value: 1,
      kind: 'measured',
      method:
        MMI_WORKSHEET_NEUTRAL_MERGE_METHOD,
      confidence: null,
    },
  );
  assert.deepEqual(
    observation.features[
      'role.header_candidate_signal'
    ],
    {
      value: 'present',
      kind: 'categorical',
      method:
        MMI_WORKSHEET_NEUTRAL_HEADER_METHOD,
      confidence: null,
    },
  );

  assert.deepEqual(observation.labels, {});
  assert.equal(
    'geometry.border_closure'
      in observation.features,
    false,
  );
  assert.equal(
    'geometry.grid_alignment'
      in observation.features,
    false,
  );

  const serialized = JSON.stringify(observation);
  for (const forbidden of [
    'matched',
    'ambiguous',
    'novel',
    'review-route',
    'providerConfidence',
    'winnerPrototypeId',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `neutral observation leaked ${forbidden}`,
    );
  }
});

test('style-only cells and non-overlapping merges do not widen the observed region', () => {
  const observation =
    createMmiWorksheetStructuredArtifactObservation(
      input(),
    );

  assert.equal(observation.region.row_end, 4);
  assert.equal(observation.region.col_end, 3);
  assert.equal(
    observation.features[
      'geometry.merged_cell_count'
    ]?.value,
    1,
  );
});

test('source observation digest is stable across input cell and merge ordering', () => {
  const first = snapshot();
  const second: WorksheetFormatSnapshot = {
    cells: [...first.cells].reverse(),
    merges: [...(first.merges ?? [])].reverse(),
  };

  const left =
    createMmiWorksheetStructuredArtifactObservation(
      input(first),
    );
  const right =
    createMmiWorksheetStructuredArtifactObservation(
      input(second),
    );

  assert.equal(
    left.provenance.source_observation_digest,
    right.provenance.source_observation_digest,
  );
  assert.equal(
    left.provenance.adapter_config_digest,
    MMI_WORKSHEET_NEUTRAL_ADAPTER_CONFIG_DIGEST,
  );
});

test('emits an explicit absent header candidate when the existing heuristic finds none', () => {
  const observation =
    createMmiWorksheetStructuredArtifactObservation(
      input({
        cells: [
          { row: 4, column: 2, text: 'only' },
        ],
        merges: [],
      }),
    );

  assert.equal(
    observation.features[
      'role.header_candidate_signal'
    ]?.value,
    'absent',
  );
  assert.deepEqual(observation.region, {
    coordinate_system: 'one_based_inclusive',
    row_start: 5,
    row_end: 5,
    col_start: 3,
    col_end: 3,
    row_count: 1,
    col_count: 1,
    parent_region_id: null,
    region_role_hint: 'sheet',
  });
});

test('fails closed for empty worksheets and malformed source identity', () => {
  assert.throws(
    () => createMmiWorksheetStructuredArtifactObservation(
      input({
        cells: [
          { row: 0, column: 0, fillTone: 'gray' },
        ],
        merges: [],
      }),
    ),
    /at least one non-empty text cell/,
  );

  assert.throws(
    () => createMmiWorksheetStructuredArtifactObservation({
      ...input(),
      sourceDigest: 'not-a-digest',
    }),
    /sourceDigest must be sha256/,
  );

  assert.throws(
    () => createMmiWorksheetStructuredArtifactObservation({
      ...input(),
      sheetName: '   ',
    }),
    /sheetName must not be empty/,
  );
});

test('does not mutate the source snapshot', () => {
  const value = snapshot();
  const before = structuredClone(value);

  createMmiWorksheetStructuredArtifactObservation(
    input(value),
  );

  assert.deepEqual(value, before);
});
