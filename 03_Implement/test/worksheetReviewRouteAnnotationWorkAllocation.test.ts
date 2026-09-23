import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  createWorksheetReviewRouteAdjudicationPacket,
} from '../src/experimental/worksheetReviewRouteAdjudicationPacket.js';
import {
  WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_RESPONSE_SCHEMA_VERSION,
  applyWorksheetReviewRouteAnnotationWorkResponse,
  assertWorksheetReviewRouteAnnotationWorkResponse,
  createWorksheetReviewRouteAnnotationWorkPacket,
} from '../src/experimental/worksheetReviewRouteAnnotationWorkPacket.js';

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
    cases: [
      {
        id: 'zero',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'zero',
          reference: 'evidence:zero',
          facts: ['Needs two independent annotations.'],
        },
        projectionState: {
          classification: 'ambiguous',
          candidateCount: 2,
          hasWinner: false,
          noveltyScore: 0.2,
        },
        annotations: [],
      },
      {
        id: 'one-by-a',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'one-a',
          reference: 'evidence:one-a',
          facts: ['Already labeled by annotator A.'],
        },
        annotations: [{
          annotatorRef: 'annotator-a',
          route: 'routine',
          rationaleCodes: ['KNOWN_STABLE'],
          annotationReference: 'annotation:one-a',
        }],
      },
      {
        id: 'one-by-b',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'one-b',
          reference: 'evidence:one-b',
          facts: ['Already labeled by annotator B.'],
        },
        annotations: [{
          annotatorRef: 'annotator-b',
          route: 'inspect',
          rationaleCodes: ['REVIEW_REQUIRED'],
          annotationReference: 'annotation:one-b',
        }],
      },
      {
        id: 'two',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'two',
          reference: 'evidence:two',
          facts: ['Ready for adjudication.'],
        },
        annotations: [
          {
            annotatorRef: 'annotator-a',
            route: 'inspect',
            rationaleCodes: ['R1'],
            annotationReference: 'annotation:two:a',
          },
          {
            annotatorRef: 'annotator-b',
            route: 'routine',
            rationaleCodes: ['R2'],
            annotationReference: 'annotation:two:b',
          },
        ],
      },
      {
        id: 'done',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'done',
          reference: 'evidence:done',
          facts: ['Already adjudicated.'],
        },
        annotations: [
          {
            annotatorRef: 'annotator-a',
            route: 'inspect',
            rationaleCodes: ['R1'],
            annotationReference: 'annotation:done:a',
          },
          {
            annotatorRef: 'annotator-b',
            route: 'inspect',
            rationaleCodes: ['R2'],
            annotationReference: 'annotation:done:b',
          },
        ],
        adjudication: {
          adjudicatorRef: 'adjudicator-c',
          route: 'inspect',
          rationaleCodes: ['FINAL'],
          adjudicationReference: 'adjudication:done',
        },
      },
    ],
  };
}

function response(
  source: WorksheetReviewRouteLabelCorpusV1,
  annotatorRef: string,
  decisions: Array<{
    caseId: string;
    route: 'inspect' | 'routine';
    rationaleCodes: string[];
  }>,
) {
  const packet =
    createWorksheetReviewRouteAnnotationWorkPacket(
      source,
      annotatorRef,
    );

  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    annotatorRef,
    decisions,
  } as const;
}

test('allocates only remaining blinded work for the current annotator', () => {
  const packetA =
    createWorksheetReviewRouteAnnotationWorkPacket(
      corpus(),
      'annotator-a',
    );

  assert.equal(
    packetA.requiredIndependentAnnotations,
    WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  );
  assert.deepEqual(
    packetA.cases.map((entry) => entry.id),
    ['one-by-b', 'zero'],
  );
  assert.match(
    packetA.packetDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );

  const serialized = JSON.stringify(packetA);
  for (const forbidden of [
    'annotator-a',
    'annotator-b',
    'projectionState',
    'annotations',
    'adjudication',
    'KNOWN_STABLE',
    'REVIEW_REQUIRED',
    'provider',
    'confidence',
    'probability',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `packet leaked ${forbidden}`,
    );
  }
});

test('resume excludes work already completed by the same annotator', () => {
  const source = corpus();
  const first =
    createWorksheetReviewRouteAnnotationWorkPacket(
      source,
      'annotator-c',
    );

  const updated =
    applyWorksheetReviewRouteAnnotationWorkResponse(
      source,
      response(
        source,
        'annotator-c',
        [{
          caseId: 'zero',
          route: 'inspect',
          rationaleCodes: ['REVIEW_REQUIRED'],
        }],
      ),
    );

  const resumed =
    createWorksheetReviewRouteAnnotationWorkPacket(
      updated,
      'annotator-c',
    );

  assert.equal(
    first.cases.some((entry) => entry.id === 'zero'),
    true,
  );
  assert.equal(
    resumed.cases.some((entry) => entry.id === 'zero'),
    false,
  );
});

test('second independent annotation hands the case to adjudication and prevents third-label oversampling', () => {
  const source = corpus();

  const afterA =
    applyWorksheetReviewRouteAnnotationWorkResponse(
      source,
      response(
        source,
        'annotator-a',
        [{
          caseId: 'zero',
          route: 'inspect',
          rationaleCodes: ['REVIEW_REQUIRED'],
        }],
      ),
    );

  const afterB =
    applyWorksheetReviewRouteAnnotationWorkResponse(
      afterA,
      response(
        afterA,
        'annotator-b',
        [{
          caseId: 'zero',
          route: 'routine',
          rationaleCodes: ['KNOWN_PATTERN'],
        }],
      ),
    );

  const zero = afterB.cases.find(
    (entry) => entry.id === 'zero',
  );
  assert.equal(
    zero?.annotations.length,
    WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  );

  const packetC =
    createWorksheetReviewRouteAnnotationWorkPacket(
      afterB,
      'annotator-c',
    );
  assert.equal(
    packetC.cases.some((entry) => entry.id === 'zero'),
    false,
  );

  const adjudication =
    createWorksheetReviewRouteAdjudicationPacket(afterB);
  assert.equal(
    adjudication.cases.some((entry) => entry.id === 'zero'),
    true,
  );
});

test('rejects stale work after another annotation changes the eligible set', () => {
  const source = corpus();
  const stale = response(
    source,
    'annotator-c',
    [{
      caseId: 'one-by-a',
      route: 'routine',
      rationaleCodes: ['KNOWN_STABLE'],
    }],
  );

  const changed =
    applyWorksheetReviewRouteAnnotationWorkResponse(
      source,
      response(
        source,
        'annotator-b',
        [{
          caseId: 'one-by-a',
          route: 'routine',
          rationaleCodes: ['KNOWN_STABLE'],
        }],
      ),
    );

  assert.throws(
    () => applyWorksheetReviewRouteAnnotationWorkResponse(
      changed,
      stale,
    ),
    /stale/,
  );
});

test('strictly validates work responses and rejects ineligible case decisions', () => {
  const source = corpus();
  const valid = response(
    source,
    'annotator-a',
    [{
      caseId: 'zero',
      route: 'inspect',
      rationaleCodes: ['REVIEW_REQUIRED'],
    }],
  );

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteAnnotationWorkResponse(
      valid,
    ),
  );

  assert.throws(
    () => assertWorksheetReviewRouteAnnotationWorkResponse({
      ...valid,
      providerConfidence: 0.99,
    }),
    /Unknown worksheet review-route annotation work response field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteAnnotationWorkResponse({
      ...valid,
      decisions: [
        valid.decisions[0],
        structuredClone(valid.decisions[0]),
      ],
    }),
    /Duplicate worksheet review-route annotation work decision case id/,
  );

  assert.throws(
    () => applyWorksheetReviewRouteAnnotationWorkResponse(
      source,
      {
        ...valid,
        decisions: [{
          caseId: 'one-by-a',
          route: 'routine',
          rationaleCodes: ['KNOWN_STABLE'],
        }],
      },
    ),
    /already labeled by this annotator/,
  );
});

test('packet creation and apply do not mutate source corpus', () => {
  const source = corpus();
  const before = structuredClone(source);

  createWorksheetReviewRouteAnnotationWorkPacket(
    source,
    'annotator-c',
  );
  assert.deepEqual(source, before);

  const updated =
    applyWorksheetReviewRouteAnnotationWorkResponse(
      source,
      response(
        source,
        'annotator-c',
        [{
          caseId: 'zero',
          route: 'inspect',
          rationaleCodes: ['REVIEW_REQUIRED'],
        }],
      ),
    );

  assert.deepEqual(source, before);
  assert.notDeepEqual(updated, source);
});
