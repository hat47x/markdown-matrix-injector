import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  getAdjudicatedWorksheetReviewRouteLabels,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION,
  applyWorksheetReviewRouteAdjudicationResponse,
  assertWorksheetReviewRouteAdjudicationResponse,
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
        id: 'conflict-a',
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
        annotations: [
          {
            annotatorRef: 'annotator-a',
            route: 'inspect',
            rationaleCodes: ['AMBIGUOUS_FORMAT'],
            annotationReference: 'annotation:a:1',
          },
          {
            annotatorRef: 'annotator-b',
            route: 'routine',
            rationaleCodes: ['KNOWN_STABLE'],
            annotationReference: 'annotation:a:2',
          },
        ],
      },
      {
        id: 'unanimous-b',
        evidence: {
          sourceClass: 'external-xlsx',
          caseFamily: 'family-b',
          reference: 'evidence:b',
          facts: ['Fact C'],
        },
        projectionState: {
          classification: 'matched',
          candidateCount: 1,
          hasWinner: true,
          noveltyScore: 0.05,
        },
        annotations: [
          {
            annotatorRef: 'annotator-c',
            route: 'routine',
            rationaleCodes: ['KNOWN_STABLE'],
            annotationReference: 'annotation:b:1',
          },
          {
            annotatorRef: 'annotator-d',
            route: 'routine',
            rationaleCodes: ['LOW_DEVIATION'],
            annotationReference: 'annotation:b:2',
          },
        ],
      },
      {
        id: 'one-label-only',
        evidence: {
          sourceClass: 'synthetic',
          caseFamily: 'family-c',
          reference: 'evidence:c',
          facts: ['Fact D'],
        },
        annotations: [
          {
            annotatorRef: 'annotator-e',
            route: 'inspect',
            rationaleCodes: ['NOVEL_FORMAT'],
            annotationReference: 'annotation:c:1',
          },
        ],
      },
      {
        id: 'already-adjudicated',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'family-d',
          reference: 'evidence:d',
          facts: ['Fact E'],
        },
        annotations: [
          {
            annotatorRef: 'annotator-f',
            route: 'inspect',
            rationaleCodes: ['NOVEL_FORMAT'],
            annotationReference: 'annotation:d:1',
          },
          {
            annotatorRef: 'annotator-g',
            route: 'inspect',
            rationaleCodes: ['MULTI_FAMILY_DRIFT'],
            annotationReference: 'annotation:d:2',
          },
        ],
        adjudication: {
          adjudicatorRef: 'adjudicator-existing',
          route: 'inspect',
          rationaleCodes: ['NOVEL_FORMAT'],
          adjudicationReference: 'adjudication:d',
        },
      },
    ],
  };
}

test('packet exposes evidence and anonymized annotations only for eligible pending cases', () => {
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(corpus());

  assert.equal(
    packet.minimumAnnotationsPerCase,
    WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION,
  );
  assert.equal(
    WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION,
    WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  );
  assert.deepEqual(
    packet.cases.map((entry) => entry.id),
    ['conflict-a', 'unanimous-b'],
  );
  assert.match(
    packet.packetDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );

  const conflict = packet.cases[0]!;
  assert.deepEqual(
    conflict.annotations.map((entry) => entry.route),
    ['inspect', 'routine'],
  );

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes('projectionState'), false);
  assert.equal(serialized.includes('annotator-a'), false);
  assert.equal(serialized.includes('annotator-b'), false);
  assert.equal(serialized.includes('annotation:a:1'), false);
  assert.equal(serialized.includes('already-adjudicated'), false);
  assert.equal(serialized.includes('one-label-only'), false);
  assert.equal(serialized.includes('providerChoice'), false);
  assert.equal(serialized.includes('providerConfidence'), false);
  assert.equal(serialized.includes('modelIdentity'), false);

  assert.equal(packet.routes.inspect.humanReviewRequired, true);
  assert.equal(packet.routes.inspect.applyAuthority, 'none');
  assert.equal(packet.routes.inspect.automaticDecision, 'none');
  assert.equal(packet.routes.routine.humanReviewRequired, true);
  assert.equal(packet.routes.routine.applyAuthority, 'none');
  assert.equal(packet.routes.routine.automaticDecision, 'none');
});

test('packet digest is stable across case/fact/annotation ordering', () => {
  const first = corpus();
  const second = structuredClone(first);

  second.cases = [
    second.cases[1]!,
    second.cases[0]!,
    second.cases[3]!,
    second.cases[2]!,
  ];
  second.cases[1]!.evidence.facts = [
    ...second.cases[1]!.evidence.facts,
  ].reverse();
  second.cases[1]!.annotations = [
    ...second.cases[1]!.annotations,
  ].reverse();
  second.cases[1]!.annotations[0]!.rationaleCodes = [
    ...second.cases[1]!.annotations[0]!.rationaleCodes,
  ].reverse();

  assert.equal(
    createWorksheetReviewRouteAdjudicationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteAdjudicationPacket(second)
      .packetDigest,
  );
});

test('packet digest changes when evidence or annotation content changes', () => {
  const source = corpus();
  const baseline =
    createWorksheetReviewRouteAdjudicationPacket(source)
      .packetDigest;

  const evidenceChanged = structuredClone(source);
  evidenceChanged.cases[0]!.evidence.facts = [
    'Fact A changed',
    'Fact B',
  ];
  assert.notEqual(
    baseline,
    createWorksheetReviewRouteAdjudicationPacket(
      evidenceChanged,
    ).packetDigest,
  );

  const annotationChanged = structuredClone(source);
  annotationChanged.cases[0]!.annotations[1]!.route =
    'inspect';
  assert.notEqual(
    baseline,
    createWorksheetReviewRouteAdjudicationPacket(
      annotationChanged,
    ).packetDigest,
  );
});

test('applies final adjudication immutably and exposes it through label extraction', () => {
  const source = corpus();
  const before = structuredClone(source);
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(source);

  const updated =
    applyWorksheetReviewRouteAdjudicationResponse(
      source,
      {
        schemaVersion:
          WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
        protocolVersion:
          WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
        packetDigest: packet.packetDigest,
        adjudicatorRef: 'adjudicator-new',
        decisions: [
          {
            caseId: 'conflict-a',
            route: 'inspect',
            rationaleCodes: [
              'DISAGREEMENT_RESOLVED_TO_INSPECT',
            ],
          },
          {
            caseId: 'unanimous-b',
            route: 'routine',
            rationaleCodes: [
              'CONSENSUS_ROUTINE_CONFIRMED',
            ],
          },
        ],
      },
    );

  assert.deepEqual(source, before);

  assert.deepEqual(
    getAdjudicatedWorksheetReviewRouteLabels(updated),
    [
      { id: 'conflict-a', expectedRoute: 'inspect' },
      { id: 'unanimous-b', expectedRoute: 'routine' },
      { id: 'already-adjudicated', expectedRoute: 'inspect' },
    ],
  );

  const adjudication =
    updated.cases[0]!.adjudication;
  assert.equal(adjudication?.adjudicatorRef, 'adjudicator-new');
  assert.equal(adjudication?.route, 'inspect');
  assert.match(
    adjudication?.adjudicationReference ?? '',
    new RegExp(
      `^adjudication:${packet.packetDigest}:conflict-a:adjudicator-new$`,
      'u',
    ),
  );
});

test('rejects stale response after evidence or annotation changes', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(source);
  const response = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    adjudicatorRef: 'adjudicator-new',
    decisions: [{
      caseId: 'conflict-a',
      route: 'inspect' as const,
      rationaleCodes: ['RESOLVED'],
    }],
  };

  const evidenceChanged = structuredClone(source);
  evidenceChanged.cases[0]!.evidence.facts = ['Changed'];
  assert.throws(
    () => applyWorksheetReviewRouteAdjudicationResponse(
      evidenceChanged,
      response,
    ),
    /stale/,
  );

  const annotationChanged = structuredClone(source);
  annotationChanged.cases[0]!.annotations[1]!.route =
    'inspect';
  assert.throws(
    () => applyWorksheetReviewRouteAdjudicationResponse(
      annotationChanged,
      response,
    ),
    /stale/,
  );
});

test('rejects ineligible/already adjudicated cases and adjudicator self-review', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(source);

  for (const caseId of [
    'one-label-only',
    'already-adjudicated',
    'missing-case',
  ]) {
    assert.throws(
      () => applyWorksheetReviewRouteAdjudicationResponse(
        source,
        {
          schemaVersion:
            WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
          protocolVersion:
            WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
          packetDigest: packet.packetDigest,
          adjudicatorRef: 'adjudicator-new',
          decisions: [{
            caseId,
            route: 'inspect',
            rationaleCodes: ['REVIEW'],
          }],
        },
      ),
      /unknown, ineligible, or already adjudicated/,
    );
  }

  assert.throws(
    () => applyWorksheetReviewRouteAdjudicationResponse(
      source,
      {
        schemaVersion:
          WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
        protocolVersion:
          WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
        packetDigest: packet.packetDigest,
        adjudicatorRef: 'annotator-a',
        decisions: [{
          caseId: 'conflict-a',
          route: 'inspect',
          rationaleCodes: ['SELF_REVIEW_NOT_ALLOWED'],
        }],
      },
    ),
    /previously annotated case/,
  );
});

test('response validation rejects unknown fields and duplicate decisions', () => {
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(corpus());
  const valid = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    adjudicatorRef: 'adjudicator-new',
    decisions: [{
      caseId: 'conflict-a',
      route: 'inspect' as const,
      rationaleCodes: ['RESOLVED'],
    }],
  };

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteAdjudicationResponse(
      valid,
    ),
  );

  assert.throws(
    () => assertWorksheetReviewRouteAdjudicationResponse({
      ...valid,
      providerConfidence: 0.99,
    }),
    /Unknown worksheet review-route adjudication response field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteAdjudicationResponse({
      ...valid,
      decisions: [
        valid.decisions[0],
        structuredClone(valid.decisions[0]),
      ],
    }),
    /Duplicate worksheet review-route adjudication decision case id/,
  );
});
