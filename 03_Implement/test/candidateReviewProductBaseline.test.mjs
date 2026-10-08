import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductBaselineReport,
  parseObservationJsonl,
  PRODUCT_BASELINE_SCHEMA,
} from '../scripts/candidate-review-product-baseline.mjs';

const digest = (ch) =>
  `sha256:${ch.repeat(64)}`;

function observation(overrides = {}) {
  return {
    schema: 'mmi.candidate-review-observation/v2',
    source: {
      label: 'fixture.xlsx',
      digest: digest('a'),
    },
    startedAtUtc: '2026-10-07T12:00:00.000Z',
    endedAtUtc: '2026-10-07T12:00:05.000Z',
    durationMs: 5000,
    editingInterruptionProxy: 1,
    ui: {
      ledgerFilter: 'exclude-imported',
      facets: {
        kinds: [],
        statuses: [],
        executions: [],
      },
      selectedCount: 4,
    },
    initial: {
      total: 4,
      ledgerStates: {},
      reviewStates: {},
    },
    final: {
      total: 4,
      ledgerStates: {},
      reviewStates: {},
    },
    transitions: {
      reviewStateChanged: 3,
      toAccepted: 2,
      toModified: 1,
      toRejected: 0,
      toDeferred: 0,
      toUnreviewed: 0,
      newlyImported: 3,
    },
    adjustments: {
      table: {
        modifiedItems: 1,
        originalCharacters: 100,
        reviewedCharacters: 96,
        changedSpanCharacters: 12,
      },
      imageAlt: {
        modifiedItems: 0,
        originalCharacters: 0,
        reviewedCharacters: 0,
        changedSpanCharacters: 0,
      },
    },
    ...overrides,
  };
}

test(
  'aggregates review work without turning proxies into exact action claims',
  () => {
    const second = observation({
      source: {
        label: 'second.xlsx',
        digest: digest('b'),
      },
      durationMs: 9000,
      editingInterruptionProxy: 0,
      ui: {
        ledgerFilter: 'exclude-imported',
        facets: {
          kinds: [],
          statuses: [],
          executions: [],
        },
        selectedCount: 2,
      },
      transitions: {
        reviewStateChanged: 1,
        toAccepted: 0,
        toModified: 0,
        toRejected: 1,
        toDeferred: 0,
        toUnreviewed: 0,
        newlyImported: 0,
      },
      adjustments: {
        table: {
          modifiedItems: 0,
          originalCharacters: 0,
          reviewedCharacters: 0,
          changedSpanCharacters: 0,
        },
        imageAlt: {
          modifiedItems: 1,
          originalCharacters: 20,
          reviewedCharacters: 18,
          changedSpanCharacters: 4,
        },
      },
    });

    const report = buildProductBaselineReport({
      condition: 'current-product-baseline',
      observations: [observation(), second],
    });

    assert.equal(
      report.schema,
      PRODUCT_BASELINE_SCHEMA,
    );
    assert.equal(
      report.cohort.distinctSourceDigests,
      2,
    );
    assert.deepEqual(
      report.cohort.sourceDigests,
      [digest('a'), digest('b')],
    );
    assert.equal(
      report.work.durationMs.p50,
      5000,
    );
    assert.equal(
      report.work.durationMs.p95,
      5000,
    );
    assert.equal(
      report.work.durationMs.mean,
      7000,
    );
    assert.equal(
      report.work.selectedCandidateCount.total,
      6,
    );
    assert.match(
      report.work.selectedCandidateCount.interpretation,
      /not an exact count/u,
    );
    assert.equal(
      report.work.reviewStateChangeCount.total,
      4,
    );
    assert.equal(
      report.work.editingInterruptionProxySessions,
      1,
    );
    assert.equal(
      report.work.adjustments.table
        .changedSpanCharacters,
      12,
    );
    assert.equal(
      report.work.adjustments.imageAlt
        .changedSpanCharacters,
      4,
    );
    assert.equal(
      report.outcomes.toRejected,
      1,
    );
    assert.equal(
      report.authority.sourceMutation,
      'not-measured-by-review-observation',
    );
    assert.ok(
      report.measurementGaps.some(
        (gap) =>
          gap.includes('exact UI action count'),
      ),
    );
  },
);

test(
  'parses blank lines but rejects unsupported schemas',
  () => {
    const lines =
      `${JSON.stringify(observation())}\n\n`
      + `${JSON.stringify(observation({ durationMs: 1 }))}\n`;

    assert.equal(
      parseObservationJsonl(
        lines,
        'fixture.jsonl',
      ).length,
      2,
    );

    const invalid = JSON.stringify({
      ...observation(),
      schema: 'other/v1',
    });

    assert.throws(
      () =>
        parseObservationJsonl(
          invalid,
          'bad.jsonl',
        ),
      /unsupported observation schema/u,
    );
  },
);

test(
  'rejects empty cohorts and malformed numeric metrics',
  () => {
    assert.throws(
      () =>
        buildProductBaselineReport({
          condition: 'baseline',
          observations: [],
        }),
      /at least one observation/u,
    );

    assert.throws(
      () =>
        buildProductBaselineReport({
          condition: 'baseline',
          observations: [
            observation({ durationMs: -1 }),
          ],
        }),
      /durationMs must be a non-negative integer/u,
    );
  },
);
