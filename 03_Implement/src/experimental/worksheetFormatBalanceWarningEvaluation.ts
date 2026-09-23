import type { FormatMatchOptions, FormatPrototype } from './flyInspiredFormatMatcher.js';
import {
  evaluateWorksheetFormatBalanceGate,
  type WorksheetFormatBalanceGateOptions,
  type WorksheetFormatBalanceGateResult,
  type WorksheetFormatBalanceWarningCode,
} from './worksheetFormatScoringStrategyComparison.js';

export type WorksheetFormatBalanceWarningKind = 'boundary' | 'composition';

export interface WorksheetFormatBalanceEvaluationCase {
  id: string;
  expectedReview: boolean;
  observationFeatures: readonly string[];
  prototypes: readonly FormatPrototype[];
  matchOptions?: FormatMatchOptions;
  gateOptions?: WorksheetFormatBalanceGateOptions;
}

export interface WorksheetFormatBalanceEvaluationCaseResult {
  id: string;
  expectedReview: boolean;
  gate: WorksheetFormatBalanceGateResult;
  warningKinds: readonly WorksheetFormatBalanceWarningKind[];
  flaggedByAnyWarning: boolean;
  flaggedByBoundaryWarning: boolean;
  flaggedByCompositionWarning: boolean;
}

export interface WorksheetFormatBalanceEvaluationMetrics {
  cases: number;
  expectedReviewCases: number;
  flaggedCases: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}

export interface WorksheetFormatBalanceCorpusEvaluation {
  cases: readonly WorksheetFormatBalanceEvaluationCaseResult[];
  anyWarning: WorksheetFormatBalanceEvaluationMetrics;
  boundaryWarning: WorksheetFormatBalanceEvaluationMetrics;
  compositionWarning: WorksheetFormatBalanceEvaluationMetrics;
}

/**
 * Separates warnings that describe a decision boundary from warnings that only
 * describe the shape of the feature vector.
 *
 * This distinction is intentionally evaluative. It does not alter matcher
 * status or gate output.
 */
export function classifyWorksheetFormatBalanceWarning(
  code: WorksheetFormatBalanceWarningCode,
): WorksheetFormatBalanceWarningKind {
  switch (code) {
    case 'confidence-near-gate':
    case 'winner-margin-near-gate':
      return 'boundary';
    case 'column-family-share-high':
    case 'single-family-share-high':
      return 'composition';
  }
}

/**
 * Evaluates the existing balance gate against a corpus whose expected-review
 * labels are assigned independently of the gate warnings.
 *
 * The helper reports three views:
 *
 * - anyWarning: current behavior when every warning is treated as a review flag
 * - boundaryWarning: only confidence / winner-margin proximity
 * - compositionWarning: only family-share observations
 *
 * This is a measurement helper, not a production policy.
 */
export function evaluateWorksheetFormatBalanceWarningCorpus(
  cases: readonly WorksheetFormatBalanceEvaluationCase[],
): WorksheetFormatBalanceCorpusEvaluation {
  const results = cases.map((entry) => {
    const gate = evaluateWorksheetFormatBalanceGate(
      entry.observationFeatures,
      entry.prototypes,
      entry.matchOptions ?? {},
      entry.gateOptions ?? {},
    );
    const warningKinds = [...new Set(
      gate.warnings.map((warning) => classifyWorksheetFormatBalanceWarning(warning.code)),
    )];

    return {
      id: entry.id,
      expectedReview: entry.expectedReview,
      gate,
      warningKinds,
      flaggedByAnyWarning: gate.warnings.length > 0,
      flaggedByBoundaryWarning: warningKinds.includes('boundary'),
      flaggedByCompositionWarning: warningKinds.includes('composition'),
    } satisfies WorksheetFormatBalanceEvaluationCaseResult;
  });

  return {
    cases: results,
    anyWarning: calculateMetrics(results, (entry) => entry.flaggedByAnyWarning),
    boundaryWarning: calculateMetrics(
      results,
      (entry) => entry.flaggedByBoundaryWarning,
    ),
    compositionWarning: calculateMetrics(
      results,
      (entry) => entry.flaggedByCompositionWarning,
    ),
  };
}

function calculateMetrics(
  cases: readonly WorksheetFormatBalanceEvaluationCaseResult[],
  isFlagged: (entry: WorksheetFormatBalanceEvaluationCaseResult) => boolean,
): WorksheetFormatBalanceEvaluationMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (const entry of cases) {
    const flagged = isFlagged(entry);
    if (entry.expectedReview) {
      if (flagged) truePositive += 1;
      else falseNegative += 1;
    } else if (flagged) {
      falsePositive += 1;
    } else {
      trueNegative += 1;
    }
  }

  const flaggedCases = truePositive + falsePositive;
  const expectedReviewCases = truePositive + falseNegative;

  return {
    cases: cases.length,
    expectedReviewCases,
    flaggedCases,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: ratio(truePositive, flaggedCases),
    recall: ratio(truePositive, expectedReviewCases),
    falsePositiveRate: ratio(falsePositive, falsePositive + trueNegative),
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return roundScore(numerator / denominator);
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
