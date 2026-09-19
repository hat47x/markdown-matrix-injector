import type {
  CognitiveObservation,
} from './cognitiveContract.js';
import type {
  ClosedChoiceProviderResponse,
  ClosedChoiceQuestion,
} from './closedChoiceJudgment.js';
import type {
  ClosedChoiceJudgmentProvider,
  ClosedChoiceJudgmentProviderRequest,
} from './closedChoiceJudgmentProvider.js';

export type JevJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JevJsonValue[]
  | { readonly [key: string]: JevJsonValue };

export type JevState =
  | string
  | readonly JevJsonValue[]
  | { readonly [key: string]: JevJsonValue };

export interface JevChoiceQuestionRequest {
  type: 'choice';
  instructions: string;
  criteria: Readonly<Record<string, string | null>>;
}

export interface JevSystemOneChoiceRequest {
  state: JevState;
  model: string;
  questions: {
    decision: JevChoiceQuestionRequest;
  };
}

export interface JevSystemOneTransport {
  evaluate(
    request: JevSystemOneChoiceRequest,
  ): Promise<unknown>;
}

export interface JevChoiceJudgmentProviderConfig<
  TChoice extends string = string,
> {
  model?: string;
  providerId?: string;
  projectState(
    observation: CognitiveObservation,
  ): JevState;
  describeChoice(
    choice: TChoice,
    question: ClosedChoiceQuestion<TChoice>,
  ): string | null;
}

export function createJevChoiceJudgmentProvider<
  TChoice extends string,
>(
  config: JevChoiceJudgmentProviderConfig<TChoice>,
  transport: JevSystemOneTransport,
): ClosedChoiceJudgmentProvider<TChoice> {
  const model = (config.model ?? 'jev-latest').trim();
  if (model.length === 0) {
    throw new Error('Jev model id must not be empty.');
  }

  const providerId =
    (config.providerId ?? 'typesafe.jev.choice').trim();
  if (providerId.length === 0) {
    throw new Error('Jev provider id must not be empty.');
  }

  return {
    descriptor: {
      id: providerId,
      version: model,
      category: 'judgment',
      executionBoundary: 'external-opt-in',
      capabilities: ['closed-choice'],
    },

    async decide(
      request: ClosedChoiceJudgmentProviderRequest<TChoice>,
    ): Promise<ClosedChoiceProviderResponse<TChoice>> {
      assertJevChoiceCardinality(request.question);

      const state = config.projectState(request.observation);
      assertJevState(state);

      const criteria: Record<string, string | null> = {};
      for (const choice of request.question.choices) {
        const description = config.describeChoice(
          choice,
          request.question,
        );
        if (
          description !== null
          && description.trim().length === 0
        ) {
          throw new Error(
            `Jev Choice criterion must be non-empty or null: ${choice}.`,
          );
        }
        criteria[choice] =
          description === null ? null : description.trim();
      }

      const response = await transport.evaluate({
        state: structuredClone(state),
        model,
        questions: {
          decision: {
            type: 'choice',
            instructions: request.question.semantics,
            criteria,
          },
        },
      });

      return parseJevChoiceResponse<TChoice>(response);
    },
  };
}

function assertJevChoiceCardinality<TChoice extends string>(
  question: ClosedChoiceQuestion<TChoice>,
): void {
  if (question.choices.length > 255) {
    throw new Error(
      `Jev Choice supports at most 255 options; received ${question.choices.length}.`,
    );
  }
}

function assertJevState(
  state: JevState,
): void {
  if (typeof state === 'string') return;
  assertJevJsonValue(state, new Set<object>(), true);
}

function assertJevJsonValue(
  value: unknown,
  stack: Set<object>,
  root = false,
): asserts value is JevJsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    if (root && value === null) {
      throw new Error(
        'Jev state root must be a string, object, or array.',
      );
    }
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        'Jev state numbers must be finite.',
      );
    }
    if (root) {
      throw new Error(
        'Jev state root must be a string, object, or array.',
      );
    }
    return;
  }

  if (typeof value !== 'object') {
    throw new Error(
      'Jev state must contain JSON-compatible values only.',
    );
  }

  const objectValue = value as object;
  if (stack.has(objectValue)) {
    throw new Error('Jev state must not contain cycles.');
  }

  if (
    !Array.isArray(value)
    && Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(
      'Jev state objects must be plain JSON objects.',
    );
  }

  stack.add(objectValue);
  try {
    if (Array.isArray(value)) {
      for (const entry of value) {
        assertJevJsonValue(entry, stack);
      }
      return;
    }

    for (const entry of Object.values(
      value as Record<string, unknown>,
    )) {
      assertJevJsonValue(entry, stack);
    }
  } finally {
    stack.delete(objectValue);
  }
}

function parseJevChoiceResponse<TChoice extends string>(
  value: unknown,
): ClosedChoiceProviderResponse<TChoice> {
  const root = requireRecord(value, 'Jev response');
  requireNonEmptyString(root.model, 'Jev response model');

  const answers = requireRecord(
    root.answers,
    'Jev response answers',
  );
  const answer = requireRecord(
    answers.decision,
    'Jev Choice answer',
  );

  if (answer.type !== 'choice') {
    throw new Error(
      `Jev answer type must be choice; received ${String(answer.type)}.`,
    );
  }

  const choice = requireNonEmptyString(
    answer.choice,
    'Jev Choice selected option',
  ) as TChoice;
  const confidence = requireFiniteNumber(
    answer.confidence,
    'Jev Choice confidence',
  );

  const probabilitiesValue = requireRecord(
    answer.probabilities,
    'Jev Choice probabilities',
  );
  const probabilities: Record<string, number> = {};
  for (const [key, probability] of Object.entries(
    probabilitiesValue,
  )) {
    probabilities[key] = requireFiniteNumber(
      probability,
      `Jev Choice probability for ${key}`,
    );
  }

  const selectedProbability = probabilities[choice];
  if (selectedProbability === undefined) {
    throw new Error(
      'Jev Choice selected option is missing from probabilities.',
    );
  }

  return {
    status: 'decision',
    choice,
    probability: selectedProbability,
    confidence,
    distribution: probabilities,
  };
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

function requireNonEmptyString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
  ) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireFiniteNumber(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
  ) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}
