import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  SheetSource,
  SourceCell,
} from '../src/core/sheetSource.js';
import {
  createMmiSai2CandidateSet,
  SAI2_CANDIDATE_GENERATOR_ID,
} from '../src/experimental/structuredArtifactSai2CandidateSet.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MATERIALIZATION =
  'structured-artifact-sai2-model-selection-mmi-v0.json';
const CAPTURE =
  'structured-artifact-sai2-model-selection-mmi-candidate-sets-v0.json';

type MatchedSource = {
  source_family_id: string;
  sheet_name: string;
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

function toSheetSource(source: MatchedSource): SheetSource {
  const cells = new Map<string, SourceCell>();
  let maxRow = -1;
  let maxCol = -1;

  source.rows.forEach((row, rowIndex) => {
    maxRow = Math.max(maxRow, rowIndex);
    row.forEach((value, colIndex) => {
      maxCol = Math.max(maxCol, colIndex);
      if (value === null) return;
      cells.set(`${rowIndex}:${colIndex}`, {
        text: value,
        type: 's',
        value,
      });
    });
  });

  return {
    usedRange: maxRow < 0 || maxCol < 0
      ? undefined
      : {
          startRow: 0,
          startCol: 0,
          endRow: maxRow,
          endCol: maxCol,
        },
    merges: source.merges.map((merge) => ({
      startRow: merge.start_row - 1,
      startCol: merge.start_col - 1,
      endRow: merge.end_row - 1,
      endCol: merge.end_col - 1,
    })),
    cellAt(row, col) {
      return cells.get(`${row}:${col}`);
    },
  };
}

test('MMI SAI-2A model-selection candidate sets reproduce from frozen source bytes', () => {
  const materialization = readJson(MATERIALIZATION);
  const capture = readJson(CAPTURE);
  const expected = new Map(
    capture.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  assert.equal(
    materialization.materialization_id,
    'sai-2a-model-selection-mmi-v0',
  );
  assert.equal(capture.generator_id, SAI2_CANDIDATE_GENERATOR_ID);
  assert.equal(materialization.cases.length, 4);
  assert.equal(expected.size, 4);

  let candidateCount = 0;
  for (const entry of materialization.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    assert.ok(sourceName);
    const source = readJson(sourceName) as MatchedSource;
    assert.equal(sha256File(sourceName), entry.source_digest);

    const actual = createMmiSai2CandidateSet({
      sheetName: source.sheet_name,
      sheet: toSheetSource(source),
      sourceDigest: entry.source_digest,
      sourceFamilyId: entry.source_family_id,
    });
    const frozen: any = expected.get(entry.source_family_id);
    assert.ok(frozen);

    assert.equal(actual.status, 'ok');
    assert.equal(actual.status, frozen.status);
    assert.equal(actual.candidate_count, frozen.candidate_count);
    assert.deepEqual(actual.candidates, frozen.candidates);
    candidateCount += actual.candidate_count;
  }

  assert.equal(candidateCount, 8);
});

test('model-selection candidate ordering is stable and target-blind', () => {
  const capture = readJson(CAPTURE);

  for (const entry of capture.cases) {
    let previous: number[] | undefined;
    for (const candidate of entry.candidates) {
      const range = candidate.range;
      const key = [
        range.row_start,
        range.col_start,
        range.row_end,
        range.col_end,
      ];
      if (previous) {
        const diff =
          key[0] - previous[0]
          || key[1] - previous[1]
          || key[2] - previous[2]
          || key[3] - previous[3];
        assert.ok(diff >= 0);
      }
      previous = key;
    }
  }

  assert.deepEqual(capture.boundary, {
    target_fields_supplied: false,
    lexical_inputs_used: false,
    ranking_performed: false,
    candidate_local_feature_capture_performed: false,
    selection_scoring_performed: false,
    winner_selection_performed: false,
    final_holdout_opened: false,
    product_runtime_authority: false,
  });
  assert.deepEqual(capture.next_gate, {
    name:
      'excel_independent_model_selection_candidate_capture_and_rectangle_parity',
    candidate_local_feature_capture_admitted: false,
    selection_scoring_admitted: false,
    final_holdout_open_admitted: false,
  });
});
