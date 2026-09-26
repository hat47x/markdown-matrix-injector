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
  MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_CONFIG_DIGEST,
  MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_VERSION,
} from '../src/experimental/mmiWorksheetStructuredArtifactSai1Adapter.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const CAPTURE =
  'structured-artifact-sai1-fit-tranche-a-mmi-observations-v0.json';

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

test('SAI-1 fit tranche A capture exposes only preregistered portable inputs', () => {
  const capture = readJson(CAPTURE);

  assert.equal(
    MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_CONFIG_DIGEST,
    'sha256:d43374587cbbbc1605aca34229f10d3b152afa5711b3c787c7f4fca11599131e',
  );
  assert.deepEqual(capture.split_mapping, {
    preregistered: 'fit',
    neutral: 'train',
  });
  assert.deepEqual(capture.portable_inputs, [
    'region.row_count',
    'region.col_count',
    'geometry.non_empty_ratio',
    'geometry.merged_cell_count',
    'role.body_candidate_signal',
  ]);
  assert.deepEqual(
    capture.excluded_inputs,
    ['role.header_candidate_signal'],
  );
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
  assert.equal(capture.cases.length, 4);
});

test('MMI SAI-1 observations reproduce from corrected source bytes only', () => {
  const capture = readJson(CAPTURE);

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
          'fixture:sai1-fit-tranche-a-v0',
        sourceFormat: 'synthetic',
        privacyClass: source.privacy_class,
        split: 'train',
      });

    assert.deepEqual(observation.labels, {});
    assert.equal(
      observation.producer.adapter_version,
      MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_VERSION,
    );
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
    assert.equal(observation.split.split, 'train');
    assert.equal(
      observation.split.group_keys.source_family,
      entry.source_family_id,
    );
  }
});

test('corrected sparse KV source is the only captured SAI-1 KV identity', () => {
  const capture = readJson(CAPTURE);
  const kv = capture.cases.find(
    (entry: any) =>
      entry.source_family_id
      === 'sai-f2-non-table-kv-record-5x2-v0',
  );
  assert.ok(kv);
  assert.equal(
    kv.source_digest,
    'sha256:d882e580758ed19596b34a9824b7eb4362995ec41d79f0878f3b875ac1496efa',
  );
  assert.equal(kv.body_candidate_value, 'absent');
});

test('capture remains pre-fit and delegates next capture to Excel', () => {
  const capture = readJson(CAPTURE);

  assert.deepEqual(capture.next_gate, {
    name:
      'excel_independent_observation_capture_and_parity_check',
    training_admitted: false,
  });
});
