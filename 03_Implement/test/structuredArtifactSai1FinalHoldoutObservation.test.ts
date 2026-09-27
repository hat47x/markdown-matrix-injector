import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalStructuredArtifactObservationJson,
  structuredArtifactObservationDigest,
} from '../src/experimental/structuredArtifactNeutralObservation.js';
import {
  createMmiWorksheetStructuredArtifactSai1Observation,
} from '../src/experimental/mmiWorksheetStructuredArtifactSai1Adapter.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const CAPTURE =
  'structured-artifact-sai1-final-holdout-mmi-observations-v0.json';

function readJson(name: string): any {
  return JSON.parse(
    readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'),
  );
}

function toSnapshot(source: any): WorksheetFormatSnapshot {
  const cells: Array<{
    row: number;
    column: number;
    text: string;
  }> = [];
  source.rows.forEach((row: any[], rowIndex: number) => {
    row.forEach((value, columnIndex) => {
      if (value !== null) {
        cells.push({
          row: rowIndex,
          column: columnIndex,
          text: String(value),
        });
      }
    });
  });
  return {
    cells,
    merges: source.merges.map((merge: any) => ({
      startRow: merge.start_row - 1,
      startColumn: merge.start_col - 1,
      endRow: merge.end_row - 1,
      endColumn: merge.end_col - 1,
    })),
  };
}

test('MMI final-holdout observations reproduce from source-only input', () => {
  const capture = readJson(CAPTURE);
  assert.equal(capture.cases.length, 4);
  assert.deepEqual(capture.split_mapping, {
    preregistered: 'final_holdout',
    neutral: 'test',
  });

  for (const entry of capture.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    const observationName =
      entry.observation_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(observationName);
    const source = readJson(sourceName);

    const observation =
      createMmiWorksheetStructuredArtifactSai1Observation({
        snapshot: toSnapshot(source),
        sheetName: source.sheet_name,
        sourceDigest: entry.source_digest,
        sourceFamilyId: source.source_family_id,
        workbookOrDocument:
          source.workbook_or_document,
        producerVersionOrGitSha:
          'fixture:sai1-final-holdout-v0',
        sourceFormat: 'synthetic',
        privacyClass: source.privacy_class,
        split: 'test',
      });

    assert.deepEqual(observation.labels, {});
    assert.equal(
      observation.features['role.header_candidate_signal'],
      undefined,
    );
    assert.equal(
      observation.features['role.body_candidate_signal']?.value,
      entry.body_candidate_value,
    );
    assert.equal(
      canonicalStructuredArtifactObservationJson(observation),
      readFileSync(
        new URL(observationName, FIXTURE_ROOT),
        'utf8',
      ),
    );
    assert.equal(
      structuredArtifactObservationDigest(observation),
      entry.observation_digest,
    );
  }
});

test('final-holdout observation capture remains unscored before Excel parity', () => {
  const capture = readJson(CAPTURE);

  assert.deepEqual(capture.boundary, {
    cross_producer_compared: false,
    final_holdout_opened: true,
    final_holdout_scoring_performed: false,
    observations_generated: true,
    product_runtime_authority: false,
    target_fields_supplied_to_adapter: false,
    winner_changed: false,
    winner_prediction_performed: false,
  });
  assert.deepEqual(capture.next_gate, {
    name:
      'excel_independent_final_holdout_observation_capture_and_parity',
    scoring_admitted: false,
  });
});
