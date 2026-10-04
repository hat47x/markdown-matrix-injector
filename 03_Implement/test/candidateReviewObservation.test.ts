import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addCandidateReviewAdjustment,
  appendCandidateReviewObservation,
  candidateReviewObservationSnapshot,
  createCandidateReviewObservation,
  emptyCandidateReviewAdjustmentSummary,
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
    selectedCount: 5,
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

test('observation final summary stays on the initial review cohort', () => {
  const initial = candidateReviewObservationSnapshot(
    [
      viewItem('1', 'unimported', 'unreviewed'),
      viewItem('2', 'duplicate', 'unreviewed'),
    ],
    noFacets,
  );
  const final = candidateReviewObservationSnapshot(
    [
      viewItem('1', 'imported', 'accepted'),
      viewItem('2', 'unimported', 'rejected'),
      // This Candidate was outside the initial review queue and must not
      // change the observation denominator merely because final state is read
      // from the all-Candidate projection.
      viewItem('3', 'imported', 'accepted'),
    ],
    noFacets,
  );

  const observation = createCandidateReviewObservation({
    sourceLabel: 'design.xlsx',
    sourceDigest,
    startedAtUtc: '2026-10-04T01:00:00Z',
    endedAtUtc: '2026-10-04T01:00:10Z',
    interruptedMarkdownEditing: false,
    ledgerFilter: 'unimported',
    facetFilter: noFacets,
    selectedCount: 2,
    initial,
    final,
  });

  assert.equal(observation.initial.total, 2);
  assert.equal(observation.final.total, 2);
  assert.equal(observation.final.reviewStates.accepted, 1);
  assert.equal(observation.final.reviewStates.rejected, 1);
  assert.equal(observation.final.ledgerStates.imported, 1);
  assert.equal(observation.transitions.toAccepted, 1);
  assert.equal(observation.transitions.toRejected, 1);
  assert.equal(observation.transitions.newlyImported, 1);
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
    selectedCount: 1,
    initial: snapshot,
    final: snapshot,
  });

  assert.deepEqual(observation.ui.facets, facets);
  assert.equal(observation.editingInterruptionProxy, 0);
  assert.equal(observation.transitions.reviewStateChanged, 0);
});

test('observation aggregates correction burden without storing reviewed text', () => {
  let adjustments = emptyCandidateReviewAdjustmentSummary();
  adjustments = addCandidateReviewAdjustment(
    adjustments,
    'table',
    {
      originalCharacters: 120,
      reviewedCharacters: 126,
      changedSpanCharacters: 18,
    },
  );
  adjustments = addCandidateReviewAdjustment(
    adjustments,
    'table',
    {
      originalCharacters: 80,
      reviewedCharacters: 78,
      changedSpanCharacters: 7,
    },
  );
  adjustments = addCandidateReviewAdjustment(
    adjustments,
    'imageAlt',
    {
      originalCharacters: 8,
      reviewedCharacters: 11,
      changedSpanCharacters: 5,
    },
  );
  const snapshot = candidateReviewObservationSnapshot(
    [viewItem('1', 'unimported', 'unreviewed')],
    noFacets,
  );

  const observation = createCandidateReviewObservation({
    sourceLabel: 'design.xlsx',
    sourceDigest,
    startedAtUtc: '2026-10-04T01:00:00Z',
    endedAtUtc: '2026-10-04T01:00:10Z',
    interruptedMarkdownEditing: false,
    ledgerFilter: 'unimported',
    facetFilter: noFacets,
    selectedCount: 1,
    initial: snapshot,
    final: snapshot,
    adjustments,
  });

  assert.equal(observation.schema, 'mmi.candidate-review-observation/v2');
  assert.deepEqual(observation.adjustments, {
    table: {
      modifiedItems: 2,
      originalCharacters: 200,
      reviewedCharacters: 204,
      changedSpanCharacters: 25,
    },
    imageAlt: {
      modifiedItems: 1,
      originalCharacters: 8,
      reviewedCharacters: 11,
      changedSpanCharacters: 5,
    },
  });
  const serialized = JSON.stringify(observation);
  assert.equal(serialized.includes('reviewed text'), false);
  assert.equal(serialized.includes('Candidate key'), false);
});

test('observation defaults correction burden to zero for legacy call sites', () => {
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
    selectedCount: 0,
    initial: snapshot,
    final: snapshot,
  });

  assert.deepEqual(
    observation.adjustments,
    emptyCandidateReviewAdjustmentSummary(),
  );
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
    selectedCount: 1,
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
    selectedCount: 0,
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
      selectedCount: -1,
    }),
    /selectedCount/u,
  );
  assert.throws(
    () => createCandidateReviewObservation({
      ...base,
      adjustments: {
        ...emptyCandidateReviewAdjustmentSummary(),
        table: {
          modifiedItems: 1,
          originalCharacters: 5,
          reviewedCharacters: 5,
          changedSpanCharacters: -1,
        },
      },
    }),
    /adjustment totals/u,
  );
});
