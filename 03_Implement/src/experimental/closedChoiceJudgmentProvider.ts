import {
  assertCognitiveObservation,
  assertCognitiveProviderDescriptor,
  type CognitiveObservation,
  type CognitiveProviderDescriptor,
} from './cognitiveContract.js';
import {
  adaptClosedChoiceResponse,
  assertClosedChoiceJudgmentProvider,
  assertClosedChoiceQuestion,
  type ClosedChoiceJudgmentOutcome,
  type ClosedChoiceProviderResponse,
  type ClosedChoiceQuestion,
} from './closedChoiceJudgment.js';

export interface ClosedChoiceJudgmentProviderRequest<
  TChoice extends string = string,
> {
  observation: CognitiveObservation;
  question: ClosedChoiceQuestion<TChoice>;
}

export interface ClosedChoiceJudgmentProvider<
  TChoice extends string = string,
> {
  descriptor: CognitiveProviderDescriptor;
  decide(
    request: ClosedChoiceJudgmentProviderRequest<TChoice>,
  ): Promise<ClosedChoiceProviderResponse<TChoice>>;
}

export interface RunClosedChoiceJudgmentProviderOptions {
  allowExternal?: boolean;
}

export class ExternalCognitiveProviderOptInRequiredError extends Error {
  constructor(providerId: string) {
    super(
      `External cognitive provider requires explicit opt-in: ${providerId}.`,
    );
    this.name = 'ExternalCognitiveProviderOptInRequiredError';
  }
}

export async function runClosedChoiceJudgmentProvider<
  TChoice extends string,
>(
  provider: ClosedChoiceJudgmentProvider<TChoice>,
  observation: CognitiveObservation,
  question: ClosedChoiceQuestion<TChoice>,
  options: RunClosedChoiceJudgmentProviderOptions = {},
): Promise<ClosedChoiceJudgmentOutcome<TChoice>> {
  assertCognitiveObservation(observation);

  const descriptor = cloneProviderDescriptor(provider.descriptor);
  assertCognitiveProviderDescriptor(descriptor);
  assertClosedChoiceJudgmentProvider(descriptor);

  const questionSnapshot = cloneQuestion(question);
  assertClosedChoiceQuestion(questionSnapshot);

  if (
    descriptor.executionBoundary === 'external-opt-in'
    && options.allowExternal !== true
  ) {
    throw new ExternalCognitiveProviderOptInRequiredError(
      descriptor.id,
    );
  }

  const response = await provider.decide({
    observation: structuredClone(observation),
    question: structuredClone(questionSnapshot),
  });

  return adaptClosedChoiceResponse(
    observation,
    descriptor,
    questionSnapshot,
    response,
  );
}

function cloneProviderDescriptor(
  descriptor: CognitiveProviderDescriptor,
): CognitiveProviderDescriptor {
  return {
    id: descriptor.id,
    version: descriptor.version,
    category: descriptor.category,
    executionBoundary: descriptor.executionBoundary,
    capabilities: [...descriptor.capabilities],
  };
}

function cloneQuestion<TChoice extends string>(
  question: ClosedChoiceQuestion<TChoice>,
): ClosedChoiceQuestion<TChoice> {
  return {
    id: question.id,
    semantics: question.semantics,
    choices: [...question.choices],
  };
}
