import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  assertWorksheetReviewRouteLabelCorpus,
  getAdjudicatedWorksheetReviewRouteLabels,
  getAdjudicatedWorksheetReviewRouteProjectionCases,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';

function corpus(): WorksheetReviewRouteLabelCorpusV1 {
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
    cases: [{
      id: 'case-a',
      evidence: {
        sourceClass: 'replay',
        caseFamily: 'fixture',
        reference: 'fixture:a',
        facts: ['Independent MMI review fact.'],
      },
      projectionState: {
        classification: 'ambiguous',
        candidateCount: 2,
        hasWinner: false,
        noveltyScore: 0.2,
      },
      annotations: [
        {
          annotatorRef: 'annotator-a',
          route: 'inspect',
          rationaleCodes: ['AMBIGUOUS_FORMAT'],
          annotationReference: 'annotation:a',
        },
        {
          annotatorRef: 'annotator-b',
          route: 'inspect',
          rationaleCodes: ['AMBIGUOUS_FORMAT'],
          annotationReference: 'annotation:b',
        },
      ],
      adjudication: {
        adjudicatorRef: 'adjudicator-a',
        route: 'inspect',
        rationaleCodes: ['AMBIGUOUS_FORMAT'],
        adjudicationReference: 'adjudication:a',
      },
    }],
  };
}

test('accepts a blinded adjudicated corpus and extracts only final labels', () => {
  const value = corpus();

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteLabelCorpus(value),
  );
  assert.deepEqual(
    getAdjudicatedWorksheetReviewRouteLabels(value),
    [{
      id: 'case-a',
      expectedRoute: 'inspect',
    }],
  );
  assert.deepEqual(
    getAdjudicatedWorksheetReviewRouteProjectionCases(value),
    [{
      id: 'case-a',
      state: {
        classification: 'ambiguous',
        candidateCount: 2,
        hasWinner: false,
        noveltyScore: 0.2,
      },
      expectedRoute: 'inspect',
    }],
  );
});

test('rejects provider/model/result leakage through unknown fields', () => {
  for (const field of [
    'providerChoice',
    'providerConfidence',
    'model',
    'probability',
  ]) {
    const value = structuredClone(corpus()) as unknown as Record<string, unknown>;
    value[field] = 'leak';

    assert.throws(
      () => assertWorksheetReviewRouteLabelCorpus(value),
      /Unknown worksheet review-route corpus field/,
    );
  }
});

test('requires all blinding guarantees to remain true', () => {
  const value = structuredClone(corpus());
  value.blinding.confidenceHidden = false as never;

  assert.throws(
    () => assertWorksheetReviewRouteLabelCorpus(value),
    /confidenceHidden=true/,
  );
});

test('rejects duplicate cases and duplicate annotator refs', () => {
  const duplicateCase = structuredClone(corpus());
  duplicateCase.cases = [
    ...duplicateCase.cases,
    structuredClone(duplicateCase.cases[0]!),
  ];

  assert.throws(
    () => assertWorksheetReviewRouteLabelCorpus(
      duplicateCase,
    ),
    /Duplicate worksheet review-route label case id/,
  );

  const duplicateAnnotator = structuredClone(corpus());
  const entry = duplicateAnnotator.cases[0]!;
  entry.annotations = [
    ...entry.annotations,
    structuredClone(entry.annotations[0]!),
  ];

  assert.throws(
    () => assertWorksheetReviewRouteLabelCorpus(
      duplicateAnnotator,
    ),
    /Duplicate worksheet review-route annotator ref/,
  );
});

test('requires two independent annotations and an independent adjudicator', () => {
  const tooFew = structuredClone(corpus());
  tooFew.cases[0]!.annotations = [
    tooFew.cases[0]!.annotations[0]!,
  ];

  assert.throws(
    () => assertWorksheetReviewRouteLabelCorpus(tooFew),
    /at least two independent annotations/,
  );

  const samePerson = structuredClone(corpus());
  samePerson.cases[0]!.adjudication!.adjudicatorRef =
    'annotator-a';

  assert.throws(
    () => assertWorksheetReviewRouteLabelCorpus(samePerson),
    /adjudicator must be independent/,
  );
});

test('requires projection state before extracting projection evaluation cases', () => {
  const value = structuredClone(corpus());
  delete value.cases[0]!.projectionState;

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteLabelCorpus(value),
  );
  assert.throws(
    () =>
      getAdjudicatedWorksheetReviewRouteProjectionCases(
        value,
      ),
    /missing projection state/,
  );
});

test('validates the unlabeled seed corpus and confirms that it contains no final route labels', () => {
  const fixturePath = fileURLToPath(new URL(
    './fixtures/worksheet-review-route-label-corpus.seed.json',
    import.meta.url,
  ));
  const parsed: unknown = JSON.parse(
    fs.readFileSync(fixturePath, 'utf8'),
  );

  assertWorksheetReviewRouteLabelCorpus(parsed);

  assert.equal(parsed.cases.length, 12);
  assert.equal(
    new Set(
      parsed.cases.map(
        (entry) => entry.evidence.caseFamily,
      ),
    ).size >= 8,
    true,
  );
  assert.equal(
    parsed.cases.every(
      (entry) =>
        entry.annotations.length === 0
        && entry.adjudication === undefined,
    ),
    true,
  );
  assert.deepEqual(
    getAdjudicatedWorksheetReviewRouteLabels(parsed),
    [],
  );
});

test('does not mutate corpus inputs during validation or extraction', () => {
  const value = corpus();
  const before = structuredClone(value);

  assertWorksheetReviewRouteLabelCorpus(value);
  getAdjudicatedWorksheetReviewRouteLabels(value);
  getAdjudicatedWorksheetReviewRouteProjectionCases(value);

  assert.deepEqual(value, before);
});
