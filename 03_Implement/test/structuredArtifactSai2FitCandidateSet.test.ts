import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  SheetSource,
  SourceCell,
} from '../src/core/sheetSource.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import {
  createMmiSai2CandidateSet,
  SAI2_CANDIDATE_GENERATOR_ID,
  SAI2_MAX_UNIQUE_CANDIDATES,
} from '../src/experimental/structuredArtifactSai2CandidateSet.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const MATERIALIZATION =
  'structured-artifact-sai2-fit-mmi-v0.json';
const CAPTURE =
  'structured-artifact-sai2-fit-mmi-candidate-sets-v0.json';

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

test('MMI SAI-2 fit candidate sets reproduce from source-only regionDetector input', () => {
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
    'sai-2a-fit-mmi-v1',
  );
  assert.equal(capture.generator_id, SAI2_CANDIDATE_GENERATOR_ID);
  assert.equal(materialization.cases.length, 10);
  assert.equal(expected.size, 10);

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

    assert.equal(actual.status, frozen.status);
    assert.equal(actual.candidate_count, frozen.candidate_count);
    assert.deepEqual(actual.candidates, frozen.candidates);
    assert.deepEqual(actual.boundary, {
      target_fields_supplied: false,
      lexical_inputs_used: false,
      ranking_performed: false,
      product_runtime_authority: false,
    });
  }
});

test('MMI SAI-2 candidate ordering is one-based inclusive and stable', () => {
  const capture = readJson(CAPTURE);
  for (const entry of capture.cases) {
    let previous: number[] | undefined;
    for (const candidate of entry.candidates) {
      const range = candidate.range;
      assert.equal(range.coordinate_system, 'one_based_inclusive');
      assert.equal(
        range.row_count,
        range.row_end - range.row_start + 1,
      );
      assert.equal(
        range.col_count,
        range.col_end - range.col_start + 1,
      );
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
});

test('MMI SAI-2 candidate cap and empty source fail to generator OOD', () => {
  const empty: SheetSource = {
    usedRange: undefined,
    merges: [],
    cellAt: () => undefined,
  };
  assert.equal(
    createMmiSai2CandidateSet({
      sheetName: 'Sheet1',
      sheet: empty,
      sourceDigest: 'sha256:' + '0'.repeat(64),
      sourceFamilyId: 'empty',
    }).status,
    'generator_ood',
  );

  const blockCount = SAI2_MAX_UNIQUE_CANDIDATES + 1;
  const endRow = (blockCount - 1) * 2;
  const cells = new Map<string, SourceCell>();
  for (let index = 0; index < blockCount; index += 1) {
    const row = index * 2;
    for (let col = 0; col < 2; col += 1) {
      cells.set(`${row}:${col}`, {
        text: `${row}-${col}`,
        type: 's',
        value: `${row}-${col}`,
      });
    }
  }
  const overflow: SheetSource = {
    usedRange: {
      startRow: 0,
      startCol: 0,
      endRow,
      endCol: 1,
    },
    merges: [],
    cellAt(row, col) {
      return cells.get(`${row}:${col}`);
    },
  };
  const result = createMmiSai2CandidateSet({
    sheetName: 'Sheet1',
    sheet: overflow,
    sourceDigest: 'sha256:' + '1'.repeat(64),
    sourceFamilyId: 'overflow',
  });
  assert.equal(result.status, 'generator_ood');
  assert.equal(result.candidate_count, 0);
  assert.deepEqual(result.candidates, []);
});

// Records the existing research-only status contract without treating it as
// cross-producer parity or adopting a new shared runtime status.
test('MMI SAI-2 blank or whitespace-only cell retains an empty ok candidate set', () => {
  for (const value of ['', ' ']) {
    const sheet = sheetSourceFromMatrix([[value]]);
    assert.deepEqual(sheet.usedRange, {
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 0,
    });

    const actual = createMmiSai2CandidateSet({
      sheetName: 'Sheet1',
      sheet,
      sourceDigest: 'sha256:' + '2'.repeat(64),
      sourceFamilyId: 'blank-cell-boundary',
    });
    assert.equal(actual.status, 'ok');
    assert.equal(actual.candidate_count, 0);
    assert.deepEqual(actual.candidates, []);
  }
});

test('SAI-2 candidate capture freezes rectangles before target metrics or ranking', () => {
  const capture = readJson(CAPTURE);

  assert.deepEqual(capture.boundary, {
    candidate_metrics_computed: false,
    lexical_inputs_used: false,
    product_runtime_authority: false,
    ranking_performed: false,
    target_fields_supplied: false,
  });
  assert.deepEqual(capture.next_gate, {
    candidate_metrics_admitted: false,
    name:
      'excel_independent_fit_candidate_capture_and_rectangle_parity',
    ranking_admitted: false,
  });
});
