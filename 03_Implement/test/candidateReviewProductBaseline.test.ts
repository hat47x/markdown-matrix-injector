import test from 'node:test';
import assert from 'node:assert/strict';

import type { CandidateReviewObservation } from '../src/application/candidateReviewObservation.js';
import {
  aggregateCandidateReviewProductRun,
  compareCandidateReviewProductBaseline,
  evaluateCandidateReviewProductRuns,
  type CandidateReviewProductRun,
  type ProductBaselineSafetyEvidence,
} from '../src/evaluation/candidateReviewProductBaseline.js';

const digest = 'sha256:' + 'a'.repeat(64);

function observation(input: {
  durationMs?: number;
  selectedCount?: number;
  reviewStateChanged?: number;
  accepted?: number;
  modified?: number;
  rejected?: number;
  deferred?: number;
  newlyImported?: number;
  interrupted?: boolean;
  tableModifiedItems?: number;
  tableChangedCharacters?: number;
  imageModifiedItems?: number;
  imageChangedCharacters?: number;
} = {}): CandidateReviewObservation {
  const tableModifiedItems = input.tableModifiedItems ?? 0;
  const imageModifiedItems = input.imageModifiedItems ?? 0;
  const selectedCount = input.selectedCount ?? 10;
  const reviewStateChanged = input.reviewStateChanged ?? selectedCount;
  const accepted = input.accepted ?? Math.min(3, reviewStateChanged);
  let remaining = reviewStateChanged - accepted;
  const modified = input.modified ?? Math.min(1, Math.max(remaining, 0));
  remaining -= modified;
  const deferred = input.deferred ?? Math.min(2, Math.max(remaining, 0));
  remaining -= deferred;
  const rejected = input.rejected ?? Math.max(remaining, 0);
  const newlyImported =
    input.newlyImported ?? Math.min(accepted + modified, selectedCount);
  return {
    schema: 'mmi.candidate-review-observation/v2',
    source: {
      label: 'sensitive/customer/design.xlsx',
      digest,
    },
    startedAtUtc: '2026-10-07T00:00:00.000Z',
    endedAtUtc: '2026-10-07T00:01:00.000Z',
    durationMs: input.durationMs ?? 60_000,
    editingInterruptionProxy: input.interrupted ? 1 : 0,
    ui: {
      ledgerFilter: 'all',
      facets: {
        kinds: [],
        statuses: [],
        executions: [],
      },
      selectedCount,
    },
    initial: {
      total: selectedCount,
      ledgerStates: {
        imported: 0,
        changed: 0,
        stale: 0,
        duplicate: 0,
        unimported: selectedCount,
      },
      reviewStates: {
        unreviewed: input.selectedCount ?? 10,
        accepted: 0,
        modified: 0,
        rejected: 0,
        deferred: 0,
      },
    },
    final: {
      total: selectedCount,
      ledgerStates: {
        imported: newlyImported,
        changed: 0,
        stale: 0,
        duplicate: 0,
        unimported:
          selectedCount - newlyImported,
      },
      reviewStates: {
        unreviewed: Math.max(selectedCount - reviewStateChanged, 0),
        accepted,
        modified,
        rejected,
        deferred,
      },
    },
    transitions: {
      reviewStateChanged,
      toAccepted: accepted,
      toModified: modified,
      toRejected: rejected,
      toDeferred: deferred,
      toUnreviewed: 0,
      newlyImported,
    },
    adjustments: {
      table: {
        modifiedItems: tableModifiedItems,
        originalCharacters: tableModifiedItems * 100,
        reviewedCharacters: tableModifiedItems * 100,
        changedSpanCharacters: input.tableChangedCharacters ?? 0,
      },
      imageAlt: {
        modifiedItems: imageModifiedItems,
        originalCharacters: imageModifiedItems * 20,
        reviewedCharacters: imageModifiedItems * 20,
        changedSpanCharacters: input.imageChangedCharacters ?? 0,
      },
    },
  };
}

function safety(
  overrides: Partial<ProductBaselineSafetyEvidence['counts']> = {},
  evidenceRefs: readonly string[] = ['test:product-safety'],
): ProductBaselineSafetyEvidence {
  return {
    counts: {
      sourceMutation: 0,
      failedImportResidue: 0,
      staleAcceptanceInheritance: 0,
      inferredToObservedPromotion: 0,
      workspaceEscape: 0,
      ...overrides,
    },
    evidenceRefs,
  };
}

function run(
  conditionClass: CandidateReviewProductRun['conditionClass'],
  observations: readonly CandidateReviewObservation[],
  overrides: Partial<CandidateReviewProductRun> = {},
): CandidateReviewProductRun {
  return {
    conditionId:
      conditionClass === 'current-product-baseline'
        ? 'deterministic-current'
        : 'learned-ranking-v1',
    conditionClass,
    fixtureCohort: 'sier-practical-v1',
    protocolId: 'mmi-pv-baseline-01',
    observations,
    safety: safety(),
    ...overrides,
  };
}

test('aggregate summarizes existing content-free review observations without source identity', () => {
  const summary = aggregateCandidateReviewProductRun(
    run('current-product-baseline', [
      observation({
        durationMs: 60_000,
        selectedCount: 10,
        reviewStateChanged: 8,
        accepted: 3,
        modified: 1,
        newlyImported: 4,
        interrupted: true,
        tableModifiedItems: 1,
        tableChangedCharacters: 12,
      }),
      observation({
        durationMs: 30_000,
        selectedCount: 5,
        reviewStateChanged: 4,
        accepted: 2,
        modified: 1,
        newlyImported: 3,
        imageModifiedItems: 1,
        imageChangedCharacters: 4,
      }),
    ]),
  );

  assert.equal(summary.sessions, 2);
  assert.equal(summary.work.durationMs, 90_000);
  assert.equal(summary.work.selectedCandidates, 15);
  assert.equal(summary.work.reviewStateTransitions, 12);
  assert.equal(summary.work.newlyImported, 7);
  assert.equal(summary.work.editingInterruptionSessions, 1);
  assert.equal(summary.work.adjustments.total.modifiedItems, 3);
  assert.equal(summary.work.adjustments.total.changedSpanCharacters, 16);
  assert.equal(summary.derived.durationMsPerSelectedCandidate, 6_000);
  assert.equal(summary.safety.passed, true);
  assert.equal(summary.safety.evidenceBacked, true);

  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('sensitive/customer/design.xlsx'), false);
  assert.equal(serialized.includes(digest), false);
});

test('strict comparison promotes only a safer-or-equal condition with real work reduction', () => {
  const baseline = aggregateCandidateReviewProductRun(
    run('current-product-baseline', [
      observation({
        durationMs: 60_000,
        selectedCount: 10,
        reviewStateChanged: 10,
        newlyImported: 4,
        tableModifiedItems: 2,
        tableChangedCharacters: 20,
        interrupted: true,
      }),
    ]),
  );
  const assisted = aggregateCandidateReviewProductRun(
    run('assisted', [
      observation({
        durationMs: 40_000,
        selectedCount: 8,
        reviewStateChanged: 8,
        newlyImported: 4,
        tableModifiedItems: 1,
        tableChangedCharacters: 8,
        interrupted: false,
      }),
    ]),
  );

  const comparison = compareCandidateReviewProductBaseline(
    baseline,
    assisted,
  );

  assert.equal(comparison.promotion.eligible, true);
  assert.equal(comparison.delta.durationMs, -20_000);
  assert.equal(comparison.delta.selectedCandidates, -2);
  assert.equal(comparison.delta.newlyImported, 0);
  assert.deepEqual(
    comparison.promotion.regressedMetrics,
    [],
  );
  assert.ok(comparison.promotion.improvedMetrics.includes('durationMs'));
  assert.ok(
    comparison.promotion.improvedMetrics.includes('changedSpanCharacters'),
  );
});

test('faster assisted condition is not promotable when correction burden regresses', () => {
  const baseline = aggregateCandidateReviewProductRun(
    run('current-product-baseline', [
      observation({
        durationMs: 60_000,
        selectedCount: 10,
        reviewStateChanged: 10,
        newlyImported: 4,
        tableModifiedItems: 1,
        tableChangedCharacters: 4,
      }),
    ]),
  );
  const assisted = aggregateCandidateReviewProductRun(
    run('assisted', [
      observation({
        durationMs: 30_000,
        selectedCount: 10,
        reviewStateChanged: 10,
        newlyImported: 4,
        tableModifiedItems: 2,
        tableChangedCharacters: 24,
      }),
    ]),
  );

  const comparison = compareCandidateReviewProductBaseline(
    baseline,
    assisted,
  );

  assert.equal(comparison.promotion.eligible, false);
  assert.ok(comparison.promotion.improvedMetrics.includes('durationMs'));
  assert.ok(comparison.promotion.regressedMetrics.includes('modifiedItems'));
  assert.ok(
    comparison.promotion.regressedMetrics.includes('changedSpanCharacters'),
  );
});

test('safety violations cannot be compensated by large productivity gains', () => {
  const baseline = aggregateCandidateReviewProductRun(
    run('current-product-baseline', [observation()]),
  );
  const assisted = aggregateCandidateReviewProductRun(
    run(
      'assisted',
      [
        observation({
          durationMs: 1_000,
          selectedCount: 4,
          reviewStateChanged: 4,
          newlyImported: 4,
        }),
      ],
      {
        safety: safety({ sourceMutation: 1 }),
      },
    ),
  );

  const comparison = compareCandidateReviewProductBaseline(
    baseline,
    assisted,
  );

  assert.equal(assisted.safety.passed, false);
  assert.equal(comparison.promotion.eligible, false);
  assert.ok(
    comparison.promotion.reasons.includes(
      'safety violations are non-compensatory',
    ),
  );
});

test('zero safety counts without evidence references are not enough for promotion', () => {
  const baseline = aggregateCandidateReviewProductRun(
    run('current-product-baseline', [observation()]),
  );
  const assisted = aggregateCandidateReviewProductRun(
    run(
      'assisted',
      [
        observation({
          durationMs: 50_000,
          selectedCount: 9,
          reviewStateChanged: 9,
          newlyImported: 4,
        }),
      ],
      { safety: safety({}, []) },
    ),
  );

  const comparison = compareCandidateReviewProductBaseline(
    baseline,
    assisted,
  );

  assert.equal(assisted.safety.passed, true);
  assert.equal(assisted.safety.evidenceBacked, false);
  assert.equal(comparison.promotion.eligible, false);
  assert.ok(
    comparison.promotion.reasons.includes(
      'safety counts need explicit evidence references',
    ),
  );
});

test('aggregate rejects internally inconsistent observation logs', () => {
  const inconsistent = observation();
  inconsistent.transitions.toRejected += 1;

  assert.throws(
    () => aggregateCandidateReviewProductRun(
      run('current-product-baseline', [inconsistent]),
    ),
    /review transition counts are inconsistent/u,
  );

  const invalidProxy = {
    ...observation(),
    editingInterruptionProxy: 2,
  } as unknown as CandidateReviewObservation;
  assert.throws(
    () => aggregateCandidateReviewProductRun(
      run('current-product-baseline', [invalidProxy]),
    ),
    /editingInterruptionProxy/u,
  );
});

test('aggregate fails closed when a safety count is omitted at runtime', () => {
  const incomplete = {
    sourceMutation: 0,
    failedImportResidue: 0,
    staleAcceptanceInheritance: 0,
    inferredToObservedPromotion: 0,
  } as unknown as ProductBaselineSafetyEvidence['counts'];

  assert.throws(
    () => aggregateCandidateReviewProductRun(
      run('current-product-baseline', [observation()], {
        safety: {
          counts: incomplete,
          evidenceRefs: ['test:safety'],
        },
      }),
    ),
    /workspaceEscape/u,
  );
});

test('recommended A/B entry rejects different source bytes and review facets', () => {
  const baselineObservation = observation();
  const assistedDifferentSource = {
    ...observation(),
    source: {
      ...observation().source,
      digest: 'sha256:' + 'b'.repeat(64),
    },
  };
  assert.throws(
    () => evaluateCandidateReviewProductRuns(
      run('current-product-baseline', [baselineObservation]),
      run('assisted', [assistedDifferentSource]),
    ),
    /source digest differs/u,
  );

  const assistedDifferentFacet = observation();
  assistedDifferentFacet.ui.facets.kinds = ['table-range'];
  assert.throws(
    () => evaluateCandidateReviewProductRuns(
      run('current-product-baseline', [baselineObservation]),
      run('assisted', [assistedDifferentFacet]),
    ),
    /review facets differ/u,
  );
});

test('comparison refuses different cohorts, protocols, and unequal session counts', () => {
  const baseline = aggregateCandidateReviewProductRun(
    run('current-product-baseline', [observation()]),
  );

  const differentCohort = aggregateCandidateReviewProductRun(
    run('assisted', [observation()], { fixtureCohort: 'other-fixtures' }),
  );
  assert.throws(
    () => compareCandidateReviewProductBaseline(baseline, differentCohort),
    /fixture cohort mismatch/u,
  );

  const differentProtocol = aggregateCandidateReviewProductRun(
    run('assisted', [observation()], { protocolId: 'other-protocol' }),
  );
  assert.throws(
    () => compareCandidateReviewProductBaseline(baseline, differentProtocol),
    /evaluation protocol mismatch/u,
  );

  const unequalSessions = aggregateCandidateReviewProductRun(
    run('assisted', [observation(), observation()]),
  );
  const comparison = compareCandidateReviewProductBaseline(
    baseline,
    unequalSessions,
  );
  assert.equal(comparison.promotion.eligible, false);
  assert.ok(
    comparison.promotion.reasons.includes(
      'controlled comparison requires the same session count',
    ),
  );
});

test('empty observation set keeps ratios undefined instead of inventing zero cost', () => {
  const summary = aggregateCandidateReviewProductRun(
    run('current-product-baseline', []),
  );

  assert.equal(summary.sessions, 0);
  assert.equal(summary.derived.durationMsPerSelectedCandidate, null);
  assert.equal(
    summary.derived.reviewStateTransitionsPerSelectedCandidate,
    null,
  );
  assert.equal(summary.derived.changedSpanCharactersPerModifiedItem, null);
});
