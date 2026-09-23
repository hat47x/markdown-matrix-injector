import { createHash } from 'node:crypto';
import {
  assertCognitiveOutcome,
  type CognitiveOutcome,
  type CognitiveProviderDescriptor,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentOutcome,
} from './closedChoiceJudgment.js';
import {
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  type JevWorksheetReviewRouteState,
  type WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  assertWorksheetReviewRouteLabelCorpus,
  getAdjudicatedWorksheetReviewRouteLabels,
  getAdjudicatedWorksheetReviewRouteProjectionCases,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  analyzeWorksheetReviewRouteProjectionSeparability,
  evaluateWorksheetReviewRouteOutcomes,
  type WorksheetReviewRouteEvaluationSummary,
  type WorksheetReviewRouteProjectionSeparability,
} from './worksheetReviewRouteEvaluation.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-response-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_REPORT_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-report-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_REPRESENTATION =
  'worksheet-review-route-evaluation-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_CASE_REPRESENTATION =
  'worksheet-review-route-evaluation-case-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_GROUND_TRUTH_REPRESENTATION =
  'worksheet-review-route-ground-truth-v1' as const;

export interface WorksheetReviewRouteEvaluationQuestionV1 {
  id: string;
  semantics: string;
  choices: readonly WorksheetReviewRouteChoice[];
}

export interface WorksheetReviewRouteEvaluationPacketCaseV1 {
  id: string;
  caseDigest: string;
  state: JevWorksheetReviewRouteState;
}

export interface WorksheetReviewRouteEvaluationPacketV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_REPRESENTATION;
  purpose: 'blinded-provider-evaluation';
  packetDigest: string;
  question: WorksheetReviewRouteEvaluationQuestionV1;
  cases: readonly WorksheetReviewRouteEvaluationPacketCaseV1[];
}

export interface WorksheetReviewRouteEvaluationOutcomeRecordV1 {
  caseId: string;
  caseDigest: string;
  outcome: ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice>;
}

export interface WorksheetReviewRouteEvaluationResponseV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  packetDigest: string;
  outcomes: readonly WorksheetReviewRouteEvaluationOutcomeRecordV1[];
}

export interface WorksheetReviewRouteEvaluationReportV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_REPORT_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  purpose: 'adjudicated-ground-truth-evaluation';
  packetDigest: string;
  groundTruthDigest: string;
  provider: CognitiveProviderDescriptor;
  evaluatedCaseIds: readonly string[];
  summary: WorksheetReviewRouteEvaluationSummary;
  projectionSeparability: WorksheetReviewRouteProjectionSeparability;
}

const PACKET_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'representation',
  'purpose',
  'packetDigest',
  'question',
  'cases',
] as const;

const QUESTION_KEYS = [
  'id',
  'semantics',
  'choices',
] as const;

const PACKET_CASE_KEYS = [
  'id',
  'caseDigest',
  'state',
] as const;

const PACKET_STATE_KEYS = [
  'classification',
  'candidateCount',
  'hasWinner',
  'noveltyScore',
] as const;

const RESPONSE_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'packetDigest',
  'outcomes',
] as const;

const OUTCOME_RECORD_KEYS = [
  'caseId',
  'caseDigest',
  'outcome',
] as const;

export function createWorksheetReviewRouteEvaluationPacket(
  corpus: WorksheetReviewRouteLabelCorpusV1,
): WorksheetReviewRouteEvaluationPacketV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);

  const projectionCases =
    getAdjudicatedWorksheetReviewRouteProjectionCases(corpus);
  if (projectionCases.length === 0) {
    throw new Error(
      'Worksheet review-route evaluation requires at least one adjudicated case with projection state.',
    );
  }

  const question: WorksheetReviewRouteEvaluationQuestionV1 = {
    id: WORKSHEET_REVIEW_ROUTE_QUESTION.id,
    semantics: WORKSHEET_REVIEW_ROUTE_QUESTION.semantics,
    choices: [...WORKSHEET_REVIEW_ROUTE_QUESTION.choices],
  };

  const cases = projectionCases
    .map((entry) => ({
      id: entry.id,
      caseDigest: createCaseDigest(
        question,
        entry.id,
        entry.state,
      ),
      state: { ...entry.state },
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const base = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_REPRESENTATION,
    purpose: 'blinded-provider-evaluation' as const,
    question,
    cases,
  };

  return {
    ...base,
    packetDigest: createPacketDigest(
      base.question,
      base.cases,
    ),
  };
}

export function assertWorksheetReviewRouteEvaluationPacket(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationPacketV1 {
  const packet = requireRecord(
    value,
    'worksheet review-route evaluation packet',
  );
  assertExactKeys(
    packet,
    PACKET_KEYS,
    'evaluation packet',
  );

  if (
    packet.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_SCHEMA_VERSION
    || packet.protocolVersion !==
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
    || packet.representation !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_REPRESENTATION
    || packet.purpose !==
      'blinded-provider-evaluation'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation packet identity.',
    );
  }

  assertDigest(packet.packetDigest);

  const question = requireRecord(
    packet.question,
    'worksheet review-route evaluation question',
  );
  assertExactKeys(
    question,
    QUESTION_KEYS,
    'evaluation question',
  );
  if (
    question.id !== WORKSHEET_REVIEW_ROUTE_QUESTION.id
    || question.semantics !==
      WORKSHEET_REVIEW_ROUTE_QUESTION.semantics
    || !Array.isArray(question.choices)
    || question.choices.length !==
      WORKSHEET_REVIEW_ROUTE_QUESTION.choices.length
    || !question.choices.every(
      (choice, index) =>
        choice ===
          WORKSHEET_REVIEW_ROUTE_QUESTION.choices[index],
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation packet must use the canonical question.',
    );
  }

  if (
    !Array.isArray(packet.cases)
    || packet.cases.length === 0
  ) {
    throw new Error(
      'Worksheet review-route evaluation packet must contain at least one case.',
    );
  }

  const typedQuestion =
    question as unknown as
      WorksheetReviewRouteEvaluationQuestionV1;
  const typedCases:
    WorksheetReviewRouteEvaluationPacketCaseV1[] = [];
  const ids: string[] = [];

  for (const value of packet.cases) {
    const entry = requireRecord(
      value,
      'worksheet review-route evaluation packet case',
    );
    assertExactKeys(
      entry,
      PACKET_CASE_KEYS,
      'evaluation packet case',
    );
    assertNonEmpty(
      'evaluation packet case id',
      entry.id,
    );
    assertDigest(entry.caseDigest);

    const state = requireRecord(
      entry.state,
      'worksheet review-route evaluation packet state',
    );
    assertExactKeys(
      state,
      PACKET_STATE_KEYS,
      'evaluation packet state',
    );
    assertEvaluationPacketState(state);

    const typedState =
      state as unknown as JevWorksheetReviewRouteState;
    const expectedCaseDigest = createCaseDigest(
      typedQuestion,
      entry.id,
      typedState,
    );
    if (entry.caseDigest !== expectedCaseDigest) {
      throw new Error(
        `Worksheet review-route evaluation packet case digest does not match state: ${entry.id}.`,
      );
    }

    ids.push(entry.id);
    typedCases.push({
      id: entry.id,
      caseDigest: entry.caseDigest,
      state: { ...typedState },
    });
  }

  const sortedIds = [...ids].sort();
  if (
    ids.some(
      (id, index) => id !== sortedIds[index],
    )
    || new Set(ids).size !== ids.length
  ) {
    throw new Error(
      'Worksheet review-route evaluation packet case ids must be unique and canonically sorted.',
    );
  }

  const expectedPacketDigest = createPacketDigest(
    typedQuestion,
    typedCases,
  );
  if (packet.packetDigest !== expectedPacketDigest) {
    throw new Error(
      'Worksheet review-route evaluation packet digest does not match its contents.',
    );
  }
}

export function assertWorksheetReviewRouteEvaluationResponse(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationResponseV1 {
  const response = requireRecord(
    value,
    'worksheet review-route evaluation response',
  );
  assertExactKeys(
    response,
    RESPONSE_KEYS,
    'evaluation response',
  );

  if (
    response.schemaVersion !==
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RESPONSE_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route evaluation response schema version.',
    );
  }

  if (
    response.protocolVersion !==
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route evaluation protocol version.',
    );
  }

  assertDigest(response.packetDigest);

  if (!Array.isArray(response.outcomes)) {
    throw new Error(
      'Worksheet review-route evaluation outcomes must be an array.',
    );
  }

  const ids = new Set<string>();
  for (const value of response.outcomes) {
    const record = requireRecord(
      value,
      'worksheet review-route evaluation outcome record',
    );
    assertExactKeys(
      record,
      OUTCOME_RECORD_KEYS,
      'evaluation outcome record',
    );
    assertNonEmpty('evaluation outcome case id', record.caseId);
    assertDigest(record.caseDigest);
    if (ids.has(record.caseId)) {
      throw new Error(
        `Duplicate worksheet review-route evaluation outcome case id: ${record.caseId}.`,
      );
    }
    ids.add(record.caseId);
    assertCognitiveOutcome(record.outcome as CognitiveOutcome);
  }
}

export function evaluateWorksheetReviewRouteEvaluationResponse(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  response: WorksheetReviewRouteEvaluationResponseV1,
): WorksheetReviewRouteEvaluationReportV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertWorksheetReviewRouteEvaluationResponse(response);

  const packet = createWorksheetReviewRouteEvaluationPacket(corpus);
  if (packet.packetDigest !== response.packetDigest) {
    throw new Error(
      'Worksheet review-route evaluation response is stale for the current projection packet.',
    );
  }

  assertExactOutcomeCoverage(packet, response);
  assertOutcomeCaseDigests(packet, response);

  const labels = getAdjudicatedWorksheetReviewRouteLabels(corpus);
  const labelById = new Map(
    labels.map((entry) => [entry.id, entry.expectedRoute] as const),
  );
  const outcomeById = new Map(
    response.outcomes.map(
      (entry) => [entry.caseId, entry.outcome] as const,
    ),
  );

  const provider = assertConsistentProvider(response.outcomes);

  const cases = packet.cases.map((entry) => {
    const expectedRoute = labelById.get(entry.id);
    const outcome = outcomeById.get(entry.id);
    if (expectedRoute === undefined || outcome === undefined) {
      throw new Error(
        `Worksheet review-route evaluation join failed: ${entry.id}.`,
      );
    }
    assertCanonicalQuestion(outcome, entry.id);

    return {
      id: entry.id,
      expectedRoute,
      outcome,
    };
  });

  const projectionCases =
    getAdjudicatedWorksheetReviewRouteProjectionCases(corpus);

  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_REPORT_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    purpose: 'adjudicated-ground-truth-evaluation',
    packetDigest: packet.packetDigest,
    groundTruthDigest: createGroundTruthDigest(
      packet.packetDigest,
      labels,
    ),
    provider,
    evaluatedCaseIds: packet.cases.map((entry) => entry.id),
    summary: evaluateWorksheetReviewRouteOutcomes(cases),
    projectionSeparability:
      analyzeWorksheetReviewRouteProjectionSeparability(
        projectionCases,
      ),
  };
}

function createPacketDigest(
  question: WorksheetReviewRouteEvaluationQuestionV1,
  cases: readonly WorksheetReviewRouteEvaluationPacketCaseV1[],
): string {
  const canonicalCases = [...cases]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => [
      entry.id,
      entry.caseDigest,
      entry.state.classification,
      entry.state.candidateCount,
      entry.state.hasWinner,
      entry.state.noveltyScore,
    ]);

  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_EVALUATION_PACKET_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    [
      question.id,
      question.semantics,
      [...question.choices],
    ],
    canonicalCases,
  ]);

  return sha256(canonical);
}

function createCaseDigest(
  question: WorksheetReviewRouteEvaluationQuestionV1,
  caseId: string,
  state: JevWorksheetReviewRouteState,
): string {
  return sha256(JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_EVALUATION_CASE_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    question.id,
    caseId,
    state.classification,
    state.candidateCount,
    state.hasWinner,
    state.noveltyScore,
  ]));
}

function createGroundTruthDigest(
  packetDigest: string,
  labels: readonly {
    id: string;
    expectedRoute: WorksheetReviewRouteChoice;
  }[],
): string {
  const canonicalLabels = [...labels]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => [entry.id, entry.expectedRoute]);

  return sha256(JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_GROUND_TRUTH_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest,
    canonicalLabels,
  ]));
}

function assertExactOutcomeCoverage(
  packet: WorksheetReviewRouteEvaluationPacketV1,
  response: WorksheetReviewRouteEvaluationResponseV1,
): void {
  const expected = new Set(
    packet.cases.map((entry) => entry.id),
  );
  const actual = new Set(
    response.outcomes.map((entry) => entry.caseId),
  );

  for (const id of actual) {
    if (!expected.has(id)) {
      throw new Error(
        `Worksheet review-route evaluation outcome case is not in the current packet: ${id}.`,
      );
    }
  }
  for (const id of expected) {
    if (!actual.has(id)) {
      throw new Error(
        `Worksheet review-route evaluation outcome is missing for packet case: ${id}.`,
      );
    }
  }
}

function assertOutcomeCaseDigests(
  packet: WorksheetReviewRouteEvaluationPacketV1,
  response: WorksheetReviewRouteEvaluationResponseV1,
): void {
  const digestById = new Map(
    packet.cases.map(
      (entry) => [entry.id, entry.caseDigest] as const,
    ),
  );

  for (const entry of response.outcomes) {
    if (digestById.get(entry.caseId) !== entry.caseDigest) {
      throw new Error(
        `Worksheet review-route evaluation outcome case digest does not match packet state: ${entry.caseId}.`,
      );
    }
  }
}

function assertConsistentProvider(
  outcomes: readonly WorksheetReviewRouteEvaluationOutcomeRecordV1[],
): CognitiveProviderDescriptor {
  const first = outcomes[0]?.outcome.provider;
  if (first === undefined) {
    throw new Error(
      'Worksheet review-route evaluation requires at least one provider outcome.',
    );
  }

  const key = providerKey(first);
  for (const entry of outcomes) {
    if (providerKey(entry.outcome.provider) !== key) {
      throw new Error(
        'Worksheet review-route evaluation outcomes must use one provider descriptor.',
      );
    }
  }

  return {
    id: first.id,
    version: first.version,
    category: first.category,
    executionBoundary: first.executionBoundary,
    capabilities: [...first.capabilities],
  };
}

function assertCanonicalQuestion(
  outcome: ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice>,
  caseId: string,
): void {
  if (
    outcome.status === 'signal'
    && outcome.signal.payload.questionId !==
      WORKSHEET_REVIEW_ROUTE_QUESTION.id
  ) {
    throw new Error(
      `Worksheet review-route evaluation outcome uses the wrong question: ${caseId}.`,
    );
  }
}

function providerKey(
  provider: CognitiveProviderDescriptor,
): string {
  return JSON.stringify([
    provider.id,
    provider.version,
    provider.category,
    provider.executionBoundary,
    [...provider.capabilities].sort(),
  ]);
}

function sha256(value: string): string {
  const digest = createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route evaluation packet digest must be sha256:<64 hex>.',
    );
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new Error(
        `Unknown worksheet review-route ${label} field: ${key}.`,
      );
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(
        `Missing worksheet review-route ${label} field: ${key}.`,
      );
    }
  }
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertEvaluationPacketState(
  state: Record<string, unknown>,
): void {
  if (
    !['matched', 'ambiguous', 'novel'].includes(
      String(state.classification),
    )
    || typeof state.candidateCount !== 'number'
    || !Number.isInteger(state.candidateCount)
    || state.candidateCount < 0
    || typeof state.hasWinner !== 'boolean'
    || typeof state.noveltyScore !== 'number'
    || !Number.isFinite(state.noveltyScore)
    || state.noveltyScore < 0
    || state.noveltyScore > 1
    || (
      state.hasWinner === true
      && state.candidateCount < 1
    )
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation packet state.',
    );
  }
}

function assertNonEmpty(
  label: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
  ) {
    throw new Error(
      `Worksheet review-route ${label} must be a non-empty string.`,
    );
  }
}
