import {
  assertCognitiveObservation,
  assertCognitiveOutcome,
  assertCognitiveProviderDescriptor,
  toCognitiveObservationRef,
  type CognitiveAbstentionOutcome,
  type CognitiveObservation,
  type CognitiveProviderDescriptor,
  type CognitiveScore,
  type CognitiveSignalOutcome,
} from './cognitiveContract.js';

export interface ClosedChoiceQuestion<TChoice extends string = string> {
  id: string;
  semantics: string;
  choices: readonly TChoice[];
}

export interface ClosedChoiceDecisionResponse<TChoice extends string = string> {
  status: 'decision';
  choice: TChoice;
  probability: number;
  confidence: number;
  distribution: Readonly<Record<string, number>>;
}

export interface ClosedChoiceNonDecisionResponse {
  status: 'abstained' | 'unsupported' | 'unavailable';
  reasonCode: string;
  detail?: string;
  confidence?: number;
}

export type ClosedChoiceProviderResponse<TChoice extends string = string> =
  | ClosedChoiceDecisionResponse<TChoice>
  | ClosedChoiceNonDecisionResponse;

export interface ClosedChoiceJudgmentPayload<TChoice extends string = string> {
  questionId: string;
  disposition: 'proposal-only';
  choice: TChoice;
  probability: number;
  distribution: Readonly<Record<string, number>>;
}

export type ClosedChoiceJudgmentOutcome<TChoice extends string = string> =
  | CognitiveSignalOutcome<ClosedChoiceJudgmentPayload<TChoice>>
  | CognitiveAbstentionOutcome;

export interface ClosedChoiceCalibrationSample {
  questionId: string;
  confidence: number;
  choiceProbability: number;
  correct: boolean;
}

export function adaptClosedChoiceResponse<TChoice extends string>(
  observation: CognitiveObservation,
  provider: CognitiveProviderDescriptor,
  question: ClosedChoiceQuestion<TChoice>,
  response: ClosedChoiceProviderResponse<TChoice>,
): ClosedChoiceJudgmentOutcome<TChoice> {
  assertCognitiveObservation(observation);
  assertClosedChoiceJudgmentProvider(provider);
  assertClosedChoiceQuestion(question);

  if (response.status !== 'decision') {
    assertNonEmpty('response.reasonCode', response.reasonCode);
    if (response.detail !== undefined) {
      assertNonEmpty('response.detail', response.detail);
    }
    const scores = response.confidence === undefined
      ? undefined
      : [confidenceScore(provider, response.confidence)];

    const outcome: CognitiveAbstentionOutcome = {
      status: response.status,
      provider,
      observation: toCognitiveObservationRef(observation),
      reasonCode: response.reasonCode.trim(),
      ...(response.detail === undefined ? {} : { detail: response.detail.trim() }),
      ...(scores === undefined ? {} : { scores }),
    };
    assertCognitiveOutcome(outcome);
    return outcome;
  }

  assertDecision(question, response);
  const outcome: CognitiveSignalOutcome<ClosedChoiceJudgmentPayload<TChoice>> = {
    status: 'signal',
    provider,
    observation: toCognitiveObservationRef(observation),
    signal: {
      kind: 'closed-choice-judgment',
      payload: {
        questionId: question.id,
        disposition: 'proposal-only',
        choice: response.choice,
        probability: response.probability,
        distribution: { ...response.distribution },
      },
      scores: [
        {
          namespace: provider.id,
          name: 'choice-probability',
          semantics: 'provider-reported probability for the selected declared choice',
          value: response.probability,
          range: { min: 0, max: 1 },
          higherIsStronger: true,
        },
        confidenceScore(provider, response.confidence),
      ],
      evidence: [{ code: 'CLOSED_CHOICE_PROPOSAL' }],
    },
  };
  assertCognitiveOutcome(outcome);
  return outcome;
}

export function collectClosedChoiceCalibrationSample<TChoice extends string>(
  outcome: ClosedChoiceJudgmentOutcome<TChoice>,
  expectedChoice: TChoice,
): ClosedChoiceCalibrationSample | undefined {
  if (outcome.status !== 'signal') return undefined;

  const confidence = outcome.signal.scores?.find(
    (score) => score.name === 'provider-confidence',
  )?.value;
  if (confidence === undefined) {
    throw new Error('Closed-choice signal is missing provider confidence.');
  }

  return {
    questionId: outcome.signal.payload.questionId,
    confidence,
    choiceProbability: outcome.signal.payload.probability,
    correct: outcome.signal.payload.choice === expectedChoice,
  };
}

export function assertClosedChoiceJudgmentProvider(provider: CognitiveProviderDescriptor): void {
  assertCognitiveProviderDescriptor(provider);
  if (provider.category !== 'judgment') {
    throw new Error('Closed-choice provider must use the judgment category.');
  }
  if (!provider.capabilities.includes('closed-choice')) {
    throw new Error('Closed-choice provider must declare the closed-choice capability.');
  }
}

function assertQuestion<TChoice extends string>(
  question: ClosedChoiceQuestion<TChoice>,
): void {
  assertNonEmpty('question.id', question.id);
  assertNonEmpty('question.semantics', question.semantics);
  if (question.choices.length < 2) {
    throw new Error('Closed-choice question must declare at least two choices.');
  }

  const seen = new Set<string>();
  for (const choice of question.choices) {
    assertNonEmpty('question choice', choice);
    if (seen.has(choice)) {
      throw new Error(`Duplicate closed-choice option: ${choice}.`);
    }
    seen.add(choice);
  }
}

function assertDecision<TChoice extends string>(
  question: ClosedChoiceQuestion<TChoice>,
  response: ClosedChoiceDecisionResponse<TChoice>,
): void {
  if (!question.choices.includes(response.choice)) {
    throw new Error(`Provider selected undeclared choice: ${String(response.choice)}.`);
  }
  assertProbability('response.probability', response.probability);
  assertProbability('response.confidence', response.confidence);

  const keys = Object.keys(response.distribution).sort();
  const expectedKeys = [...question.choices].sort();
  if (!sameStrings(keys, expectedKeys)) {
    throw new Error('Provider distribution must contain exactly the declared choices.');
  }

  let sum = 0;
  for (const choice of question.choices) {
    const value = response.distribution[choice];
    assertProbability(`distribution.${choice}`, value);
    sum += value;
  }
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error('Provider choice distribution must sum to 1.');
  }

  const selectedProbability = response.distribution[response.choice];
  if (Math.abs(selectedProbability - response.probability) > 1e-9) {
    throw new Error('Selected choice probability must match the distribution.');
  }
}

function confidenceScore(
  provider: CognitiveProviderDescriptor,
  value: number,
): CognitiveScore {
  assertProbability('response.confidence', value);
  return {
    namespace: provider.id,
    name: 'provider-confidence',
    semantics: 'provider-reported confidence for this bounded judgment; not a cross-provider probability scale',
    value,
    range: { min: 0, max: 1 },
    higherIsStronger: true,
  };
}

function assertProbability(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite value between 0 and 1.`);
  }
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
