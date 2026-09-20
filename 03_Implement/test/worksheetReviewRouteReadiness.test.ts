import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  assertWorksheetReviewRouteReadinessPolicy,
  evaluateWorksheetReviewRouteReadiness,
  summarizeWorksheetReviewRouteCorpus,
} from '../src/experimental/worksheetReviewRouteReadiness.js';

function readyCorpus(): WorksheetReviewRouteLabelCorpusV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    purpose: 'independent-ground-truth',
    blinding: {
      providerOutputHidden: true,
      providerIdentityHidden: true,
      modelIdentityHidden: true,
      probabilityHidden: true,
      confidenceHidden: true,
    },
    cases: [
      adjudicated(
        'inspect-a',
        'family-a',
        'inspect',
        true,
      ),
      adjudicated(
        'routine-b',
        'family-b',
        'routine',
        true,
      ),
      adjudicated(
        'inspect-c',
        'family-c',
        'inspect',
        true,
      ),
      adjudicated(
        'routine-d',
        'family-a',
        'routine',
        true,
      ),
    ],
  };
}

function adjudicated(
  id: string,
  caseFamily: string,
  route: 'inspect' | 'routine',
  withProjection: boolean,
): WorksheetReviewRouteLabelCorpusV1['cases'][number] {
  return {
    id,
    evidence: {
      sourceClass: 'replay',
      caseFamily,
      reference: `evidence:${id}`,
      facts: [`Fact ${id}`],
    },
    ...(withProjection
      ? {
          projectionState: {
            classification:
              route === 'inspect' ? 'ambiguous' : 'matched',
            candidateCount:
              route === 'inspect' ? 2 : 1,
            hasWinner: route === 'routine',
            noveltyScore:
              route === 'inspect' ? 0.2 : 0.05,
          },
        }
      : {}),
    annotations: [
      {
        annotatorRef: `${id}:a`,
        route,
        rationaleCodes: ['R1'],
        annotationReference: `annotation:${id}:a`,
      },
      {
        annotatorRef: `${id}:b`,
        route,
        rationaleCodes: ['R2'],
        annotationReference: `annotation:${id}:b`,
      },
    ],
    adjudication: {
      adjudicatorRef: `${id}:adj`,
      route,
      rationaleCodes: ['FINAL'],
      adjudicationReference: `adjudication:${id}`,
    },
  };
}

const policy = {
  minimumAdjudicatedCases: 4,
  minimumAdjudicatedCaseFamilies: 3,
  requireBothExpectedRoutes: true,
  requireProjectionForAllAdjudicated: true,
  requireAllCasesAdjudicated: true,
} as const;

test('summarizes labeling lifecycle and projection coverage separately', () => {
  const corpus = readyCorpus();
  corpus.cases = [
    ...corpus.cases,
    {
      id: 'zero',
      evidence: {
        sourceClass: 'synthetic',
        caseFamily: 'family-zero',
        reference: 'zero',
        facts: ['Zero'],
      },
      annotations: [],
    },
    {
      id: 'one',
      evidence: {
        sourceClass: 'synthetic',
        caseFamily: 'family-one',
        reference: 'one',
        facts: ['One'],
      },
      annotations: [{
        annotatorRef: 'one:a',
        route: 'routine',
        rationaleCodes: ['R'],
        annotationReference: 'annotation:one',
      }],
    },
    {
      id: 'two',
      evidence: {
        sourceClass: 'synthetic',
        caseFamily: 'family-two',
        reference: 'two',
        facts: ['Two'],
      },
      annotations: [
        {
          annotatorRef: 'two:a',
          route: 'inspect',
          rationaleCodes: ['R1'],
          annotationReference: 'annotation:two:a',
        },
        {
          annotatorRef: 'two:b',
          route: 'routine',
          rationaleCodes: ['R2'],
          annotationReference: 'annotation:two:b',
        },
      ],
    },
  ];

  const summary =
    summarizeWorksheetReviewRouteCorpus(corpus);

  assert.equal(summary.cases, 7);
  assert.equal(summary.zeroAnnotationCases, 1);
  assert.equal(summary.oneAnnotationCases, 1);
  assert.equal(
    summary.multiAnnotationPendingAdjudicationCases,
    1,
  );
  assert.equal(summary.adjudicatedCases, 4);
  assert.equal(summary.adjudicatedCaseFamilies, 3);
  assert.equal(summary.annotations, 11);
  assert.equal(summary.projectionStateCases, 4);
  assert.equal(summary.adjudicatedProjectionStateCases, 4);
  assert.equal(summary.expectedInspectCases, 2);
  assert.equal(summary.expectedRoutineCases, 2);
  assert.equal(summary.adjudicationCoverage, 0.571429);
  assert.equal(summary.projectionCoverage, 0.571429);
  assert.equal(summary.adjudicatedProjectionCoverage, 1);
});

test('reports ready only when an explicit policy is satisfied', () => {
  const result =
    evaluateWorksheetReviewRouteReadiness(
      readyCorpus(),
      policy,
    );

  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.policy, policy);
});

test('reports independent blockers instead of collapsing readiness into one score', () => {
  const corpus = readyCorpus();
  corpus.cases = [
    corpus.cases[0]!,
    {
      ...corpus.cases[1]!,
      projectionState: undefined,
      adjudication: {
        ...corpus.cases[1]!.adjudication!,
        route: 'inspect',
      },
    },
    {
      id: 'pending',
      evidence: {
        sourceClass: 'synthetic',
        caseFamily: 'pending',
        reference: 'pending',
        facts: ['Pending'],
      },
      annotations: [],
    },
  ];

  const result =
    evaluateWorksheetReviewRouteReadiness(
      corpus,
      policy,
    );

  assert.equal(result.ready, false);
  assert.deepEqual(
    result.blockers.map((entry) => entry.code),
    [
      'ADJUDICATED_CASES_BELOW_MINIMUM',
      'ADJUDICATED_CASE_FAMILIES_BELOW_MINIMUM',
      'EXPECTED_ROUTE_CLASS_MISSING',
      'ADJUDICATED_PROJECTION_STATE_MISSING',
      'UNADJUDICATED_CASES_PRESENT',
    ],
  );
});

test('validates policy strictly and has no hidden defaults', () => {
  assert.doesNotThrow(
    () => assertWorksheetReviewRouteReadinessPolicy(policy),
  );

  for (const value of [
    {
      ...policy,
      minimumAdjudicatedCases: 0,
    },
    {
      ...policy,
      minimumAdjudicatedCaseFamilies: 1.5,
    },
    {
      ...policy,
      requireBothExpectedRoutes: 'yes',
    },
    {
      ...policy,
      unknown: true,
    },
  ]) {
    assert.throws(
      () => assertWorksheetReviewRouteReadinessPolicy(
        value,
      ),
    );
  }
});

test('seed corpus is explicitly not ready without inventing labels', () => {
  const fixturePath = fileURLToPath(new URL(
    './fixtures/worksheet-review-route-label-corpus.seed.json',
    import.meta.url,
  ));
  const seed: WorksheetReviewRouteLabelCorpusV1 =
    JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const result =
    evaluateWorksheetReviewRouteReadiness(
      seed,
      {
        minimumAdjudicatedCases: 4,
        minimumAdjudicatedCaseFamilies: 4,
        requireBothExpectedRoutes: true,
        requireProjectionForAllAdjudicated: true,
        requireAllCasesAdjudicated: false,
      },
    );

  assert.equal(result.summary.cases, 12);
  assert.equal(result.summary.adjudicatedCases, 0);
  assert.equal(result.summary.annotations, 0);
  assert.equal(result.ready, false);
  assert.deepEqual(
    result.blockers.map((entry) => entry.code),
    [
      'ADJUDICATED_CASES_BELOW_MINIMUM',
      'ADJUDICATED_CASE_FAMILIES_BELOW_MINIMUM',
      'EXPECTED_ROUTE_CLASS_MISSING',
    ],
  );
});

test('empty corpus uses zero coverage rather than NaN', () => {
  const empty = {
    ...readyCorpus(),
    cases: [],
  };

  const summary =
    summarizeWorksheetReviewRouteCorpus(empty);

  assert.equal(summary.cases, 0);
  assert.equal(summary.adjudicationCoverage, 0);
  assert.equal(summary.projectionCoverage, 0);
  assert.equal(summary.adjudicatedProjectionCoverage, 0);
});

test('does not mutate corpus or policy inputs', () => {
  const corpus = readyCorpus();
  const mutablePolicy = { ...policy };
  const beforeCorpus = structuredClone(corpus);
  const beforePolicy = structuredClone(mutablePolicy);

  evaluateWorksheetReviewRouteReadiness(
    corpus,
    mutablePolicy,
  );

  assert.deepEqual(corpus, beforeCorpus);
  assert.deepEqual(mutablePolicy, beforePolicy);
});
