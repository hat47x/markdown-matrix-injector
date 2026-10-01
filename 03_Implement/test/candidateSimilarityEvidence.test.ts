import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import {
  CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
  readCandidateSimilarityEvidence,
  similarityEvidenceForCandidate,
} from '../src/core/candidateSimilarityEvidence.js';

function candidate(): Candidate {
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'image',
    locator: {
      source: './data/design.xlsx',
      sourceDigest,
      sheet: '画面',
      range: 'B2:D8',
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims: [{
      aspect: 'digest',
      value: 'sha256:image',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'fixture',
    }],
    provenance: {
      algorithm: 'fixture',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {},
        implementationVersion: '1',
      },
    },
    fingerprint: fingerprintOf('image-media-bytes-v1', 'image'),
    scores: [],
  };
}

function evidenceEntry() {
  return {
    source: 'data/design.xlsx',
    kind: 'image' as const,
    sheet: '画面',
    place: 'B2:D8',
    provider: { id: 'research.embedding-v0', version: '1' },
    metric: {
      namespace: 'research.embedding-v0',
      name: 'cosine',
      semantics: 'pairwise similarity only; not identity',
      value: 0.95,
      range: { min: -1, max: 1 },
      higherIsStronger: true,
    },
    target: {
      source: 'data/design.xlsx',
      kind: 'image' as const,
      sheet: '旧画面',
      place: 'J2:L8',
    },
    evidence: [{ code: 'research-only' }],
  };
}

test('sidecar validates and matches only the current occurrence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-similarity-'));
  const evidencePath = path.join(root, 'evidence.json');
  const absoluteSource = path.join(root, 'data', 'design.xlsx');
  const entry = evidenceEntry();

  fs.writeFileSync(evidencePath, JSON.stringify({
    schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
    entries: [
      entry,
      { ...entry, place: 'Z1:Z2' },
    ],
  }));

  const document = readCandidateSimilarityEvidence(evidencePath);
  assert.deepEqual(
    similarityEvidenceForCandidate(document, evidencePath, absoluteSource, candidate()),
    [entry],
  );
});

test('sidecar rejects non-finite and out-of-range metrics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-similarity-'));
  const evidencePath = path.join(root, 'evidence.json');
  const entry = evidenceEntry();

  fs.writeFileSync(evidencePath, JSON.stringify({
    schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
    entries: [{ ...entry, metric: { ...entry.metric, value: 2 } }],
  }));
  assert.throws(
    () => readCandidateSimilarityEvidence(evidencePath),
    /metric\.range must contain the score/u,
  );

  fs.writeFileSync(evidencePath, JSON.stringify({
    schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
    entries: [{ ...entry, metric: { ...entry.metric, value: null } }],
  }));
  assert.throws(
    () => readCandidateSimilarityEvidence(evidencePath),
    /metric\.value must be finite/u,
  );
});

test('different provider namespaces remain separate entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-similarity-'));
  const evidencePath = path.join(root, 'evidence.json');
  const absoluteSource = path.join(root, 'data', 'design.xlsx');
  const first = evidenceEntry();
  const second = {
    ...first,
    provider: { id: 'research.other-v0', version: '2' },
    metric: {
      namespace: 'research.other-v0',
      name: 'rank',
      semantics: 'provider-local rank; not comparable to cosine',
      value: 1,
      range: { min: 0, max: 100 },
      higherIsStronger: false,
    },
  };

  fs.writeFileSync(evidencePath, JSON.stringify({
    schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
    entries: [first, second],
  }));

  const matches = similarityEvidenceForCandidate(
    readCandidateSimilarityEvidence(evidencePath),
    evidencePath,
    absoluteSource,
    candidate(),
  );
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((item) => item.metric.namespace), [
    'research.embedding-v0',
    'research.other-v0',
  ]);
});
