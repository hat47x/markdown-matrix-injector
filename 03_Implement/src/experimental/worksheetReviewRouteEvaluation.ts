import {
  assertCognitiveOutcome,
  type CognitiveScore,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentOutcome,
} from './closedChoiceJudgment.js';
import type {
  JevWorksheetReviewRouteState,
  WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';

export interface WorksheetReviewRouteEvaluationCase {
  id: string;
  expectedRoute: WorksheetReviewRouteChoice;
  outcome: ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice>;
}

export interface WorksheetReviewRouteCaseResult {
  id: string;
  expectedRoute: WorksheetReviewRouteChoice;
  status: 'decision' | 'non-decision';
  selectedRoute?: WorksheetReviewRouteChoice;
  providerConfidence?: number;
  selectedProbability?: number;
  inspectProbability?: number;
  correctDecision?: boolean;
  unsafeRoutine: boolean;
  unnecessaryInspect: boolean;
  conservativeEffectiveRoute: WorksheetReviewRouteChoice;
  conservativeCorrect: boolean;
}

export interface WorksheetReviewRouteEvaluationSummary {
  cases: number;
  expectedInspectCases: number;
  expectedRoutineCases: number;
  decisionCases: number;
  nonDecisionCases: number;
  decisionCoverage: number;
  correctDecisionCases: number;
  incorrectDecisionCases: number;
  decisionAccuracy: number | null;
  inspectCorrectDecisionCases: number;
  routineCorrectDecisionCases: number;
  inspectRecall: number | null;
  routineRecall: number | null;
  unsafeRoutineCases: number;
  unsafeRoutineRate: number | null;
  unnecessaryInspectCases: number;
  unnecessaryInspectRate: number | null;
  conservativeCorrectCases: number;
  conservativeAccuracy: number;
  conservativeUnsafeRoutineCases: number;
  conservativeUnsafeRoutineRate: number | null;
  conservativeExtraInspectCases: number;
  conservativeExtraInspectRate: number | null;
  inspectBinaryBrierScore: number | null;
  meanSelectedProbability: number | null;
  meanProviderConfidence: number | null;
  caseResults: readonly WorksheetReviewRouteCaseResult[];
}

export interface WorksheetReviewRouteProjectionCase {
  id: string;
  state: JevWorksheetReviewRouteState;
  expectedRoute: WorksheetReviewRouteChoice;
}

export interface WorksheetReviewRouteProjectionGroup {
  state: JevWorksheetReviewRouteState;
  caseIds: readonly string[];
  inspectCases: number;
  routineCases: number;
  conflictingLabels: boolean;
}

export interface WorksheetReviewRouteProjectionSeparability {
  cases: number;
  exactStateGroups: number;
  conflictingGroups: number;
  casesInConflictingGroups: number;
  exactStateOracleMaxCorrect: number;
  exactStateOracleMaxAccuracy: number;
  groups: readonly WorksheetReviewRouteProjectionGroup[];
}

export function evaluateWorksheetReviewRouteOutcomes(
  cases: readonly WorksheetReviewRouteEvaluationCase[],
): WorksheetReviewRouteEvaluationSummary {
  assertUniqueIds(cases.map((entry) => entry.id));

  const results = cases.map(evaluateCase);
  const expectedInspectCases = count(
    results,
    (entry) => entry.expectedRoute === 'inspect',
  );
  const expectedRoutineCases = results.length - expectedInspectCases;
  const decisionCases = count(
    results,
    (entry) => entry.status === 'decision',
  );
  const nonDecisionCases = results.length - decisionCases;
  const correctDecisionCases = count(
    results,
    (entry) => entry.correctDecision === true,
  );
  const inspectCorrectDecisionCases = count(
    results,
    (entry) =>
      entry.expectedRoute === 'inspect'
      && entry.selectedRoute === 'inspect',
  );
  const routineCorrectDecisionCases = count(
    results,
    (entry) =>
      entry.expectedRoute === 'routine'
      && entry.selectedRoute === 'routine',
  );
  const unsafeRoutineCases = count(
    results,
    (entry) => entry.unsafeRoutine,
  );
  const unnecessaryInspectCases = count(
    results,
    (entry) => entry.unnecessaryInspect,
  );
  const conservativeCorrectCases = count(
    results,
    (entry) => entry.conservativeCorrect,
  );
  const conservativeUnsafeRoutineCases = count(
    results,
    (entry) =>
      entry.expectedRoute === 'inspect'
      && entry.conservativeEffectiveRoute === 'routine',
  );
  const conservativeExtraInspectCases = count(
    results,
    (entry) =>
      entry.expectedRoute === 'routine'
      && entry.conservativeEffectiveRoute === 'inspect',
  );

  const decisionResults = results.filter(
    (entry) => entry.status === 'decision',
  );

  return {
    cases: results.length,
    expectedInspectCases,
    expectedRoutineCases,
    decisionCases,
    nonDecisionCases,
    decisionCoverage: ratio(decisionCases, results.length, 0),
    correctDecisionCases,
    incorrectDecisionCases: decisionCases - correctDecisionCases,
    decisionAccuracy:
      ratioOrNull(correctDecisionCases, decisionCases),
    inspectCorrectDecisionCases,
    routineCorrectDecisionCases,
    inspectRecall:
      ratioOrNull(
        inspectCorrectDecisionCases,
        expectedInspectCases,
      ),
    routineRecall:
      ratioOrNull(
        routineCorrectDecisionCases,
        expectedRoutineCases,
      ),
    unsafeRoutineCases,
    unsafeRoutineRate:
      ratioOrNull(unsafeRoutineCases, expectedInspectCases),
    unnecessaryInspectCases,
    unnecessaryInspectRate:
      ratioOrNull(
        unnecessaryInspectCases,
        expectedRoutineCases,
      ),
    conservativeCorrectCases,
    conservativeAccuracy:
      ratio(conservativeCorrectCases, results.length, 0),
    conservativeUnsafeRoutineCases,
    conservativeUnsafeRoutineRate:
      ratioOrNull(
        conservativeUnsafeRoutineCases,
        expectedInspectCases,
      ),
    conservativeExtraInspectCases,
    conservativeExtraInspectRate:
      ratioOrNull(
        conservativeExtraInspectCases,
        expectedRoutineCases,
      ),
    inspectBinaryBrierScore:
      meanOrNull(
        decisionResults.map((entry) => {
          const probability = requireMetric(
            entry.inspectProbability,
            'inspect probability',
            entry.id,
          );
          const expected =
            entry.expectedRoute === 'inspect' ? 1 : 0;
          return square(probability - expected);
        }),
      ),
    meanSelectedProbability:
      meanOrNull(
        decisionResults.map((entry) =>
          requireMetric(
            entry.selectedProbability,
            'selected probability',
            entry.id,
          )),
      ),
    meanProviderConfidence:
      meanOrNull(
        decisionResults.map((entry) =>
          requireMetric(
            entry.providerConfidence,
            'provider confidence',
            entry.id,
          )),
      ),
    caseResults: results,
  };
}

export function analyzeWorksheetReviewRouteProjectionSeparability(
  cases: readonly WorksheetReviewRouteProjectionCase[],
): WorksheetReviewRouteProjectionSeparability {
  assertUniqueIds(cases.map((entry) => entry.id));

  const groups = new Map<
    string,
    {
      state: JevWorksheetReviewRouteState;
      caseIds: string[];
      inspectCases: number;
      routineCases: number;
    }
  >();

  for (const entry of cases) {
    assertRoute(entry.expectedRoute);
    assertRouteState(entry.state);

    const key = canonicalStateKey(entry.state);
    const group = groups.get(key) ?? {
      state: { ...entry.state },
      caseIds: [],
      inspectCases: 0,
      routineCases: 0,
    };

    group.caseIds.push(entry.id);
    if (entry.expectedRoute === 'inspect') {
      group.inspectCases += 1;
    } else {
      group.routineCases += 1;
    }
    groups.set(key, group);
  }

  const projected = [...groups.values()]
    .map((group): WorksheetReviewRouteProjectionGroup => ({
      state: { ...group.state },
      caseIds: [...group.caseIds],
      inspectCases: group.inspectCases,
      routineCases: group.routineCases,
      conflictingLabels:
        group.inspectCases > 0 && group.routineCases > 0,
    }))
    .sort((left, right) =>
      canonicalStateKey(left.state).localeCompare(
        canonicalStateKey(right.state),
      ));

  const conflictingGroups = count(
    projected,
    (group) => group.conflictingLabels,
  );
  const casesInConflictingGroups = projected
    .filter((group) => group.conflictingLabels)
    .reduce(
      (sum, group) => sum + group.caseIds.length,
      0,
    );
  const exactStateOracleMaxCorrect = projected.reduce(
    (sum, group) =>
      sum + Math.max(group.inspectCases, group.routineCases),
    0,
  );

  return {
    cases: cases.length,
    exactStateGroups: projected.length,
    conflictingGroups,
    casesInConflictingGroups,
    exactStateOracleMaxCorrect,
    exactStateOracleMaxAccuracy:
      ratio(exactStateOracleMaxCorrect, cases.length, 0),
    groups: projected,
  };
}

function evaluateCase(
  entry: WorksheetReviewRouteEvaluationCase,
): WorksheetReviewRouteCaseResult {
  assertNonEmpty('case id', entry.id);
  assertRoute(entry.expectedRoute);
  assertCognitiveOutcome(entry.outcome);

  if (
    entry.outcome.provider.category !== 'judgment'
    || !entry.outcome.provider.capabilities.includes(
      'closed-choice',
    )
  ) {
    throw new Error(
      `Worksheet review-route evaluation requires a closed-choice Judgment provider: ${entry.id}.`,
    );
  }

  if (entry.outcome.status === 'signal') {
    const signal = entry.outcome.signal;
    if (
      signal.kind !== 'closed-choice-judgment'
      || signal.payload.disposition !== 'proposal-only'
    ) {
      throw new Error(
        `Invalid worksheet review-route Judgment signal: ${entry.id}.`,
      );
    }

    const selectedRoute = signal.payload.choice;
    assertRoute(selectedRoute);

    const distribution = signal.payload.distribution;
    assertDistribution(distribution, entry.id);

    const selectedProbability =
      distribution[selectedRoute];
    if (
      selectedProbability !==
      signal.payload.probability
    ) {
      throw new Error(
        `Selected probability mismatch in route evaluation: ${entry.id}.`,
      );
    }

    const providerConfidence = findScore(
      signal.scores ?? [],
      'provider-confidence',
      entry.id,
    );

    return {
      id: entry.id,
      expectedRoute: entry.expectedRoute,
      status: 'decision',
      selectedRoute,
      providerConfidence,
      selectedProbability,
      inspectProbability: distribution.inspect,
      correctDecision:
        selectedRoute === entry.expectedRoute,
      unsafeRoutine:
        entry.expectedRoute === 'inspect'
        && selectedRoute === 'routine',
      unnecessaryInspect:
        entry.expectedRoute === 'routine'
        && selectedRoute === 'inspect',
      conservativeEffectiveRoute: selectedRoute,
      conservativeCorrect:
        selectedRoute === entry.expectedRoute,
    };
  }

  if (
    !['abstained', 'unsupported', 'unavailable'].includes(
      entry.outcome.status,
    )
  ) {
    throw new Error(
      `Unsupported worksheet review-route non-decision: ${entry.outcome.status}.`,
    );
  }

  return {
    id: entry.id,
    expectedRoute: entry.expectedRoute,
    status: 'non-decision',
    unsafeRoutine: false,
    unnecessaryInspect: false,
    conservativeEffectiveRoute: 'inspect',
    conservativeCorrect:
      entry.expectedRoute === 'inspect',
  };
}

function findScore(
  scores: readonly CognitiveScore[],
  name: string,
  caseId: string,
): number {
  const matches = scores.filter(
    (score) => score.name === name,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Route evaluation requires exactly one ${name} score: ${caseId}.`,
    );
  }
  return matches[0]!.value;
}

function assertDistribution(
  distribution: Readonly<Record<string, number>>,
  caseId: string,
): asserts distribution is Readonly<
  Record<WorksheetReviewRouteChoice, number>
> {
  const keys = Object.keys(distribution).sort();
  if (
    keys.length !== 2
    || keys[0] !== 'inspect'
    || keys[1] !== 'routine'
  ) {
    throw new Error(
      `Route evaluation distribution must contain inspect/routine exactly: ${caseId}.`,
    );
  }

  const inspect = distribution.inspect;
  const routine = distribution.routine;
  if (
    !isProbability(inspect)
    || !isProbability(routine)
    || Math.abs(inspect + routine - 1) > 1e-6
  ) {
    throw new Error(
      `Invalid route evaluation probability distribution: ${caseId}.`,
    );
  }
}

function assertRoute(
  value: string,
): asserts value is WorksheetReviewRouteChoice {
  if (value !== 'inspect' && value !== 'routine') {
    throw new Error(
      `Unsupported worksheet review route: ${String(value)}.`,
    );
  }
}

function assertRouteState(
  state: JevWorksheetReviewRouteState,
): void {
  if (
    !['matched', 'ambiguous', 'novel'].includes(
      state.classification,
    )
    || !Number.isInteger(state.candidateCount)
    || state.candidateCount < 0
    || typeof state.hasWinner !== 'boolean'
    || !isProbability(state.noveltyScore)
  ) {
    throw new Error(
      'Invalid worksheet review-route projection state.',
    );
  }
  if (state.hasWinner && state.candidateCount < 1) {
    throw new Error(
      'Worksheet review-route projection cannot have a winner without candidates.',
    );
  }
}

function canonicalStateKey(
  state: JevWorksheetReviewRouteState,
): string {
  return JSON.stringify([
    state.classification,
    state.candidateCount,
    state.hasWinner,
    state.noveltyScore,
  ]);
}

function assertUniqueIds(
  ids: readonly string[],
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    assertNonEmpty('case id', id);
    if (seen.has(id)) {
      throw new Error(
        `Duplicate worksheet review-route evaluation case id: ${id}.`,
      );
    }
    seen.add(id);
  }
}

function isProbability(
  value: unknown,
): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function meanOrNull(
  values: readonly number[],
): number | null {
  if (values.length === 0) return null;
  return round(
    values.reduce((sum, value) => sum + value, 0)
      / values.length,
  );
}

function ratioOrNull(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator === 0) return null;
  return round(numerator / denominator);
}

function ratio(
  numerator: number,
  denominator: number,
  emptyValue: number,
): number {
  if (denominator === 0) return emptyValue;
  return round(numerator / denominator);
}

function count<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): number {
  return values.filter(predicate).length;
}

function square(value: number): number {
  return value * value;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function requireMetric(
  value: number | undefined,
  label: string,
  caseId: string,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(
      `Missing ${label} in route evaluation: ${caseId}.`,
    );
  }
  return value;
}

function assertNonEmpty(
  label: string,
  value: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `Worksheet review-route evaluation ${label} must not be empty.`,
    );
  }
}
