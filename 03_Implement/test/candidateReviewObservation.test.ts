import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendCandidateReviewObservation,
  candidateReviewObservationSnapshot,
  createCandidateReviewObservation,
} from '../src/application/candidateReviewObservation.js';
import type { CandidateReviewFacetFilter } from '../src/application/candidateReviewFilter.js';
import type { Candidate } from '../src/core/candidate.js';
import { fingerprintOf } from '../src/core/candidate.js';
import type { CandidateReviewViewItem } from '../src/core/candidateReviewView.js';
import type { LedgerState } from '../src/core/importLedger.js';

const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;

function candidate(
  id: string,
  execution: Candidate['execution'] = 'deterministic',
): Candidate {
  return {
    kind: 'table-range',
    locator: {
      source: 'design.xlsx',
      sourceDigest,
      sheet: 'Sheet1',
      range: `A${id}:B${id}`,
    },
    status: execution === 'deterministic' ? 'inferred' : 'inferred',
    execution,
    method: execution === 'deterministic' ? 'M1' : 'M5',
    claims: [{
      aspect: 'boundary',
      value: `A${id}:B${id}`,
      status: 'inferred',
      execution,
      method: execution === 'deterministic' ? 'M1' : 'M5',
      reasonCode: 'fixture',
    }],
    provenance: execution === 'deterministic'
      ? {
          algorithm: 'fixture',
          run: {
            execution: 'deterministic',
            inputDigest: sourceDigest,
            config: {},
            implementationVersion: '1',
          },
        }
      : {
          algorithm: 'fixture.provider',
          run: {
            execution: 'provider-dependent',
            inputDigest: sourceDigest,
            provider: 'fixture',
            model: 'fixture-model',
            artifactVersion: '1',
            parameters: {},
          },
        },
    fingerprint: fingerprintOf('table-logical-grid-v1', `table-${id}`),
    scores: execution === 'provider-dependent'
      ? [{ provider: 'fixture', scale: 'rank', value: 1 }]
      : [],
  };
}

function viewItem(
  id: string,
  ledgerState: LedgerState,
  reviewState: CandidateReviewViewItem['reviewState'],
  execution: Candidate['execution'] = 'deterministic',
): CandidateReviewViewItem {
  return {
    candidate: candidate(id, execution),
    ledgerState,
    reviewState,
    rejected: reviewState === 'rejected',
    deferred: reviewState === 'deferred',
    lineageCandidates: [],
    researchScores: [],
    similarityEvidence: [],
  };
}

const noFacets: CandidateReviewFacetFilter = {
  kinds: [],
  statuses: [],
  executions: [],
};

test('snapshot applies the same facet semantics as Candidate review UI', () => {
  const snapshot = candidateReviewObservationSnapshot(
    [
      viewItem('1', 'unimported', 'unreviewed', 'deterministic'),
      viewItem('2', 'unimported', 'unreviewed', 'provider-dependent'),
    ],
    {
      kinds: [],
      statuses: [],
      executions: ['provider-dependent'],
    },
  );

  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.items[0].reviewState, 'unreviewed');
  assert.equal(snapshot.items[0].ledgerState, 'unimported');
});

test('observation records review transitions and new imports without Candidate content', () => {
  const initial = candidateReviewObservationSnapshot(
    [
      viewItem('1', 'unimported', 'unreviewed'),
      viewItem('2', 'unimported', 'unreviewed'),
      viewItem('3', 'unimported', 'unreviewed'),
      viewItem('4', 'unimported', 'unreviewed'),
      viewItem('5', 'unimported', 'rejected'),
    ],
    noFacets,
  );
  const final = candidateReviewObservationSnapshot(
    [
      viewItem('1', 'imported', 'accepted'),
      viewItem('2', 'imported', 'modified'),
      viewItem('3', 'unimported', 'rejected'),
      viewItem('4', 'unimported', 'deferred'),
      viewItem('5', 'unimported', 'unreviewed'),
    ],
    noFacets,
  );

  const observation = createCandidateReviewObservation({
    sourceLabel: 'data/design.xlsx',
    sourceDigest,
    startedAtUtc: '2026-10-04T01:00:00.000Z',
    endedAtUtc: '2026-10-04T01:02:30.000Z',
    interruptedMarkdownEditing: true,
    ledgerFilter: 'exclude-imported',
    facetFilter: noFacets,
    presentedCount: 5,
    initial,
    final,
  });

  assert.equal(observation.durationMs, 150_000);
  assert.equal(observation.editingInterruptionProxy, 1);
  assert.deepEqual(observation.transitions, {
    reviewStateChanged: 5,
    toAccepted: 1,
    toModified: 1,
    toRejected: 1,
    toDeferred: 1,
    toUnreviewed: 1,
    newlyImported: 2,
  });
  assert.equal(observation.initial.reviewStates.unreviewed, 4);
  assert.equal(observation.final.reviewStates.accepted, 1);
  assert.equal(observation.final.reviewStates.modified, 1);

  const serialized = JSON.stringify(observation);
  assert.equal(serialized.includes('A1:B1'), false);
  assert.equal(serialized.includes('table-1'), false);
  assert.equal(serialized.includes('/workspace/'), false);
});

test('observation preserves selected facets but does not invent omitted ones', () => {
  const facets: CandidateReviewFacetFilter = {
    kinds: ['table-range'],
    statuses: ['inferred'],
    executions: ['deterministic'],
  };
  const snapshot = candidateReviewObservationSnapshot(
    [viewItem('1', 'unimported', 'unreviewed')],
    facets,
  );

  const observation = createCandidateReviewObservation({
    sourceLabel: 'design.xlsx',
    sourceDigest,
    startedAtUtc: '2026-10-04T01:00:00Z',
    endedAtUtc: '2026-10-04T01:00:01Z',
    interruptedMarkdownEditing: false,
    ledgerFilter: 'all',
    facetFilter: facets,
    presentedCount: 1,
    initial: snapshot,
    final: snapshot,
  });

  assert.deepEqual(observation.ui.facets, facets);
  assert.equal(observation.editingInterruptionProxy, 0);
  assert.equal(observation.transitions.reviewStateChanged, 0);
});

test('append writes one JSON object per line and creates the parent directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-observation-'));
  const file = path.join(root, '.mmi', 'candidate-review-observations.jsonl');
  const snapshot = candidateReviewObservationSnapshot(
    [viewItem('1', 'unimported', 'unreviewed')],
    noFacets,
  );
  const observation = createCandidateReviewObservation({
    sourceLabel: 'design.xlsx',
    sourceDigest,
    startedAtUtc: '2026-10-04T01:00:00Z',
    endedAtUtc: '2026-10-04T01:00:01Z',
    interruptedMarkdownEditing: false,
    ledgerFilter: 'all',
    facetFilter: noFacets,
    presentedCount: 1,
    initial: snapshot,
    final: snapshot,
  });

  appendCandidateReviewObservation(file, observation);
  appendCandidateReviewObservation(file, observation);

  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), observation);
  assert.deepEqual(JSON.parse(lines[1]), observation);
});

test('observation rejects invalid timestamps, digests and presented counts', () => {
  const snapshot = candidateReviewObservationSnapshot([], noFacets);
  const base = {
    sourceLabel: 'design.xlsx',
    sourceDigest,
    startedAtUtc: '2026-10-04T01:00:00Z',
    endedAtUtc: '2026-10-04T01:00:01Z',
    interruptedMarkdownEditing: false,
    ledgerFilter: 'all' as const,
    facetFilter: noFacets,
    presentedCount: 0,
    initial: snapshot,
    final: snapshot,
  };

  assert.throws(
    () => createCandidateReviewObservation({
      ...base,
      endedAtUtc: '2026-10-04T00:59:59Z',
    }),
    /ordered timestamps/u,
  );
  assert.throws(
    () => createCandidateReviewObservation({
      ...base,
      sourceDigest: 'sha256:bad',
    }),
    /source digest must be sha256/u,
  );
  assert.throws(
    () => createCandidateReviewObservation({
      ...base,
      presentedCount: -1,
    }),
    /presentedCount/u,
  );
});
