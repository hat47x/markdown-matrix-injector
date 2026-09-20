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
  WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_RESPONSE_SCHEMA_VERSION,
  applyWorksheetReviewRouteAdjudicationWorkResponse,
  assertWorksheetReviewRouteAdjudicationWorkResponse,
  createWorksheetReviewRouteAdjudicationWorkPacket,
} from '../src/experimental/worksheetReviewRouteAdjudicationWorkPacket.js';

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
        id: 'case-a',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'family-a',
          reference: 'evidence:a',
          facts: ['Fact A'],
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
        id: 'case-b',
        evidence: {
          sourceClass: 'external-xlsx',
          caseFamily: 'family-b',
          reference: 'evidence:b',
          facts: ['Fact B'],
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
        id: 'one-label',
        evidence: {
          sourceClass: 'synthetic',
          caseFamily: 'family-c',
          reference: 'evidence:c',
          facts: ['Fact C'],
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
        id: 'done',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'family-d',
          reference: 'evidence:d',
          facts: ['Fact D'],
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
          adjudicatorRef: 'adjudicator-old',
          route: 'inspect',
          rationaleCodes: ['CONFIRMED'],
          adjudicationReference: 'adjudication:d',
        },
      },
    ],
  };
}

function response(
  packetDigest: string,
  adjudicatorRef: string,
  decisions: Array<{
    caseId: string;
    route: 'inspect' | 'routine';
    rationaleCodes: string[];
  }>,
) {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest,
    adjudicatorRef,
    decisions,
  };
}

test('work packet excludes cases previously annotated by the current adjudicator before presentation', () => {
  const fresh =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      corpus(),
      'adjudicator-new',
    );
  assert.deepEqual(
    fresh.cases.map((entry) => entry.id),
    ['case-a', 'case-b'],
  );

  const priorAnnotator =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      corpus(),
      'annotator-a',
    );
  assert.deepEqual(
    priorAnnotator.cases.map((entry) => entry.id),
    ['case-b'],
  );

  assert.equal(
    fresh.minimumAnnotationsPerCase,
    WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  );

  const serialized = JSON.stringify(priorAnnotator);
  assert.equal(serialized.includes('annotator-a'), false);
  assert.equal(serialized.includes('annotator-b'), false);
  assert.equal(serialized.includes('annotation:a:1'), false);
  assert.equal(serialized.includes('projectionState'), false);
  assert.equal(serialized.includes('provider'), false);
  assert.equal(serialized.includes('confidence'), false);
  assert.equal(serialized.includes('one-label'), false);
  assert.equal(serialized.includes('"done"'), false);
});

test('annotator identity is a filter only: equal eligibility produces the same blinded packet digest', () => {
  const first =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      corpus(),
      'adjudicator-new-1',
    );
  const second =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      corpus(),
      'adjudicator-new-2',
    );

  assert.equal(first.packetDigest, second.packetDigest);
  assert.deepEqual(first.cases, second.cases);
});

test('partial adjudication applies immutably and resume returns only remaining work', () => {
  const source = corpus();
  const before = structuredClone(source);
  const firstPacket =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      source,
      'adjudicator-new',
    );

  const updated =
    applyWorksheetReviewRouteAdjudicationWorkResponse(
      source,
      response(
        firstPacket.packetDigest,
        'adjudicator-new',
        [{
          caseId: 'case-a',
          route: 'inspect',
          rationaleCodes: ['RESOLVED_A'],
        }],
      ),
    );

  assert.deepEqual(source, before);
  assert.deepEqual(
    getAdjudicatedWorksheetReviewRouteLabels(updated),
    [
      { id: 'case-a', expectedRoute: 'inspect' },
      { id: 'done', expectedRoute: 'inspect' },
    ],
  );

  const resumed =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      updated,
      'adjudicator-new',
    );
  assert.deepEqual(
    resumed.cases.map((entry) => entry.id),
    ['case-b'],
  );
  assert.notEqual(
    resumed.packetDigest,
    firstPacket.packetDigest,
  );
});

test('self-review is rejected at allocation and cannot be smuggled into a valid work response', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      source,
      'annotator-a',
    );

  assert.deepEqual(
    packet.cases.map((entry) => entry.id),
    ['case-b'],
  );

  assert.throws(
    () => applyWorksheetReviewRouteAdjudicationWorkResponse(
      source,
      response(
        packet.packetDigest,
        'annotator-a',
        [{
          caseId: 'case-a',
          route: 'inspect',
          rationaleCodes: ['SELF_REVIEW'],
        }],
      ),
    ),
    /previously annotated by this adjudicator/,
  );
});

test('stale work response is rejected after another adjudicator changes the eligible set', () => {
  const source = corpus();
  const firstPacket =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      source,
      'adjudicator-one',
    );

  const otherPacket =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      source,
      'adjudicator-two',
    );
  const changed =
    applyWorksheetReviewRouteAdjudicationWorkResponse(
      source,
      response(
        otherPacket.packetDigest,
        'adjudicator-two',
        [{
          caseId: 'case-b',
          route: 'routine',
          rationaleCodes: ['RESOLVED_B'],
        }],
      ),
    );

  assert.throws(
    () => applyWorksheetReviewRouteAdjudicationWorkResponse(
      changed,
      response(
        firstPacket.packetDigest,
        'adjudicator-one',
        [{
          caseId: 'case-a',
          route: 'inspect',
          rationaleCodes: ['RESOLVED_A'],
        }],
      ),
    ),
    /stale/,
  );
});

test('changes in self-ineligible cases do not invalidate unrelated visible work', () => {
  const source = corpus();
  const packet =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      source,
      'annotator-a',
    );

  const changed = structuredClone(source);
  changed.cases[0]!.evidence.facts = [
    'Changed but still hidden from annotator-a',
  ];

  const regenerated =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      changed,
      'annotator-a',
    );

  assert.equal(
    packet.packetDigest,
    regenerated.packetDigest,
  );

  const updated =
    applyWorksheetReviewRouteAdjudicationWorkResponse(
      changed,
      response(
        packet.packetDigest,
        'annotator-a',
        [{
          caseId: 'case-b',
          route: 'routine',
          rationaleCodes: ['RESOLVED_B'],
        }],
      ),
    );

  assert.equal(
    updated.cases.find((entry) => entry.id === 'case-b')
      ?.adjudication?.route,
    'routine',
  );
});

test('response validation rejects unknown fields and duplicate decisions using canonical decision validation', () => {
  const packet =
    createWorksheetReviewRouteAdjudicationWorkPacket(
      corpus(),
      'adjudicator-new',
    );
  const valid = response(
    packet.packetDigest,
    'adjudicator-new',
    [{
      caseId: 'case-a',
      route: 'inspect',
      rationaleCodes: ['RESOLVED_A'],
    }],
  );

  assert.doesNotThrow(
    () => assertWorksheetReviewRouteAdjudicationWorkResponse(
      valid,
    ),
  );

  assert.throws(
    () => assertWorksheetReviewRouteAdjudicationWorkResponse({
      ...valid,
      providerConfidence: 0.99,
    }),
    /Unknown worksheet review-route adjudication work response field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteAdjudicationWorkResponse({
      ...valid,
      decisions: [
        valid.decisions[0],
        structuredClone(valid.decisions[0]),
      ],
    }),
    /Duplicate worksheet review-route adjudication decision case id/,
  );
});
