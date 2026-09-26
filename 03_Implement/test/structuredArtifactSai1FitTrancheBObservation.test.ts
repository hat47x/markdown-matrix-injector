import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  'structured-artifact-sai1-fit-tranche-b-mmi-observations-v0.json';

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

test('MMI tranche B observations reproduce from source-only input', () => {
  const capture = readJson(CAPTURE);
  assert.equal(capture.cases.length, 6);

  for (const entry of capture.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    const observationName =
      entry.observation_ref.split('/').at(-1);
    assert.ok(sourceName);
    assert.ok(observationName);

    const source = readJson(sourceName) as MatchedSource;
    assert.equal(sha256File(sourceName), entry.source_digest);

    const observation =
      createMmiWorksheetStructuredArtifactSai1Observation({
        snapshot: toSnapshot(source),
        sheetName: source.sheet_name,
        sourceDigest: entry.source_digest,
        sourceFamilyId: source.source_family_id,
        workbookOrDocument:
          source.workbook_or_document,
        producerVersionOrGitSha:
          'fixture:sai1-fit-tranche-b-v0',
        sourceFormat: 'synthetic',
        privacyClass: source.privacy_class,
        split: 'train',
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

test('tranche B body candidates separate the designed positive and negative groups', () => {
  const capture = readJson(CAPTURE);
  const present = capture.cases.filter(
    (entry: any) =>
      entry.body_candidate_value === 'present',
  );
  const absent = capture.cases.filter(
    (entry: any) =>
      entry.body_candidate_value === 'absent',
  );

  assert.equal(present.length, 3);
  assert.equal(absent.length, 3);
  assert.equal(
    present.every(
      (entry: any) =>
        entry.source_family_id.startsWith('sai-f2-table-'),
    ),
    true,
  );
  assert.equal(
    absent.every(
      (entry: any) =>
        entry.source_family_id.startsWith('sai-f2-non-table-'),
    ),
    true,
  );
});

test('tranche B capture remains pre-fit and hands off to Excel parity', () => {
  const capture = readJson(CAPTURE);

  assert.deepEqual(capture.excluded_inputs, [
    'role.header_candidate_signal',
  ]);
  assert.deepEqual(capture.boundary, {
    target_fields_supplied_to_adapter: false,
    observations_generated: true,
    cross_producer_compared: false,
    model_fit_performed: false,
    threshold_tuning_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(capture.next_gate, {
    name:
      'excel_independent_observation_capture_and_full_fit_parity_check',
    training_admitted: false,
  });
});
