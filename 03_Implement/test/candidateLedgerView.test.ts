import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { candidateLedgerView } from '../src/core/candidateLedgerView.js';
import {
  CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
  type CandidateSimilarityEvidenceDocument,
} from '../src/core/candidateSimilarityEvidence.js';
import { emptyLedger, entryFor, type Ledger } from '../src/core/importLedger.js';

const ledgerPath = path.resolve('/workspace/mmi-ledger.json');
const sourcePath = path.resolve('/workspace/data/design.xlsx');

function candidate(content: string, sheet: string, range: string): Candidate {
  const fingerprint = fingerprintOf('image-media-bytes-v1', content);
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'image',
    locator: { source: './data/design.xlsx', sourceDigest, sheet, range },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims: [{
      aspect: 'digest',
      value: fingerprint.digest,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'test',
    }],
    provenance: {
      algorithm: 'test',
      run: { execution: 'deterministic', inputDigest: sourceDigest, config: {}, implementationVersion: '1' },
    },
    fingerprint,
    scores: [],
  };
}

const imported = candidate('same-image', 'Sheet1', 'B2:D8');
const duplicateOccurrence = candidate('same-image', 'Sheet2', 'A1:C7');
const changedOccurrence = candidate('changed-image', 'Sheet1', 'B2:D8');
const newOccurrence = candidate('new-image', 'Sheet3', 'E2:F6');
const ledger: Ledger = {
  ...emptyLedger(),
  entries: [entryFor(ledgerPath, sourcePath, imported, '/workspace/assets/image.png', 'mmi extract')],
};

test('all distinguishes imported, duplicate, changed and unimported evidence', () => {
  const view = candidateLedgerView(
    [imported, duplicateOccurrence, changedOccurrence, newOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
  );
  assert.deepEqual(
    view.map((item) => item.ledgerState),
    ['imported', 'duplicate', 'changed', 'unimported'],
  );
  assert.equal(view[1].lineageCandidates.length, 1);
  assert.deepEqual(view[1].lineageCandidates[0].reasons, ['same-content']);
  assert.equal(view[1].lineageCandidates[0].place, 'B2:D8');
});

test('unimported includes never-imported duplicate occurrences but not changed ones', () => {
  const view = candidateLedgerView(
    [imported, duplicateOccurrence, changedOccurrence, newOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
    'unimported',
  );
  assert.deepEqual(view.map((item) => item.ledgerState), ['duplicate', 'unimported']);
});

test('exclude-imported retains changed occurrences for review', () => {
  const view = candidateLedgerView(
    [imported, duplicateOccurrence, changedOccurrence, newOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
    'exclude-imported',
  );
  assert.deepEqual(view.map((item) => item.ledgerState), ['duplicate', 'changed', 'unimported']);
});


test('stale reviewed Claims stay out of strict unimported but remain in attention view', () => {
  const staleCandidate: Candidate = {
    ...imported,
    claims: imported.claims.map((claim) => ({
      ...claim,
      reasonCode: 'changed-review-basis',
    })),
  };

  const all = candidateLedgerView(
    [staleCandidate],
    ledger,
    ledgerPath,
    sourcePath,
    'all',
  );
  assert.equal(all[0].ledgerState, 'stale');
  assert.deepEqual(all[0].staleClaims, ['digest']);
  assert.deepEqual(all[0].lineageCandidates, []);

  assert.equal(
    candidateLedgerView(
      [staleCandidate],
      ledger,
      ledgerPath,
      sourcePath,
      'unimported',
    ).length,
    0,
  );
  assert.deepEqual(
    candidateLedgerView(
      [staleCandidate],
      ledger,
      ledgerPath,
      sourcePath,
      'exclude-imported',
    ).map((item) => item.ledgerState),
    ['stale'],
  );
});


test('lineage evidence is exposed without inheriting review state', () => {
  const view = candidateLedgerView(
    [duplicateOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
    'all',
  );

  assert.equal(view[0].ledgerState, 'duplicate');
  assert.equal(view[0].lineageCandidates.length, 1);
  assert.equal(view[0].lineageCandidates[0].place, 'B2:D8');
  assert.deepEqual(view[0].lineageCandidates[0].reasons, ['same-content']);
});


test('research scores stay evidence-only and never change ledger filtering', () => {
  const scored: Candidate = {
    ...newOccurrence,
    execution: 'provider-dependent',
    claims: newOccurrence.claims.map((claim) => ({
      ...claim,
      execution: 'provider-dependent',
    })),
    provenance: {
      algorithm: 'research.similarity-probe',
      run: {
        execution: 'provider-dependent',
        inputDigest: newOccurrence.locator.sourceDigest,
        provider: 'research.flyhash-v0',
        model: 'fixture',
        artifactVersion: '1',
        parameters: {},
      },
    },
    scores: [
      { provider: 'research.flyhash-v0', scale: 'cosine', value: 0.9999 },
      { provider: 'research.alt-v0', scale: 'rank', value: 1 },
    ],
  };

  const all = candidateLedgerView(
    [scored],
    ledger,
    ledgerPath,
    sourcePath,
    'all',
  );
  assert.equal(all[0].ledgerState, 'unimported');
  assert.deepEqual(all[0].researchScores, scored.scores);

  // Even an extremely high research score is not exact content/occurrence
  // evidence and cannot remove the candidate from the unimported view.
  const unimported = candidateLedgerView(
    [scored],
    ledger,
    ledgerPath,
    sourcePath,
    'unimported',
  );
  assert.equal(unimported.length, 1);
  assert.equal(unimported[0].ledgerState, 'unimported');
  assert.deepEqual(unimported[0].researchScores, scored.scores);
});


test('pairwise similarity sidecar is display evidence only and cannot change unimported state', () => {
  const evidencePath = path.resolve('/workspace/research-similarity.json');
  const document: CandidateSimilarityEvidenceDocument = {
    schema: CANDIDATE_SIMILARITY_EVIDENCE_SCHEMA,
    entries: [{
      source: 'data/design.xlsx',
      kind: 'image',
      sheet: 'Sheet3',
      place: 'E2:F6',
      provider: { id: 'research.embedding-v0', version: '1' },
      metric: {
        namespace: 'research.embedding-v0',
        name: 'cosine',
        semantics: 'pairwise visual-semantic similarity only; not identity',
        value: 0.99999,
        range: { min: -1, max: 1 },
        higherIsStronger: true,
      },
      target: {
        source: 'data/design.xlsx',
        kind: 'image',
        sheet: 'Sheet1',
        place: 'B2:D8',
        fingerprint: imported.fingerprint,
      },
      evidence: [{ code: 'research-only' }],
    }],
  };

  const view = candidateLedgerView(
    [newOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
    'unimported',
    { document, evidencePath },
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].ledgerState, 'unimported');
  assert.equal(view[0].similarityEvidence.length, 1);
  assert.equal(view[0].similarityEvidence[0].metric.value, 0.99999);
  assert.equal(view[0].similarityEvidence[0].target.place, 'B2:D8');
});
