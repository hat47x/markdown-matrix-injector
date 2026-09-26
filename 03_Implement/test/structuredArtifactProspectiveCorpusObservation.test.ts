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
  ['sai-h2-basic-table-v0', {
    observation: 'structured-artifact-matched-mmi-observation-v0.json',
    digest: 'sha256:61ad3e393bf3cc464b72de94a57c062f4d90fab432079dca920e39f493e05361',
  }],
  ['sai-h2-offset-header-v0', {
    observation: 'structured-artifact-matched-mmi-observation-offset-header-v0.json',
    digest: 'sha256:5da37e29f8dcf2820c4b37fabd5d238dedd4a10566249529d2a07a2f207f0fc9',
  }],
  ['sai-h2-compact-table-v0', {
    observation: 'structured-artifact-matched-mmi-observation-compact-table-v0.json',
    digest: 'sha256:225e54369aa1511482560e468965225e36f0ba230228be0c3b41c855b519fd45',
  }],
  ['sai-h2-non-table-notes-single-column-v0', {
    observation: 'structured-artifact-matched-mmi-observation-non-table-notes-single-column-v0.json',
    digest: 'sha256:dc3a7012f523767e247f861737e2fc9f5666093f4f1faa09dd68d194a02c5637',
  }],
  ['sai-h2-non-table-kv-pairs-v0', {
    observation: 'structured-artifact-matched-mmi-observation-non-table-kv-pairs-v0.json',
    digest: 'sha256:9fb653fa22a540cb705afd869612269ecb350891b153fd240ec77b106614dff4',
  }],
  ['sai-h2-non-table-scattered-diagonal-v0', {
    observation: 'structured-artifact-matched-mmi-observation-non-table-scattered-diagonal-v0.json',
    digest: 'sha256:df44d36ec6220a6c0ade8cacd770d03029bbef32e75bc5cfb0f1cbeff92ddf83',
  }],
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
  const cells: Array<{row: number; column: number; text: string}> = [];
  source.rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value === null) return;
      cells.push({row: rowIndex, column: columnIndex, text: value});
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

test('non-table tranche preserves target-independent structural diversity', () => {
  const notes = readJson(
    'structured-artifact-matched-mmi-observation-non-table-notes-single-column-v0.json',
  );
  const kv = readJson(
    'structured-artifact-matched-mmi-observation-non-table-kv-pairs-v0.json',
  );
  const diagonal = readJson(
    'structured-artifact-matched-mmi-observation-non-table-scattered-diagonal-v0.json',
  );

  assert.equal(notes.region.col_count, 1);
  assert.equal(notes.features['geometry.non_empty_ratio'].value, 1);
  assert.equal(
    notes.features['role.header_candidate_signal'].value,
    'absent',
  );

  assert.equal(kv.region.col_count, 2);
  assert.equal(kv.features['geometry.non_empty_ratio'].value, 1);
  assert.equal(
    kv.features['role.header_candidate_signal'].value,
    'present',
  );

  assert.equal(diagonal.region.row_count, 5);
  assert.equal(diagonal.region.col_count, 5);
  assert.equal(
    diagonal.features['geometry.non_empty_ratio'].value,
    0.2,
  );
  assert.equal(
    diagonal.features['role.header_candidate_signal'].value,
    'absent',
  );

  for (const value of [notes, kv, diagonal]) {
    assert.equal(
      value.features['geometry.merged_cell_count'].value,
      0,
    );
    assert.deepEqual(value.labels, {});
  }
});
