import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalStructuredArtifactObservationJson,
  structuredArtifactObservationDigest,
} from '../src/experimental/structuredArtifactNeutralObservation.js';
import {
  createMmiWorksheetStructuredArtifactObservation,
} from '../src/experimental/mmiWorksheetStructuredArtifactNeutralAdapter.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const SOURCE_PATH = new URL(
  './fixtures/structured-artifact-matched-source-v0.json',
  import.meta.url,
);
const EXPECTED_PATH = new URL(
  './fixtures/structured-artifact-matched-mmi-observation-v0.json',
  import.meta.url,
);

const EXPECTED_SOURCE_DIGEST =
  'sha256:4cc4ebf75a7001f256bb2eb269107cb3cdd390c9c1e05a008aee128450366fe1';
const EXPECTED_OBSERVATION_DIGEST =
  'sha256:61ad3e393bf3cc464b72de94a57c062f4d90fab432079dca920e39f493e05361';

type MatchedSourceFixture = {
  schema: string;
  source_family_id: string;
  workbook_or_document: string;
  sheet_name: string;
  privacy_class: 'public';
  rows: Array<Array<string | null>>;
  merges: Array<{
    start_row: number;
    start_col: number;
    end_row: number;
    end_col: number;
  }>;
};

function sha256(raw: Buffer): string {
  return 'sha256:' + createHash('sha256')
    .update(raw)
    .digest('hex');
}

function loadMatchedFixture(): {
  fixture: MatchedSourceFixture;
  sourceDigest: string;
} {
  const raw = readFileSync(SOURCE_PATH);
  const sourceDigest = sha256(raw);
  assert.equal(
    sourceDigest,
    EXPECTED_SOURCE_DIGEST,
    'matched source bytes are part of the cross-repo identity',
  );

  const fixture = JSON.parse(
    raw.toString('utf8'),
  ) as MatchedSourceFixture;
  assert.equal(
    fixture.schema,
    'hat47x.structured-artifact-matched-source/v0',
  );
  assert.equal(fixture.sheet_name, 'Sheet1');
  assert.equal(fixture.rows.length, 4);
  assert.equal(fixture.rows.every((row) => row.length === 3), true);

  return { fixture, sourceDigest };
}

function toSnapshot(
  fixture: MatchedSourceFixture,
): WorksheetFormatSnapshot {
  const cells: Array<{
    row: number;
    column: number;
    text: string;
  }> = [];

  fixture.rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value === null) return;
      cells.push({
        row: rowIndex,
        column: columnIndex,
        text: value,
      });
    });
  });

  return {
    cells,
    merges: fixture.merges.map((merge) => ({
      startRow: merge.start_row - 1,
      startColumn: merge.start_col - 1,
      endRow: merge.end_row - 1,
      endColumn: merge.end_col - 1,
    })),
  };
}

test('matched SAI H2 source emits the frozen MMI neutral observation', () => {
  const { fixture, sourceDigest } = loadMatchedFixture();

  const observation =
    createMmiWorksheetStructuredArtifactObservation({
      snapshot: toSnapshot(fixture),
      sheetName: fixture.sheet_name,
      sourceDigest,
      sourceFamilyId: fixture.source_family_id,
      workbookOrDocument: fixture.workbook_or_document,
      producerVersionOrGitSha: 'fixture:v0',
      sourceFormat: 'synthetic',
      privacyClass: fixture.privacy_class,
      split: 'unassigned',
    });

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
  assert.equal(
    observation.features[
      'geometry.non_empty_ratio'
    ]?.value,
    0.75,
  );
  assert.equal(
    observation.features[
      'geometry.merged_cell_count'
    ]?.value,
    1,
  );
  assert.equal(
    observation.features[
      'role.header_candidate_signal'
    ]?.value,
    'present',
  );

  const canonical =
    canonicalStructuredArtifactObservationJson(
      observation,
    );
  const expected = readFileSync(
    EXPECTED_PATH,
    'utf8',
  );

  assert.equal(
    canonical,
    expected,
    'adapter output must remain byte-identical to the frozen MMI H2 observation',
  );
  assert.equal(
    structuredArtifactObservationDigest(
      observation,
    ),
    EXPECTED_OBSERVATION_DIGEST,
  );
});
