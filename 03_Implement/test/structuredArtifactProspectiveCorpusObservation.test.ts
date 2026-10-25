import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalStructuredArtifactObservationJson,
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

const EXPECTED = new Map<string, {observation: string; digest: string}>([
  ['sai-h2-basic-table-v0', {observation:'structured-artifact-matched-mmi-observation-v0.json',digest:'sha256:61ad3e393bf3cc464b72de94a57c062f4d90fab432079dca920e39f493e05361'}],
  ['sai-h2-offset-header-v0', {observation:'structured-artifact-matched-mmi-observation-offset-header-v0.json',digest:'sha256:5da37e29f8dcf2820c4b37fabd5d238dedd4a10566249529d2a07a2f207f0fc9'}],
  ['sai-h2-compact-table-v0', {observation:'structured-artifact-matched-mmi-observation-compact-table-v0.json',digest:'sha256:225e54369aa1511482560e468965225e36f0ba230228be0c3b41c855b519fd45'}],
  ['sai-h2-table-ragged-row1-4x4-v0', {observation:'structured-artifact-matched-mmi-observation-table-ragged-row1-4x4-v0.json',digest:'sha256:b10c0d4f54ecd8f7b432a779c2ef70d65f5dfe29875e92b9075214e724686735'}],
  ['sai-h2-table-wide-row2-5col-v0', {observation:'structured-artifact-matched-mmi-observation-table-wide-row2-5col-v0.json',digest:'sha256:75c9ee90025577039e275918ef907fc9c8ea14043fbea81ec837bd6cb0741d0e'}],
  ['sai-h2-table-two-col-row1-v0', {observation:'structured-artifact-matched-mmi-observation-table-two-col-row1-v0.json',digest:'sha256:30d618e52daf98f46d2bf40a198b9e1ab763efb70312683f599f9b1765ecb540'}],
  ['sai-h2-non-table-notes-single-column-v0', {observation:'structured-artifact-matched-mmi-observation-non-table-notes-single-column-v0.json',digest:'sha256:dc3a7012f523767e247f861737e2fc9f5666093f4f1faa09dd68d194a02c5637'}],
  ['sai-h2-non-table-kv-pairs-v0', {observation:'structured-artifact-matched-mmi-observation-non-table-kv-pairs-v0.json',digest:'sha256:9fb653fa22a540cb705afd869612269ecb350891b153fd240ec77b106614dff4'}],
  ['sai-h2-non-table-scattered-diagonal-v0', {observation:'structured-artifact-matched-mmi-observation-non-table-scattered-diagonal-v0.json',digest:'sha256:df44d36ec6220a6c0ade8cacd770d03029bbef32e75bc5cfb0f1cbeff92ddf83'}],
  ['sai-h2-non-table-banner-only-v0', {observation:'structured-artifact-matched-mmi-observation-non-table-banner-only-v0.json',digest:'sha256:bc913fa8bf47a4594d95da7f03d269dd5f98303260b84b33d589968795e7e2e4'}],
  ['sai-h2-non-table-paragraph-block-v0', {observation:'structured-artifact-matched-mmi-observation-non-table-paragraph-block-v0.json',digest:'sha256:d281619570e880270e85c2b963fc8eb86886997c1cd77786d92db3b3edf580b5'}],
  ['sai-h2-non-table-form-spaced-v0', {observation:'structured-artifact-matched-mmi-observation-non-table-form-spaced-v0.json',digest:'sha256:82a8ce842ed85df49208c03d3fb62475e592311ed7c822a455340de6b8b6e0b1'}],
]);

function readJson(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
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
      if (value !== null) {
        cells.push({row: rowIndex, column: columnIndex, text: value});
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

test('all twelve MMI observations are reproducible from source-only adapter input', () => {
  const manifest = readJson(MANIFEST);
  assertStructuredArtifactProspectiveCorpus(manifest);
  assert.equal(manifest.cases.length, 12);

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
    // Some stored observations carry Python-style numbers such as `1.0`,
    // which the JavaScript canonicalizer cannot reproduce byte for byte.
    // Reproduction is therefore compared as parsed JSON, and the stored
    // bytes are pinned by their digest.
    assert.deepEqual(
      JSON.parse(canonicalStructuredArtifactObservationJson(observation)),
      readJson(expected.observation),
    );
    assert.equal(sha256File(expected.observation), expected.digest);
    assert.equal(
      entry.observation_generation.target_fields_not_supplied_to_adapter,
      true,
    );
    assert.deepEqual(
      entry.observation_generation.excluded_portable_features,
      ['role.header_candidate_signal'],
    );
  }
});

test('final tranche retains distinct geometry without labels', () => {
  for (const family of [
    'sai-h2-table-ragged-row1-4x4-v0',
    'sai-h2-table-wide-row2-5col-v0',
    'sai-h2-table-two-col-row1-v0',
    'sai-h2-non-table-banner-only-v0',
    'sai-h2-non-table-paragraph-block-v0',
    'sai-h2-non-table-form-spaced-v0',
  ]) {
    const expected = EXPECTED.get(family);
    assert.ok(expected);
    const observation = readJson(expected.observation);
    assert.deepEqual(observation.labels, {});
    assert.equal(
      observation.features['role.header_candidate_signal'].method,
      'mmi-worksheet-format-header-candidate-worksheet-format-v6',
    );
  }
});
