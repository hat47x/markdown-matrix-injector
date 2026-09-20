import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
  applyWorksheetReviewRouteAnnotationResponse,
  createWorksheetReviewRouteAnnotationPacketForAnnotator,
} from '../src/experimental/worksheetReviewRouteAnnotationPacket.js';
import {
  createWorksheetReviewRouteAdjudicationPacket,
} from '../src/experimental/worksheetReviewRouteAdjudicationPacket.js';

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
        id: 'case-zero',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'zero-annotation',
          reference: 'evidence:zero',
          facts: ['Needs independent annotation.'],
        },
        annotations: [],
      },
      {
        id: 'case-one',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'one-annotation',
          reference: 'evidence:one',
          facts: ['Needs one more independent annotation.'],
        },
        annotations: [{
          annotatorRef: 'annotator-a',
          route: 'routine',
          rationaleCodes: ['KNOWN_STABLE'],
          annotationReference: 'annotation:one:a',
        }],
      },
    ],
  };
}

function apply(
  source: WorksheetReviewRouteLabelCorpusV1,
  annotatorRef: string,
  decisions: Array<{
    caseId: string;
    route: 'inspect' | 'routine';
    rationaleCodes: string[];
  }>,
): WorksheetReviewRouteLabelCorpusV1 {
  const packet =
    createWorksheetReviewRouteAnnotationPacketForAnnotator(
      source,
      annotatorRef,
    );

  return applyWorksheetReviewRouteAnnotationResponse(
    source,
    {
      schemaVersion:
        WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
      protocolVersion:
        WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
      packetDigest: packet.packetDigest,
      annotatorRef,
      decisions,
    },
  );
}

test('two independent annotation passes hand cases off to adjudication without third-label oversampling', () => {
  const source = corpus();

  const packetA =
    createWorksheetReviewRouteAnnotationPacketForAnnotator(
      source,
      'annotator-a',
    );
  assert.deepEqual(
    packetA.cases.map((entry) => entry.id),
    ['case-zero'],
  );

  const serializedA = JSON.stringify(packetA);
  assert.equal(serializedA.includes('annotator-a'), false);
  assert.equal(serializedA.includes('KNOWN_STABLE'), false);

  const afterA = apply(
    source,
    'annotator-a',
    [{
      caseId: 'case-zero',
      route: 'inspect',
      rationaleCodes: ['REVIEW_REQUIRED'],
    }],
  );

  const packetB =
    createWorksheetReviewRouteAnnotationPacketForAnnotator(
      afterA,
      'annotator-b',
    );
  assert.deepEqual(
    packetB.cases.map((entry) => entry.id),
    ['case-zero', 'case-one'],
  );

  const afterB = apply(
    afterA,
    'annotator-b',
    [
      {
        caseId: 'case-zero',
        route: 'inspect',
        rationaleCodes: ['REVIEW_REQUIRED'],
      },
      {
        caseId: 'case-one',
        route: 'routine',
        rationaleCodes: ['KNOWN_STABLE'],
      },
    ],
  );

  for (const entry of afterB.cases) {
    assert.equal(
      entry.annotations.length,
      WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
    );
  }

  const packetC =
    createWorksheetReviewRouteAnnotationPacketForAnnotator(
      afterB,
      'annotator-c',
    );
  assert.deepEqual(packetC.cases, []);

  const adjudication =
    createWorksheetReviewRouteAdjudicationPacket(afterB);
  assert.deepEqual(
    adjudication.cases.map((entry) => entry.id),
    ['case-one', 'case-zero'],
  );

  const serializedAdjudication = JSON.stringify(adjudication);
  assert.equal(serializedAdjudication.includes('annotator-a'), false);
  assert.equal(serializedAdjudication.includes('annotator-b'), false);
});

test('source corpus remains unchanged across resume-safe packet creation and apply', () => {
  const source = corpus();
  const before = structuredClone(source);

  const packet =
    createWorksheetReviewRouteAnnotationPacketForAnnotator(
      source,
      'annotator-b',
    );

  assert.deepEqual(source, before);

  const updated = applyWorksheetReviewRouteAnnotationResponse(
    source,
    {
      schemaVersion:
        WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
      protocolVersion:
        WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
      packetDigest: packet.packetDigest,
      annotatorRef: 'annotator-b',
      decisions: [{
        caseId: 'case-one',
        route: 'routine',
        rationaleCodes: ['KNOWN_STABLE'],
      }],
    },
  );

  assert.deepEqual(source, before);
  assert.notDeepEqual(updated, source);
});
