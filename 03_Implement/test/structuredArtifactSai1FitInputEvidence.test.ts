import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createMmiWorksheetStructuredArtifactObservation,
} from '../src/experimental/mmiWorksheetStructuredArtifactNeutralAdapter.js';
import {
  deriveMmiStructuredArtifactBodyCandidateSignal,
} from '../src/experimental/structuredArtifactBodyCandidateSignal.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MANIFEST = 'structured-artifact-sai1-fit-tranche-a-mmi-v0.json';
const EVIDENCE = 'structured-artifact-sai1-fit-tranche-a-mmi-input-evidence-v0.json';

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

test('MMI tranche A portable inputs are reproducible from source only', () => {
  const manifest = readJson(MANIFEST);
  const evidence = readJson(EVIDENCE);
  const expected = new Map(
    evidence.cases.map((entry: any) => [entry.source_family_id, entry]),
  );

  assert.equal(manifest.cases.length, 4);
  assert.equal(expected.size, 4);

  for (const entry of manifest.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    assert.ok(sourceName);
    const source = readJson(sourceName) as MatchedSource;
    const snapshot = toSnapshot(source);
    const observation = createMmiWorksheetStructuredArtifactObservation({
      snapshot,
      sheetName: source.sheet_name,
      sourceDigest: sha256File(sourceName),
      sourceFamilyId: source.source_family_id,
      workbookOrDocument: source.workbook_or_document,
      producerVersionOrGitSha: evidence.producer.base_sha,
      sourceFormat: 'synthetic',
      privacyClass: source.privacy_class,
      split: 'unassigned',
    });
    const body = deriveMmiStructuredArtifactBodyCandidateSignal(snapshot);
    const frozen = expected.get(entry.source_family_id) as any;
    assert.ok(frozen);
    assert.equal(frozen.label_status, entry.label_status);
    assert.equal(frozen.split, 'fit');
    assert.deepEqual(frozen.values, {
      'region.row_count': observation.region.row_count,
      'region.col_count': observation.region.col_count,
      'geometry.non_empty_ratio':
        observation.features['geometry.non_empty_ratio']?.value,
      'geometry.merged_cell_count':
        observation.features['geometry.merged_cell_count']?.value,
      'role.body_candidate_signal': body.value,
    });
    assert.deepEqual(observation.labels, {});
  }
});

test('MMI fit-input evidence excludes the nonportable header signal and keeps training blocked', () => {
  const evidence = readJson(EVIDENCE);

  assert.deepEqual(evidence.portable_inputs, [
    'region.row_count',
    'region.col_count',
    'geometry.non_empty_ratio',
    'geometry.merged_cell_count',
    'role.body_candidate_signal',
  ]);
  assert.deepEqual(evidence.excluded_inputs, ['role.header_candidate_signal']);
  assert.equal(
    evidence.cases.some(
      (entry: any) =>
        Object.prototype.hasOwnProperty.call(
          entry.values,
          'role.header_candidate_signal',
        ),
    ),
    false,
  );
  assert.deepEqual(evidence.boundary, {
    source_only_generation: true,
    reference_targets_supplied_to_adapter: false,
    model_fit_performed: false,
    threshold_tuning_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(evidence.next_gate, {
    name: 'excel_independent_fit_input_capture_and_cross_producer_parity',
    training_admitted: false,
  });
});
