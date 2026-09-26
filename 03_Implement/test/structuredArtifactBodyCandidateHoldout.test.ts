import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  deriveMmiStructuredArtifactBodyCandidateSignal,
  MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
  STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS,
} from '../src/experimental/structuredArtifactBodyCandidateSignal.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const HOLDOUT = 'structured-artifact-holdout-corpus-v0.json';
const EVIDENCE =
  'structured-artifact-body-candidate-holdout-mmi-evidence-v0.json';

type MatchedSource = {
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

test('MMI holdout evidence is reproducible without target input', () => {
  const holdout = readJson(HOLDOUT);
  const evidenceText = readFileSync(
    new URL(EVIDENCE, FIXTURE_ROOT),
    'utf8',
  );
  const evidence = JSON.parse(evidenceText);
  const byFamily = new Map(
    evidence.cases.map((entry: any) => [
      entry.source_family_id,
      entry,
    ]),
  );

  assert.equal(
    evidence.semantics,
    STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS,
  );
  assert.equal(
    evidence.producer.method,
    MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
  );
  assert.equal(holdout.cases.length, 8);
  assert.equal(byFamily.size, 8);

  for (const entry of holdout.cases) {
    const sourceName = entry.source_ref.split('/').at(-1);
    assert.ok(sourceName);
    const source = readJson(sourceName) as MatchedSource;
    const actual =
      deriveMmiStructuredArtifactBodyCandidateSignal(
        toSnapshot(source),
      );
    const expected = byFamily.get(entry.source_family_id) as any;
    assert.ok(expected);
    assert.equal(actual.value, expected.value);
    assert.equal(entry.label_status, expected.label_status);
  }

  assert.equal(
    'sha256:' + createHash('sha256')
      .update(evidenceText)
      .digest('hex'),
    'sha256:ecbcd8e60521469b13723f7ca94ce28d9b0e3ee13dd9766660527af10ad2029b',
  );
});

test('holdout summary reports evidence coverage, not classifier accuracy', () => {
  const evidence = readJson(EVIDENCE);

  assert.deepEqual(evidence.summary, {
    clear_positive: { present: 2, total: 3 },
    clear_negative: { present: 0, total: 3 },
    ambiguous: { present: 0, total: 2 },
  });
  assert.deepEqual(evidence.boundary, {
    holdout_scored: true,
    neutral_adapter_changed: false,
    product_runtime_authority: false,
    thresholds_tuned: false,
    training_performed: false,
  });

  const allText = evidence.cases.find(
    (entry: any) =>
      entry.source_family_id ===
      'sai-f1-table-text-records-4x3-v0',
  );
  assert.equal(allText?.label_status, 'clear_positive');
  assert.equal(allText?.value, 'absent');
});
