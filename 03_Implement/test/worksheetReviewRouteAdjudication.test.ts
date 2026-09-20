import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  getAdjudicatedWorksheetReviewRouteLabels,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
  applyWorksheetReviewRouteAdjudicationResponse,
  assertWorksheetReviewRouteAdjudicationResponse,
  createWorksheetReviewRouteAdjudicationPacket,
} from '../src/experimental/worksheetReviewRouteAdjudication.js';

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
        id: 'eligible-conflict',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'ambiguous',
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
            rationaleCodes: ['AMBIGUOUS_FORMAT', 'CHECK'],
            annotationReference: 'annotation:a',
          },
          {
            annotatorRef: 'annotator-b',
            route: 'routine',
            rationaleCodes: ['KNOWN_PATTERN'],
            annotationReference: 'annotation:b',
          },
        ],
      },
      {
        id: 'one-annotation',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'pending',
          reference: 'evidence:b',
          facts: ['Fact C'],
        },
        annotations: [{
          annotatorRef: 'annotator-a',
          route: 'routine',
          rationaleCodes: ['KNOWN_PATTERN'],
          annotationReference: 'annotation:c',
        }],
      },
      {
        id: 'already-adjudicated',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'done',
          reference: 'evidence:c',
          facts: ['Fact D'],
        },
        annotations: [
          {
            annotatorRef: 'annotator-a',
            route: 'inspect',
            rationaleCodes: ['NOVEL_FORMAT'],
            annotationReference: 'annotation:d1',
          },
          {
            annotatorRef: 'annotator-b',
            route: 'inspect',
            rationaleCodes: ['NOVEL_FORMAT'],
            annotationReference: 'annotation:d2',
          },
        ],
        adjudication: {
          adjudicatorRef: 'adjudicator-old',
          route: 'inspect',
          rationaleCodes: ['NOVEL_FORMAT'],
          adjudicationReference: 'adjudication:old',
        },
      },
    ],
  };
}

test('packet contains only eligible cases and anonymizes annotator identity', () => {
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(corpus());

  assert.deepEqual(
    packet.cases.map((entry) => entry.id),
    ['eligible-conflict'],
  );
  assert.deepEqual(
    packet.cases[0]?.annotations.map(
      (annotation) => annotation.annotationId,
    ),
    ['annotation-1', 'annotation-2'],
  );

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes('projectionState'), false);
  assert.equal(serialized.includes('annotator-a'), false);
  assert.equal(serialized.includes('annotator-b'), false);
  assert.equal(serialized.includes('annotation:a'), false);
  assert.equal(serialized.includes('already-adjudicated'), false);
  assert.equal(serialized.includes('provider'), false);

  assert.equal(packet.routes.inspect.applyAuthority, 'none');
  assert.equal(packet.routes.routine.applyAuthority, 'none');
});

test('digest is stable across case/fact/annotation/rationale order and changes with annotation content', () => {
  const first = corpus();
  const second = structuredClone(first);

  second.cases = [
    second.cases[1]!,
    second.cases[0]!,
    second.cases[2]!,
  ];
  const eligible = second.cases[1]!;
  eligible.evidence.facts = [
    ...eligible.evidence.facts,
  ].reverse();
  eligible.annotations = [
    eligible.annotations[1]!,
    {
      ...eligible.annotations[0]!,
      rationaleCodes: [
        ...eligible.annotations[0]!.rationaleCodes,
      ].reverse(),
    },
  ];

  assert.equal(
    createWorksheetReviewRouteAdjudicationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteAdjudicationPacket(second)
      .packetDigest,
  );

  const changed = structuredClone(first);
  changed.cases[0]!.annotations[0]!.route = 'routine';

  assert.notEqual(
    createWorksheetReviewRouteAdjudicationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteAdjudicationPacket(changed)
      .packetDigest,
  );
});

test('applies adjudication immutably and exposes it as final label', () => {
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
        decisions: [{
          caseId: 'eligible-conflict',
          route: 'inspect',
          rationaleCodes: ['AMBIGUOUS_FORMAT'],
        }],
      },
    );

  assert.deepEqual(source, before);
  assert.equal(
    updated.cases[0]!.adjudication?.route,
    'inspect',
  );
  assert.match(
    updated.cases[0]!.adjudication?.adjudicationReference ?? '',
    new RegExp(
      `^adjudication:${packet.packetDigest}:eligible-conflict:adjudicator-new$`,
      'u',
    ),
  );
  assert.deepEqual(
    getAdjudicatedWorksheetReviewRouteLabels(updated),
    [
      {
        id: 'eligible-conflict',
        expectedRoute: 'inspect',
      },
      {
        id: 'already-adjudicated',
        expectedRoute: 'inspect',
      },
    ],
  );
});

test('rejects stale responses after evidence or annotation changes', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(source);

  for (const changed of [
    (() => {
      const value = structuredClone(source);
      value.cases[0]!.evidence.facts = ['Changed'];
      return value;
    })(),
    (() => {
      const value = structuredClone(source);
      value.cases[0]!.annotations[0]!.route = 'routine';
      return value;
    })(),
  ]) {
    assert.throws(
      () => applyWorksheetReviewRouteAdjudicationResponse(
        changed,
        {
          schemaVersion:
            WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
          protocolVersion:
            WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
          packetDigest: packet.packetDigest,
          adjudicatorRef: 'adjudicator-new',
          decisions: [{
            caseId: 'eligible-conflict',
            route: 'inspect',
            rationaleCodes: ['REVIEW'],
          }],
        },
      ),
      /stale/,
    );
  }
});

test('rejects an adjudicator who also annotated the case', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(source);

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
          caseId: 'eligible-conflict',
          route: 'inspect',
          rationaleCodes: ['REVIEW'],
        }],
      },
    ),
    /must be independent/,
  );
});

test('rejects ineligible/unknown cases and duplicate response decisions', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationPacket(source);

  for (const caseId of [
    'one-annotation',
    'already-adjudicated',
    'missing',
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

  const valid = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    adjudicatorRef: 'adjudicator-new',
    decisions: [{
      caseId: 'eligible-conflict',
      route: 'inspect' as const,
      rationaleCodes: ['REVIEW'],
    }],
  };

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

  assert.throws(
    () => assertWorksheetReviewRouteAdjudicationResponse({
      ...valid,
      providerChoice: 'inspect',
    }),
    /Unknown worksheet review-route adjudication response field/,
  );
});
