import {
  assertCognitiveObservation,
  type CognitiveObservation,
} from './cognitiveContract.js';
import type {
  WorksheetReviewRouteEvaluationPacketCaseV1,
} from './worksheetReviewRouteEvaluationPacket.js';
import type {
  JevWorksheetReviewRouteState,
} from './jevWorksheetReviewRouteProvider.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_KIND =
  'worksheet-review-route-evaluation-state' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_SCHEMA_VERSION =
  'worksheet-review-route-evaluation-state-v1' as const;

export type WorksheetReviewRouteEvaluationObservation =
  CognitiveObservation<JevWorksheetReviewRouteState>;

const STATE_KEYS = [
  'classification',
  'candidateCount',
  'hasWinner',
  'noveltyScore',
] as const;

export function createWorksheetReviewRouteEvaluationObservation(
  entry: WorksheetReviewRouteEvaluationPacketCaseV1,
): WorksheetReviewRouteEvaluationObservation {
  assertNonEmpty('evaluation case id', entry.id);
  assertDigest(entry.caseDigest);
  assertWorksheetReviewRouteEvaluationState(entry.state);

  return {
    id: entry.id,
    kind: WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_KIND,
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_SCHEMA_VERSION,
    payload: { ...entry.state },
    provenance: {
      sourceKind: 'worksheet-review-route-evaluation-packet',
      sourceDigest: entry.caseDigest,
    },
  };
}

export function projectWorksheetReviewRouteEvaluationState(
  observation: CognitiveObservation,
): JevWorksheetReviewRouteState {
  assertCognitiveObservation(observation);

  if (
    observation.kind !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_KIND
    || observation.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_SCHEMA_VERSION
  ) {
    throw new Error(
      'Worksheet review-route evaluation provider requires the canonical evaluation-state Observation.',
    );
  }

  if (
    observation.provenance.sourceKind !==
      'worksheet-review-route-evaluation-packet'
  ) {
    throw new Error(
      'Worksheet review-route evaluation Observation must originate from the evaluation packet boundary.',
    );
  }
  assertDigest(observation.provenance.sourceDigest);

  const state = requireRecord(
    observation.payload,
    'worksheet review-route evaluation state',
  );
  assertWorksheetReviewRouteEvaluationState(state);

  return {
    classification: state.classification,
    candidateCount: state.candidateCount,
    hasWinner: state.hasWinner,
    noveltyScore: state.noveltyScore,
  };
}

function assertWorksheetReviewRouteEvaluationState(
  value: unknown,
): asserts value is JevWorksheetReviewRouteState {
  const state = requireRecord(
    value,
    'worksheet review-route evaluation state',
  );
  assertExactKeys(
    state,
    STATE_KEYS,
    'evaluation state',
  );

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
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation state.',
    );
  }

  if (
    state.hasWinner === true
    && state.candidateCount < 1
  ) {
    throw new Error(
      'Worksheet review-route evaluation state cannot have a winner without candidates.',
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

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route evaluation case digest must be sha256:<64 hex>.',
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
