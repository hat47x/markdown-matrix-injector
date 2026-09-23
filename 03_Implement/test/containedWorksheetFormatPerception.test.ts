import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PathContainmentError,
} from '../src/core/pathResolver.js';
import {
  readSourceFileIdentity,
} from '../src/core/sourceIdentity.js';
import {
  SourceChangedDuringCognitiveObservationError,
} from '../src/experimental/cognitiveSourceObservation.js';
import {
  prepareContainedWorksheetFormatPerceptionWithReader,
} from '../src/experimental/containedWorksheetFormatPerception.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  type FormatProfileV1,
} from '../src/experimental/formatProfile.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from '../src/experimental/worksheetFormatPrototype.js';

function snapshot(
  includeMerges = true,
): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      { row: 1, column: 0, text: 'ID', fillTone: 'dark' },
      { row: 1, column: 1, text: 'State', fillTone: 'dark' },
      { row: 2, column: 0, text: '1' },
      { row: 2, column: 1, text: 'ready' },
    ],
    ...(includeMerges
      ? {
          merges: [{
            startRow: 0,
            startColumn: 0,
            endRow: 0,
            endColumn: 1,
          }],
        }
      : {}),
  };
}

function approvedProfile(
  id: string,
  sourceSnapshot = snapshot(),
): FormatProfileV1 {
  const prototype = createWorksheetFormatPrototype(
    id,
    sourceSnapshot,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return approveFormatProfile(
    createFormatProfileCandidate({
      id,
      label: `Profile ${id}`,
      purpose: `Contained perception fixture ${id}`,
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: `sha256:baseline-${id}`,
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: `review:${id}`,
    },
  );
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-contained-perception-'));
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'source.xlsx');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, Buffer.from('fixture-xlsx-bytes'));

  return {
    root,
    markdownFilePath,
    sourcePath,
    input: {
      observationId: 'worksheet-observation',
      sourceKind: 'xlsx',
      markdownFilePath,
      sourcePath: '../data/source.xlsx',
      workspaceRoot: root,
      approvedProfiles: [approvedProfile('release-table')],
    },
  };
}

test('creates matched Fly Perception from a stable contained source', () => {
  const f = fixture();
  const seen: string[] = [];

  const result = prepareContainedWorksheetFormatPerceptionWithReader(
    f.input,
    (absolutePath, requestedSheet) => {
      seen.push(absolutePath);
      assert.equal(requestedSheet, undefined);
      return {
        sheetName: 'Sheet1',
        snapshot: snapshot(),
      };
    },
  );

  assert.deepEqual(seen, [f.sourcePath]);
  assert.equal(result.perception.signal.payload.classification, 'matched');
  assert.equal(
    result.perception.signal.payload.winnerPrototypeId,
    'release-table',
  );
  assert.equal(
    result.observation.provenance.sourceDigest,
    readSourceFileIdentity(f.sourcePath).digest,
  );
  assert.equal(
    result.observation.provenance.featureVersion,
    'worksheet-format-v6',
  );
  assert.equal(
    result.observation.provenance.sourceProfileId,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
  );
  assert.deepEqual(result.observation.payload, {
    kind: 'worksheet-format',
    sheetName: 'Sheet1',
  });
  assert.equal(
    result.perception.signal.payload.observationIdentity.sourceDigest,
    result.observation.provenance.sourceDigest,
  );
  assert.equal(
    result.perception.signal.payload.observationIdentity.sourceProfileId,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
  );
  assert.match(
    result.perception.signal.payload.observationIdentity.digest,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.equal(
    JSON.stringify(result.perception.signal.payload.observationIdentity)
      .includes('"features"'),
    false,
  );
});

test('preserves ambiguous classification from identical approved Profiles', () => {
  const f = fixture();

  const result = prepareContainedWorksheetFormatPerceptionWithReader(
    {
      ...f.input,
      approvedProfiles: [
        approvedProfile('left'),
        approvedProfile('right'),
      ],
    },
    () => ({ sheetName: 'Sheet1', snapshot: snapshot() }),
  );

  assert.equal(result.perception.signal.payload.classification, 'ambiguous');
  assert.equal(
    result.perception.signal.payload.winnerPrototypeId,
    undefined,
  );
});

test('preserves novel classification when no approved Profiles exist', () => {
  const f = fixture();

  const result = prepareContainedWorksheetFormatPerceptionWithReader(
    {
      ...f.input,
      approvedProfiles: [],
    },
    () => ({ sheetName: 'Sheet1', snapshot: snapshot() }),
  );

  assert.equal(result.perception.signal.payload.classification, 'novel');
  assert.deepEqual(result.perception.signal.payload.candidates, []);
});

test('rejects an unapproved Profile before invoking the snapshot reader', () => {
  const f = fixture();
  const prototype = createWorksheetFormatPrototype(
    'candidate',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const candidate = createFormatProfileCandidate({
    id: 'candidate',
    label: 'Candidate',
    purpose: 'Not approved',
    prototype,
    sourceKind: 'xlsx-baseline',
    sourceDigest: 'sha256:candidate',
  });
  let calls = 0;

  assert.throws(
    () => prepareContainedWorksheetFormatPerceptionWithReader(
      {
        ...f.input,
        approvedProfiles: [candidate],
      },
      () => {
        calls += 1;
        return { sheetName: 'Sheet1', snapshot: snapshot() };
      },
    ),
    /Only an approved Format Profile/,
  );
  assert.equal(calls, 0);
});

test('fails closed when source changes during snapshot read', () => {
  const f = fixture();

  assert.throws(
    () => prepareContainedWorksheetFormatPerceptionWithReader(
      f.input,
      (absolutePath) => {
        fs.appendFileSync(absolutePath, 'changed');
        return { sheetName: 'Sheet1', snapshot: snapshot() };
      },
    ),
    SourceChangedDuringCognitiveObservationError,
  );
});

test('propagates snapshot reader errors', () => {
  const f = fixture();

  assert.throws(
    () => prepareContainedWorksheetFormatPerceptionWithReader(
      f.input,
      () => {
        throw new Error('snapshot read failed');
      },
    ),
    /snapshot read failed/,
  );
});

test('does not invoke snapshot reader when containment fails', () => {
  const f = fixture();
  const outside = path.join(path.dirname(f.root), 'outside.xlsx');
  fs.writeFileSync(outside, 'outside');
  let calls = 0;

  assert.throws(
    () => prepareContainedWorksheetFormatPerceptionWithReader(
      {
        ...f.input,
        sourcePath: `../../${path.basename(outside)}`,
      },
      () => {
        calls += 1;
        return { sheetName: 'Sheet1', snapshot: snapshot() };
      },
    ),
    PathContainmentError,
  );
  assert.equal(calls, 0);
});

test('accepts snapshots where merges are omitted', () => {
  const f = fixture();
  const result = prepareContainedWorksheetFormatPerceptionWithReader(
    f.input,
    () => ({ sheetName: 'Sheet1', snapshot: snapshot(false) }),
  );

  assert.equal(
    result.perception.signal.payload.classification,
    'matched',
  );
});

test('Observation serialization excludes snapshot cells, features, and absolute path', () => {
  const f = fixture();

  const result = prepareContainedWorksheetFormatPerceptionWithReader(
    f.input,
    () => ({ sheetName: 'Sheet1', snapshot: snapshot() }),
  );

  const serialized = JSON.stringify(result.observation);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes(f.sourcePath), false);
  assert.equal(serialized.includes('"sourceDigest"'), true);
});
