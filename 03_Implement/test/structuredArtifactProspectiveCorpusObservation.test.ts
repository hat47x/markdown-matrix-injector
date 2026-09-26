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
import {
  assertStructuredArtifactProspectiveCorpus,
} from '../src/experimental/structuredArtifactProspectiveCorpus.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MANIFEST = 'structured-artifact-prospective-corpus-v0.json';

type MatchedSource = {
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

const EXPECTED = new Map([
  [
    'sai-h2-basic-table-v0',
    {
      observation: 'structured-artifact-matched-mmi-observation-v0.json',
      digest:
        'sha256:61ad3e393bf3cc464b72de94a57c062f4d90fab432079dca920e39f493e05361',
    },
  ],
  [
    'sai-h2-offset-header-v0',
    {
      observation:
        'structured-artifact-matched-mmi-observation-offset-header-v0.json',
      digest:
        'sha256:5da37e29f8dcf2820c4b37fabd5d238dedd4a10566249529d2a07a2f207f0fc9',
    },
  ],
  [
    'sai-h2-compact-table-v0',
    {
      observation:
        'structured-artifact-matched-mmi-observation-compact-table-v0.json',
      digest:
        'sha256:225e54369aa1511482560e468965225e36f0ba230228be0c3b41c855b519fd45',
    },
  ],
]);

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function sha256File(name: string): string {
  return 'sha256:' + createHash('sha256')
    .update(readFileSync(new URL(name, FIXTURE_ROOT)))
    .digest('hex');
}

function toSnapshot(source: MatchedSource): WorksheetFormatSnapshot {
  const cells: Array<{
    row: number;
    column: number;
    text: string;
  }> = [];

  source.rows.forEach((row, rowIndex) => {
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
    merges: source.merges.map((merge) => ({
      startRow: merge.start_row - 1,
      startColumn: merge.start_col - 1,
      endRow: merge.end_row - 1,
      endColumn: merge.end_col - 1,
    })),
  };
}

test('all preregistered MMI corpus observations are frozen from source-only adapter input', () => {
  const manifest = readJson(MANIFEST);
  assertStructuredArtifactProspectiveCorpus(manifest);

  for (const entry of manifest.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    assert.ok(sourceName);
    const source = readJson(sourceName) as MatchedSource;
    const expected = EXPECTED.get(entry.source_family_id);
    assert.ok(expected);

    const observation =
      createMmiWorksheetStructuredArtifactObservation({
        snapshot: toSnapshot(source),
        sheetName: source.sheet_name,
        sourceDigest: sha256File(sourceName),
        sourceFamilyId: source.source_family_id,
        workbookOrDocument: source.workbook_or_document,
        producerVersionOrGitSha: 'fixture:v0',
        sourceFormat: 'synthetic',
        privacyClass: source.privacy_class,
        split: 'unassigned',
      });

    assert.deepEqual(observation.labels, {});
    assert.equal(
      canonicalStructuredArtifactObservationJson(observation),
      readFileSync(
        new URL(expected.observation, FIXTURE_ROOT),
        'utf8',
      ),
    );
    assert.equal(
      structuredArtifactObservationDigest(observation),
      expected.digest,
    );

    assert.equal(
      entry.observation_generation
        .target_fields_not_supplied_to_adapter,
      true,
    );
    assert.deepEqual(
      entry.observation_generation.excluded_portable_features,
      ['role.header_candidate_signal'],
    );
  }
});

test('new prospective cases retain target-independent geometry evidence', () => {
  const offset = readJson(
    'structured-artifact-matched-mmi-observation-offset-header-v0.json',
  );
  const compact = readJson(
    'structured-artifact-matched-mmi-observation-compact-table-v0.json',
  );

  assert.equal(
    offset.features['geometry.non_empty_ratio'].value,
    0.8,
  );
  assert.equal(
    offset.features['geometry.merged_cell_count'].value,
    1,
  );
  assert.equal(offset.region.row_count, 5);
  assert.equal(offset.region.col_count, 3);

  assert.equal(
    compact.features['geometry.non_empty_ratio'].value,
    11 / 12,
  );
  assert.equal(
    compact.features['geometry.merged_cell_count'].value,
    0,
  );
  assert.equal(compact.region.row_count, 4);
  assert.equal(compact.region.col_count, 3);

  for (const value of [offset, compact]) {
    assert.equal(
      value.features['role.header_candidate_signal'].value,
      'present',
    );
    assert.deepEqual(value.labels, {});
  }
});
