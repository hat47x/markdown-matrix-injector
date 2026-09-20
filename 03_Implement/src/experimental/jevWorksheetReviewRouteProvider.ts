import type {
  CognitiveObservation,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentProvider,
} from './closedChoiceJudgmentProvider.js';
import type {
  ClosedChoiceQuestion,
} from './closedChoiceJudgment.js';
import {
  WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION,
  type WorksheetFormatReviewRoutePayload,
} from './containedUnifiedReviewWorkflow.js';
import {
  createJevChoiceJudgmentProvider,
  type JevChoiceJudgmentProviderConfig,
  type JevState,
  type JevSystemOneTransport,
} from './jevChoiceJudgmentProvider.js';

export type WorksheetReviewRouteChoice =
  | 'inspect'
  | 'routine';

export interface WorksheetReviewRoutePolicy {
  attention: 'elevated' | 'standard';
  humanReviewRequired: true;
  applyAuthority: 'none';
  automaticDecision: 'none';
}

export const WORKSHEET_REVIEW_ROUTE_POLICY: Readonly<
  Record<WorksheetReviewRouteChoice, WorksheetReviewRoutePolicy>
> = Object.freeze({
  inspect: Object.freeze({
    attention: 'elevated',
    humanReviewRequired: true,
    applyAuthority: 'none',
    automaticDecision: 'none',
  }),
  routine: Object.freeze({
    attention: 'standard',
    humanReviewRequired: true,
    applyAuthority: 'none',
    automaticDecision: 'none',
  }),
});

export const WORKSHEET_REVIEW_ROUTE_QUESTION:
  ClosedChoiceQuestion<WorksheetReviewRouteChoice> =
  Object.freeze({
    id: 'worksheet-format-review-route-v1',
    semantics:
      'Choose the human-review attention route for this worksheet-format observation. This is not an approval or execution decision.',
    choices: Object.freeze([
      'inspect',
      'routine',
    ] as const),
  });

export interface JevWorksheetReviewRouteProviderOptions {
  model?: string;
  providerId?: string;
}

export type JevWorksheetReviewRouteState = Readonly<{
  classification: 'matched' | 'ambiguous' | 'novel';
  candidateCount: number;
  hasWinner: boolean;
  noveltyScore: number;
}>;

export function createJevWorksheetReviewRouteProvider(
  transport: JevSystemOneTransport,
  options: JevWorksheetReviewRouteProviderOptions = {},
): ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice> {
  const config:
    JevChoiceJudgmentProviderConfig<WorksheetReviewRouteChoice> = {
      ...(options.model === undefined
        ? {}
        : { model: options.model }),
      ...(options.providerId === undefined
        ? {}
        : { providerId: options.providerId }),
      projectState(observation) {
        return projectWorksheetReviewRouteState(observation);
      },
      describeChoice(choice) {
        return describeWorksheetReviewRouteChoice(choice);
      },
    };

  return createJevChoiceJudgmentProvider(
    config,
    transport,
  );
}

export function describeWorksheetReviewRouteChoice(
  choice: WorksheetReviewRouteChoice,
): string {
  switch (choice) {
    case 'inspect':
      return 'Use the higher-attention human-review route. This does not mean reject.';
    case 'routine':
      return 'Use the standard human-review route. This does not mean accept, approve, or authorize apply.';
  }
}

export function projectWorksheetReviewRouteState(
  observation: CognitiveObservation,
): JevState {
  assertWorksheetReviewRouteObservation(observation);
  const payload =
    observation.payload as WorksheetFormatReviewRoutePayload;

  const state: JevState = {
    classification: payload.classification,
    candidateCount: payload.candidateIds.length,
    hasWinner: payload.winnerPrototypeId !== undefined,
    noveltyScore: payload.noveltyScore,
  };

  return state;
}

function assertWorksheetReviewRouteObservation(
  observation: CognitiveObservation,
): asserts observation is CognitiveObservation<
  WorksheetFormatReviewRoutePayload
> {
  if (
    observation.kind !== 'worksheet-format-review-route'
    || observation.schemaVersion !==
      WORKSHEET_FORMAT_REVIEW_ROUTE_OBSERVATION_SCHEMA_VERSION
  ) {
    throw new Error(
      'Jev worksheet review-route provider requires the canonical review-route Observation.',
    );
  }

  const payload = observation.payload;
  if (
    typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
  ) {
    throw new Error(
      'Worksheet review-route Observation payload must be an object.',
    );
  }

  const value = payload as Partial<WorksheetFormatReviewRoutePayload>;
  if (
    value.kind !== 'worksheet-format-review-route'
    || !['matched', 'ambiguous', 'novel'].includes(
      String(value.classification),
    )
    || typeof value.sheetName !== 'string'
    || value.sheetName.trim().length === 0
    || !Array.isArray(value.candidateIds)
    || value.candidateIds.some(
      (candidate) =>
        typeof candidate !== 'string'
        || candidate.trim().length === 0,
    )
    || typeof value.noveltyScore !== 'number'
    || !Number.isFinite(value.noveltyScore)
    || value.noveltyScore < 0
    || value.noveltyScore > 1
    || (
      value.winnerPrototypeId !== undefined
      && (
        typeof value.winnerPrototypeId !== 'string'
        || value.winnerPrototypeId.trim().length === 0
      )
    )
  ) {
    throw new Error(
      'Invalid worksheet review-route Observation payload.',
    );
  }

  if (
    value.winnerPrototypeId !== undefined
    && !value.candidateIds.includes(
      value.winnerPrototypeId,
    )
  ) {
    throw new Error(
      'Worksheet review-route winner must be present in candidate ids.',
    );
  }
}
