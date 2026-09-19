import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
  FLY_WORKSHEET_FORMAT_PROVIDER,
} from '../src/experimental/flyWorksheetFormatPerceptionProvider.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

function snapshot(labels: readonly string[]): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      ...labels.map((label, column) => ({
        row: 1,
        column,
        text: label,
        fillTone: 'dark' as const,
      })),
      ...labels.map((_, column) => ({
        row: 2,
        column,
        text: `v${column + 1}`,
      })),
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: labels.length - 1,
    }],
  };
}

function observation(id: string): CognitiveObservation<{ kind: 'worksheet-format' }> {
  return {
    id,
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    payload: { kind: 'worksheet-format' },
    provenance: {
      sourceKind: 'xlsx',
      sourceDigest: `sha256:${id}`,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
  };
}

test('adapts matched result without changing winner, ranking, or scores', () => {
  const baseline = createWorksheetFormatPrototype(
    'baseline',
    snapshot(['ID', 'State', 'Note']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const alternate = createWorksheetFormatPrototype(
    'alternate',
    snapshot(['Code', 'Name', 'Memo']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    snapshot(['ID', 'State', 'Note']),
    [baseline, alternate],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const adapted = adaptWorksheetFormatMatchToCognitiveOutcome(
    observation('matched'),
    result,
  );

  assert.equal(adapted.status, 'signal');
  assert.equal(adapted.provider, FLY_WORKSHEET_FORMAT_PROVIDER);
  assert.equal(adapted.provider.executionBoundary, 'local');
  assert.equal(adapted.signal.kind, 'format-candidate-ranking');
  assert.equal(adapted.signal.payload.classification, 'matched');
  assert.equal(
    adapted.signal.payload.winnerPrototypeId,
    result.match.winner?.prototypeId,
  );
  assert.deepEqual(
    adapted.signal.payload.candidates.map((candidate) => candidate.prototypeId),
    result.match.candidates.map((candidate) => candidate.prototypeId),
  );
  assert.deepEqual(
    adapted.signal.payload.candidates.map((candidate) => candidate.confidence),
    result.match.candidates.map((candidate) => candidate.confidence),
  );
  assert.equal(adapted.signal.payload.noveltyScore, result.match.noveltyScore);
});

test('keeps ambiguous candidates visible and does not invent a winner', () => {
  const left = createWorksheetFormatPrototype(
    'left',
    snapshot(['ID', 'State']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const right = createWorksheetFormatPrototype(
    'right',
    snapshot(['ID', 'State']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    snapshot(['ID', 'State']),
    [left, right],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const adapted = adaptWorksheetFormatMatchToCognitiveOutcome(
    observation('ambiguous'),
    result,
  );

  assert.equal(result.match.status, 'ambiguous');
  assert.equal(result.match.winner, undefined);
  assert.equal(adapted.signal.kind, 'format-ambiguity');
  assert.equal(adapted.signal.payload.classification, 'ambiguous');
  assert.equal(adapted.signal.payload.winnerPrototypeId, undefined);
  assert.equal(adapted.signal.payload.candidates.length, 2);
});

test('maps novel result to a novelty signal without forcing a winner', () => {
  const baseline = createWorksheetFormatPrototype(
    'baseline',
    snapshot(['ID', 'State', 'Note']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    snapshot(['Code', 'Type', 'Owner']),
    [baseline],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const adapted = adaptWorksheetFormatMatchToCognitiveOutcome(
    observation('novel'),
    result,
  );

  assert.equal(result.match.status, 'novel');
  assert.equal(adapted.signal.kind, 'format-novelty');
  assert.equal(adapted.signal.payload.classification, 'novel');
  assert.equal(adapted.signal.payload.winnerPrototypeId, undefined);
  assert.equal(adapted.signal.payload.noveltyScore, result.match.noveltyScore);
});

test('preserves feature/source profile provenance and Fly-specific score semantics', () => {
  const baseline = createWorksheetFormatPrototype(
    'baseline',
    snapshot(['ID', 'State', 'Note']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    snapshot(['ID', 'State', 'Note']),
    [baseline],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const adapted = adaptWorksheetFormatMatchToCognitiveOutcome(
    observation('provenance'),
    result,
  );

  assert.equal(
    adapted.signal.payload.featureVersion,
    WORKSHEET_FORMAT_FEATURE_VERSION,
  );
  assert.equal(
    adapted.signal.payload.sourceProfileId,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
  );
  assert.deepEqual(
    adapted.signal.payload.sourceEvidence,
    result.sourceEvidence,
  );

  const scores = adapted.signal.scores ?? [];
  assert.ok(scores.length >= 3);
  assert.ok(scores.every((score) =>
    score.namespace === FLY_WORKSHEET_FORMAT_PROVIDER.id));
  assert.ok(scores.some((score) => score.name === 'top-confidence'));
  assert.ok(scores.some((score) => score.name === 'top-deviation-score'));
  assert.ok(scores.some((score) => score.name === 'novelty-score'));
});

test('rejects observation provenance that does not match the worksheet result', () => {
  const baseline = createWorksheetFormatPrototype(
    'baseline',
    snapshot(['ID', 'State', 'Note']),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const result = matchWorksheetFormatSnapshot(
    snapshot(['ID', 'State', 'Note']),
    [baseline],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const wrongVersion = observation('wrong-version');
  wrongVersion.provenance.featureVersion = 'worksheet-format-v0';
  assert.throws(
    () => adaptWorksheetFormatMatchToCognitiveOutcome(wrongVersion, result),
    /feature version/,
  );

  const wrongProfile = observation('wrong-profile');
  wrongProfile.provenance.sourceProfileId = 'other-profile';
  assert.throws(
    () => adaptWorksheetFormatMatchToCognitiveOutcome(wrongProfile, result),
    /source profile/,
  );
});
