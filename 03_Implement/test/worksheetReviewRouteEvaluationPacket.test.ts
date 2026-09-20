import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CognitiveObservation,
  CognitiveProviderDescriptor,
} from '../src/experimental/cognitiveContract.js';
import {
  adaptClosedChoiceResponse,
  type ClosedChoiceJudgmentOutcome,
  type ClosedChoiceQuestion,
} from '../src/experimental/closedChoiceJudgment.js';
import {
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  type WorksheetReviewRouteChoice,
} from '../src/experimental/jevWorksheetReviewRouteProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from '../src/experimental/worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION,
  assertWorksheetReviewRouteEvaluationResponse,
  createWorksheetReviewRouteEvaluationPacket,
  evaluateWorksheetReviewRouteEvaluationResponse,
} from '../src/experimental/worksheetReviewRouteEvaluationPacket.js';

const provider: CognitiveProviderDescriptor = {
  id: 'mmi.route-eval.packet.stub',
  version: '1',
  category: 'judgment',
  executionBoundary: 'local',
  capabilities: ['closed-choice'],
};

const otherProvider: CognitiveProviderDescriptor = {
  ...provider,
  id: 'mmi.route-eval.packet.other',
};

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
        id: 'inspect-case',
        evidence: {
          sourceClass: 'replay',
          caseFamily: 'ambiguous',
          reference: 'evidence:inspect',
          facts: ['Requires careful review'],
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
            annotationReference: 'annotation:inspect:a',
          },
          {
            annotatorRef: 'annotator-b',
            route: 'inspect',
            rationaleCodes: ['MULTI_CANDIDATE'],
            annotationReference: 'annotation:inspect:b',
          },
        ],
        adjudication: {
          adjudicatorRef: 'adjudicator-a',
          route: 'inspect',
          rationaleCodes: ['ELEVATED_ATTENTION'],
          adjudicationReference: 'adjudication:inspect',
        },
      },
      {
        id: 'routine-case',
        evidence: {
          sourceClass: 'external-xlsx',
          caseFamily: 'stable-match',
          reference: 'evidence:routine',
          facts: ['Known stable structure'],
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
            annotationReference: 'annotation:routine:c',
          },
          {
            annotatorRef: 'annotator-d',
            route: 'routine',
            rationaleCodes: ['LOW_NOVELTY'],
            annotationReference: 'annotation:routine:d',
          },
        ],
        adjudication: {
          adjudicatorRef: 'adjudicator-b',
          route: 'routine',
          rationaleCodes: ['STANDARD_ATTENTION'],
          adjudicationReference: 'adjudication:routine',
        },
      },
      {
        id: 'pending-case',
        evidence: {
          sourceClass: 'synthetic',
          caseFamily: 'pending',
          reference: 'evidence:pending',
          facts: ['Not adjudicated'],
        },
        projectionState: {
          classification: 'novel',
          candidateCount: 1,
          hasWinner: false,
          noveltyScore: 0.6,
        },
        annotations: [],
      },
    ],
  };
}

function observation(id: string): CognitiveObservation {
  return {
    id,
    kind: 'worksheet-format-review-route',
    schemaVersion: 'worksheet-format-review-route-v1',
    payload: { fixture: true },
    provenance: {
      sourceKind: 'evaluation-fixture',
      sourceDigest: `sha256:${id}`,
    },
  };
}

function decision(
  id: string,
  choice: WorksheetReviewRouteChoice,
  probability: number,
  confidence: number,
  descriptor = provider,
  question:
    ClosedChoiceQuestion<WorksheetReviewRouteChoice> =
      WORKSHEET_REVIEW_ROUTE_QUESTION,
): ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice> {
  return adaptClosedChoiceResponse(
    observation(id),
    descriptor,
    question,
    {
      status: 'decision',
      choice,
      probability,
      confidence,
      distribution: choice === 'inspect'
        ? {
            inspect: probability,
            routine: 1 - probability,
          }
        : {
            inspect: 1 - probability,
            routine: probability,
          },
    },
  );
}

function response(
  source: WorksheetReviewRouteLabelCorpusV1 = corpus(),
) {
  const packet =
    createWorksheetReviewRouteEvaluationPacket(source);

  const digestById = new Map(
    packet.cases.map(
      (entry) => [entry.id, entry.caseDigest] as const,
    ),
  );

  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest: packet.packetDigest,
    outcomes: [
      {
        caseId: 'inspect-case',
        caseDigest: digestById.get('inspect-case')!,
        outcome: decision(
          'inspect-case',
          'inspect',
          0.9,
          0.8,
        ),
      },
      {
        caseId: 'routine-case',
        caseDigest: digestById.get('routine-case')!,
        outcome: decision(
          'routine-case',
          'inspect',
          0.6,
          0.7,
        ),
      },
    ],
  } as const;
}

test('rejects packet creation when no adjudicated projection cases exist', () => {
  const source = corpus();
  source.cases = source.cases.map((entry) => ({
    ...entry,
    adjudication: undefined,
  }));

  assert.throws(
    () => createWorksheetReviewRouteEvaluationPacket(source),
    /requires at least one adjudicated case/,
  );
});

test('provider packet exposes canonical question and projection state but no ground truth or label evidence', () => {
  const packet =
    createWorksheetReviewRouteEvaluationPacket(corpus());

  assert.deepEqual(
    packet.cases.map((entry) => entry.id),
    ['inspect-case', 'routine-case'],
  );
  assert.deepEqual(
    packet.question.choices,
    ['inspect', 'routine'],
  );
  assert.equal(
    packet.question.id,
    WORKSHEET_REVIEW_ROUTE_QUESTION.id,
  );
  assert.match(
    packet.packetDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );

  const serialized = JSON.stringify(packet);
  for (const forbidden of [
    'expectedRoute',
    '"evidence"',
    '"annotations"',
    '"adjudication"',
    'annotatorRef',
    'adjudicatorRef',
    'annotationReference',
    'adjudicationReference',
    'providerConfidence',
    'probability',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `packet leaked ${forbidden}`,
    );
  }
});

test('packet digest is stable across corpus ordering and changes with provider-visible projection state', () => {
  const first = corpus();
  const reordered = structuredClone(first);
  reordered.cases = [
    reordered.cases[2]!,
    reordered.cases[1]!,
    reordered.cases[0]!,
  ];

  assert.equal(
    createWorksheetReviewRouteEvaluationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteEvaluationPacket(reordered)
      .packetDigest,
  );

  const stateChanged = structuredClone(first);
  stateChanged.cases[0]!.projectionState = {
    ...stateChanged.cases[0]!.projectionState!,
    noveltyScore: 0.25,
  };

  assert.notEqual(
    createWorksheetReviewRouteEvaluationPacket(first)
      .packetDigest,
    createWorksheetReviewRouteEvaluationPacket(stateChanged)
      .packetDigest,
  );
});

test('ground-truth correction does not change provider packet but changes report ground-truth digest', () => {
  const first = corpus();
  const firstResponse = response(first);
  const firstPacket =
    createWorksheetReviewRouteEvaluationPacket(first);
  const firstReport =
    evaluateWorksheetReviewRouteEvaluationResponse(
      first,
      firstResponse,
    );

  const corrected = structuredClone(first);
  corrected.cases[1]!.adjudication = {
    ...corrected.cases[1]!.adjudication!,
    route: 'inspect',
    rationaleCodes: ['CORRECTED_FINAL_ROUTE'],
  };

  const correctedPacket =
    createWorksheetReviewRouteEvaluationPacket(corrected);
  assert.equal(
    correctedPacket.packetDigest,
    firstPacket.packetDigest,
  );

  const correctedReport =
    evaluateWorksheetReviewRouteEvaluationResponse(
      corrected,
      firstResponse,
    );

  assert.notEqual(
    correctedReport.groundTruthDigest,
    firstReport.groundTruthDigest,
  );
  assert.equal(
    correctedReport.packetDigest,
    firstReport.packetDigest,
  );
});

test('strictly joins adjudicated labels to complete provider outcomes and reuses issue-0167 metrics', () => {
  const source = corpus();
  const result =
    evaluateWorksheetReviewRouteEvaluationResponse(
      source,
      response(source),
    );

  assert.equal(
    result.protocolVersion,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  );
  assert.deepEqual(
    result.evaluatedCaseIds,
    ['inspect-case', 'routine-case'],
  );
  assert.equal(result.provider.id, provider.id);
  assert.match(
    result.groundTruthDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );

  assert.equal(result.summary.cases, 2);
  assert.equal(result.summary.decisionCoverage, 1);
  assert.equal(result.summary.decisionAccuracy, 0.5);
  assert.equal(result.summary.unsafeRoutineCases, 0);
  assert.equal(result.summary.unnecessaryInspectCases, 1);
  assert.equal(
    result.summary.inspectBinaryBrierScore,
    0.185,
  );

  assert.equal(result.projectionSeparability.cases, 2);
  assert.equal(
    result.projectionSeparability.exactStateGroups,
    2,
  );
  assert.equal(
    result.projectionSeparability.conflictingGroups,
    0,
  );
  assert.equal(
    result.projectionSeparability.exactStateOracleMaxAccuracy,
    1,
  );
});

test('response validation rejects unknown fields and protocol mismatch', () => {
  const valid = response();

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationResponse({
      ...valid,
      providerId: 'not-allowed',
    }),
    /Unknown worksheet review-route evaluation response field/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationResponse({
      ...valid,
      protocolVersion: 'other-protocol',
    }),
    /Unsupported worksheet review-route evaluation protocol version/,
  );
});

test('rejects missing, extra, and duplicate outcome records', () => {
  const source = corpus();
  const valid = response(source);

  assert.throws(
    () => evaluateWorksheetReviewRouteEvaluationResponse(
      source,
      {
        ...valid,
        outcomes: [valid.outcomes[0]],
      },
    ),
    /outcome is missing for packet case/,
  );

  assert.throws(
    () => evaluateWorksheetReviewRouteEvaluationResponse(
      source,
      {
        ...valid,
        outcomes: [
          ...valid.outcomes,
          {
            caseId: 'extra-case',
            caseDigest: `sha256:${'0'.repeat(64)}`,
            outcome: decision(
              'extra-case',
              'inspect',
              0.7,
              0.6,
            ),
          },
        ],
      },
    ),
    /outcome case is not in the current packet/,
  );

  assert.throws(
    () => assertWorksheetReviewRouteEvaluationResponse({
      ...valid,
      outcomes: [
        valid.outcomes[0],
        structuredClone(valid.outcomes[0]),
      ],
    }),
    /Duplicate worksheet review-route evaluation outcome case id/,
  );
});

test('rejects stale responses when provider-visible projection state changes', () => {
  const source = corpus();
  const oldResponse = response(source);
  const changed = structuredClone(source);
  changed.cases[0]!.projectionState = {
    ...changed.cases[0]!.projectionState!,
    candidateCount: 3,
  };

  assert.throws(
    () => evaluateWorksheetReviewRouteEvaluationResponse(
      changed,
      oldResponse,
    ),
    /stale/,
  );
});

test('rejects outcome records bound to the wrong provider-visible case state', () => {
  const source = corpus();
  const valid = response(source);

  assert.throws(
    () => evaluateWorksheetReviewRouteEvaluationResponse(
      source,
      {
        ...valid,
        outcomes: [
          {
            ...valid.outcomes[0],
            caseDigest: valid.outcomes[1]!.caseDigest,
          },
          valid.outcomes[1],
        ],
      },
    ),
    /case digest does not match packet state/,
  );
});

test('rejects mixed provider descriptors and wrong question ids', () => {
  const source = corpus();
  const valid = response(source);

  assert.throws(
    () => evaluateWorksheetReviewRouteEvaluationResponse(
      source,
      {
        ...valid,
        outcomes: [
          valid.outcomes[0],
          {
            caseId: 'routine-case',
            caseDigest: valid.outcomes[1]!.caseDigest,
            outcome: decision(
              'routine-case',
              'routine',
              0.8,
              0.7,
              otherProvider,
            ),
          },
        ],
      },
    ),
    /one provider descriptor/,
  );

  const wrongQuestion: ClosedChoiceQuestion<
    WorksheetReviewRouteChoice
  > = {
    ...WORKSHEET_REVIEW_ROUTE_QUESTION,
    id: 'other-route-question',
  };

  assert.throws(
    () => evaluateWorksheetReviewRouteEvaluationResponse(
      source,
      {
        ...valid,
        outcomes: [
          {
            caseId: 'inspect-case',
            caseDigest: valid.outcomes[0]!.caseDigest,
            outcome: decision(
              'inspect-case',
              'inspect',
              0.9,
              0.8,
              provider,
              wrongQuestion,
            ),
          },
          valid.outcomes[1],
        ],
      },
    ),
    /wrong question/,
  );
});

test('does not mutate corpus or response during packet creation and evaluation', () => {
  const source = corpus();
  const evaluationResponse = response(source);
  const sourceBefore = structuredClone(source);
  const responseBefore = structuredClone(evaluationResponse);

  createWorksheetReviewRouteEvaluationPacket(source);
  evaluateWorksheetReviewRouteEvaluationResponse(
    source,
    evaluationResponse,
  );

  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(evaluationResponse, responseBefore);
});
