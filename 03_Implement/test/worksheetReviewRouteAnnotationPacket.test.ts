import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
  applyWorksheetReviewRouteAnnotationResponse,
  assertWorksheetReviewRouteAnnotationResponse,
  createWorksheetReviewRouteAnnotationPacket,
} from '../src/experimental/worksheetReviewRouteAnnotationPacket.js';

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
        id: 'pending-a',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'family-a',
          reference: 'evidence:a',
          facts: ['Fact A', 'Fact B'],
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
        id: 'second-annotation',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'family-b',
          reference: 'evidence:b',
          facts: ['Fact C'],
        },
        projectionState: {
          classification: 'matched',
          candidateCount: 1,
          hasWinner: true,
          noveltyScore: 0.1,
        },
        annotations: [{
          annotatorRef: 'annotator-existing',
          route: 'routine',
          rationaleCodes: ['KNOWN_STABLE'],
          annotationReference: 'annotation:existing',
        }],
      },
      {
        id: 'already-adjudicated',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'family-c',
          reference: 'evidence:c',
          facts: ['Fact D'],
        },
        projectionState: {
          classification: 'novel',
          candidateCount: 1,
          hasWinner: false,
          noveltyScore: 0.5,
        },
        annotations: [{
          annotatorRef: 'annotator-existing',
          route: 'inspect',
          rationaleCodes: ['NOVEL_FORMAT'],
          annotationReference: 'annotation:c',
        }],
        adjudication: {
          adjudicatorRef: 'adjudicator',
          route: 'inspect',
          rationaleCodes: ['NOVEL_FORMAT'],
          adjudicationReference: 'adjudication:c',
        },
      },
    ],
  };
}

test('packet exposes evidence and route semantics but strips projection and prior labels', () => {
  const packet =
    createWorksheetReviewRouteAnnotationPacket(corpus());

  assert.match(
    packet.packetDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.deepEqual(
    packet.cases.map((entry) => entry.id),
    ['pending-a', 'second-annotation'],
  );

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes('projectionState'), false);
  assert.equal(serialized.includes('annotator-existing'), false);
  assert.equal(serialized.includes('already-adjudicated'), false);
  assert.equal(serialized.includes('providerChoice'), false);
  assert.equal(serialized.includes('confidence'), false);

  assert.equal(
    packet.routes.inspect.humanReviewRequired,
    true,
  );
  assert.equal(packet.routes.inspect.applyAuthority, 'none');
  assert.equal(
    packet.routes.routine.humanReviewRequired,
    true,
  );
  assert.equal(packet.routes.routine.applyAuthority, 'none');
  assert.match(
    packet.routes.routine.description,
    /does not mean accept/,
  );
});

test('packet digest is stable across case/fact ordering but changes with evidence content', () => {
  const first = corpus();
  const second = structuredClone(first);

  second.cases = [
    second.cases[1]!,
    second.cases[0]!,
    second.cases[2]!,
  ];
  second.cases[1]!.evidence.facts = [
    ...second.cases[1]!.evidence.facts,
  ].reverse();

  assert.equal(
    createWorksheetReviewRouteAnnotationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteAnnotationPacket(second)
      .packetDigest,
  );

  const changed = structuredClone(first);
  changed.cases[0]!.evidence.facts = [
    'Fact A changed',
    'Fact B',
  ];

  assert.notEqual(
    createWorksheetReviewRouteAnnotationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteAnnotationPacket(changed)
      .packetDigest,
  );
});

test('applies a bound response without mutating the source corpus', () => {
  const source = corpus();
  const before = structuredClone(source);
  const packet =
    createWorksheetReviewRouteAnnotationPacket(source);

  const updated =
    applyWorksheetReviewRouteAnnotationResponse(
      source,
      {
        schemaVersion:
          WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
        protocolVersion:
          WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
        packetDigest: packet.packetDigest,
        annotatorRef: 'annotator-new',
        decisions: [{
          caseId: 'pending-a',
          route: 'inspect',
          rationaleCodes: ['AMBIGUOUS_FORMAT'],
        }],
      },
    );

  assert.deepEqual(source, before);
  assert.equal(
    updated.cases[0]!.annotations.length,
    1,
  );
  assert.equal(
    updated.cases[0]!.annotations[0]!.annotatorRef,
    'annotator-new',
  );
  assert.equal(
    updated.cases[0]!.annotations[0]!.route,
    'inspect',
  );
  assert.match(
    updated.cases[0]!.annotations[0]!.annotationReference,
    new RegExp(
      `^annotation:${packet.packetDigest}:pending-a:annotator-new$`,
      'u',
    ),
  );
});

test('rejects stale response after evidence changes', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAnnotationPacket(source);
  const changed = structuredClone(source);
  changed.cases[0]!.evidence.facts = ['Changed fact'];

  assert.throws(
    () => applyWorksheetReviewRouteAnnotationResponse(
      changed,
      {
        schemaVersion:
          WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
        protocolVersion:
          WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
        packetDigest: packet.packetDigest,
        annotatorRef: 'annotator-new',
        decisions: [{
          caseId: 'pending-a',
          route: 'inspect',
          rationaleCodes: ['AMBIGUOUS_FORMAT'],
        }],
      },
    ),
    /stale/,
  );
});

test('rejects adjudicated/unknown cases and same-annotator relabeling', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAnnotationPacket(source);

  for (const caseId of [
    'already-adjudicated',
    'missing-case',
  ]) {
    assert.throws(
      () => applyWorksheetReviewRouteAnnotationResponse(
        source,
        {
          schemaVersion:
            WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
          protocolVersion:
            WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
          packetDigest: packet.packetDigest,
          annotatorRef: 'annotator-new',
          decisions: [{
            caseId,
            route: 'inspect',
            rationaleCodes: ['REVIEW'],
          }],
        },
      ),
      /unknown or already adjudicated/,
    );
  }

  assert.throws(
    () => applyWorksheetReviewRouteAnnotationResponse(
      source,
      {
        schemaVersion:
          WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
        protocolVersion:
          WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
        packetDigest: packet.packetDigest,
        annotatorRef: 'annotator-existing',
        decisions: [{
          caseId: 'second-annotation',
          route: 'routine',
          rationaleCodes: ['KNOWN_STABLE'],
        }],
      },
    ),
    /already labeled case/,
  );
});

test('response validation rejects unknown fields and duplicate case decisions', () => {
  const packet =
    createWorksheetReviewRouteAnnotationPacket(corpus());

  const valid = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    annotatorRef: 'annotator-new',
    decisions: [{
      caseId: 'pending-a',
      route: 'inspect' as const,
      rationaleCodes: ['AMBIGUOUS_FORMAT'],
    }],
  };

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteAnnotationResponse(
      valid,
    ),
  );

  assert.throws(
    () => assertWorksheetReviewRouteAnnotationResponse({
      ...valid,
      providerConfidence: 0.99,
    }),
    /Unknown worksheet review-route annotation response field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteAnnotationResponse({
      ...valid,
      decisions: [
        valid.decisions[0],
        structuredClone(valid.decisions[0]),
      ],
    }),
    /Duplicate worksheet review-route annotation decision case id/,
  );
});
