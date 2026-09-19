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
  createContainedCognitiveObservation,
} from '../src/experimental/cognitiveSourceObservation.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cognitive-observation-'));
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'source.csv');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, 'ID,State\n1,ready\n');

  return { root, docs, markdownFilePath, sourcePath };
}

test('creates provenance from the canonical contained source identity', () => {
  const f = fixture();
  const expected = readSourceFileIdentity(f.sourcePath);

  const result = createContainedCognitiveObservation(
    {
      id: 'obs-1',
      kind: 'worksheet-format',
      schemaVersion: 'worksheet-format-observation-v1',
      sourceKind: 'csv',
      markdownFilePath: f.markdownFilePath,
      sourcePath: '../data/source.csv',
      workspaceRoot: f.root,
      featureVersion: 'worksheet-format-v6',
      sourceProfileId: 'sheetjs-ce-xlsx-0.20.3',
    },
    (resolvedPath) => ({
      basename: path.basename(resolvedPath),
    }),
  );

  assert.equal(result.resolvedPath, f.sourcePath);
  assert.deepEqual(result.sourceIdentity, expected);
  assert.equal(result.observation.provenance.sourceDigest, expected.digest);
  assert.equal(
    result.observation.provenance.featureVersion,
    'worksheet-format-v6',
  );
  assert.equal(
    result.observation.provenance.sourceProfileId,
    'sheetjs-ce-xlsx-0.20.3',
  );
  assert.deepEqual(result.observation.payload, {
    basename: 'source.csv',
  });
});

test('passes only the contained resolved path to the payload reader', () => {
  const f = fixture();
  const seen: string[] = [];

  createContainedCognitiveObservation(
    {
      id: 'obs-2',
      kind: 'source-review',
      schemaVersion: 'source-review-v1',
      sourceKind: 'csv',
      markdownFilePath: f.markdownFilePath,
      sourcePath: '../data/source.csv',
      workspaceRoot: f.root,
    },
    (resolvedPath) => {
      seen.push(resolvedPath);
      return { ok: true };
    },
  );

  assert.deepEqual(seen, [f.sourcePath]);
});

test('does not call the reader when traversal escapes the workspace', () => {
  const f = fixture();
  const outside = path.join(path.dirname(f.root), 'outside.csv');
  fs.writeFileSync(outside, 'secret');
  let calls = 0;

  assert.throws(
    () => createContainedCognitiveObservation(
      {
        id: 'obs-3',
        kind: 'source-review',
        schemaVersion: 'source-review-v1',
        sourceKind: 'csv',
        markdownFilePath: f.markdownFilePath,
        sourcePath: `../../${path.basename(outside)}`,
        workspaceRoot: f.root,
      },
      () => {
        calls += 1;
        return { ok: true };
      },
    ),
    PathContainmentError,
  );
  assert.equal(calls, 0);
});

test('does not call the reader for a symlink whose target is outside the workspace', () => {
  const f = fixture();
  const outside = path.join(path.dirname(f.root), 'outside-link-target.csv');
  fs.writeFileSync(outside, 'secret');
  const link = path.join(f.root, 'outside-link.csv');
  fs.symlinkSync(outside, link);
  let calls = 0;

  assert.throws(
    () => createContainedCognitiveObservation(
      {
        id: 'obs-4',
        kind: 'source-review',
        schemaVersion: 'source-review-v1',
        sourceKind: 'csv',
        markdownFilePath: f.markdownFilePath,
        sourcePath: '../outside-link.csv',
        workspaceRoot: f.root,
      },
      () => {
        calls += 1;
        return { ok: true };
      },
    ),
    PathContainmentError,
  );
  assert.equal(calls, 0);
});

test('fails closed when source changes during payload read', () => {
  const f = fixture();

  assert.throws(
    () => createContainedCognitiveObservation(
      {
        id: 'obs-5',
        kind: 'source-review',
        schemaVersion: 'source-review-v1',
        sourceKind: 'csv',
        markdownFilePath: f.markdownFilePath,
        sourcePath: '../data/source.csv',
        workspaceRoot: f.root,
      },
      (resolvedPath) => {
        fs.appendFileSync(resolvedPath, '2,changed\n');
        return { ok: true };
      },
    ),
    SourceChangedDuringCognitiveObservationError,
  );
});

test('propagates payload reader errors without creating synthetic observation', () => {
  const f = fixture();

  assert.throws(
    () => createContainedCognitiveObservation(
      {
        id: 'obs-6',
        kind: 'source-review',
        schemaVersion: 'source-review-v1',
        sourceKind: 'csv',
        markdownFilePath: f.markdownFilePath,
        sourcePath: '../data/source.csv',
        workspaceRoot: f.root,
      },
      () => {
        throw new Error('fixture read failed');
      },
    ),
    /fixture read failed/,
  );
});

test('reuses Cognitive Contract validation for required metadata', () => {
  const f = fixture();

  assert.throws(
    () => createContainedCognitiveObservation(
      {
        id: '   ',
        kind: 'source-review',
        schemaVersion: 'source-review-v1',
        sourceKind: 'csv',
        markdownFilePath: f.markdownFilePath,
        sourcePath: '../data/source.csv',
        workspaceRoot: f.root,
      },
      () => ({ ok: true }),
    ),
    /observation.id/,
  );
});

test('Observation serialization excludes absolute source path and raw source bytes', () => {
  const f = fixture();
  const result = createContainedCognitiveObservation(
    {
      id: 'obs-8',
      kind: 'source-review',
      schemaVersion: 'source-review-v1',
      sourceKind: 'csv',
      markdownFilePath: f.markdownFilePath,
      sourcePath: '../data/source.csv',
      workspaceRoot: f.root,
    },
    () => ({ state: 'ready' }),
  );

  const serialized = JSON.stringify(result.observation);
  assert.equal(serialized.includes(f.sourcePath), false);
  assert.equal(serialized.includes('ID,State'), false);
  assert.equal(serialized.includes('"sourceDigest"'), true);
});
