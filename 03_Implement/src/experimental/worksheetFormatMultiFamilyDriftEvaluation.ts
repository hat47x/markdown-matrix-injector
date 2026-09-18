import {
  matchFormatObservation,
  normalizeFormatFeatures,
  type FormatMatchOptions,
  type FormatPrototype,
} from './flyInspiredFormatMatcher.js';
import {
  classifyWorksheetFormatFeature,
  evaluateWorksheetFormatFeatureFamilyAblation,
  WORKSHEET_FORMAT_FEATURE_FAMILIES,
  type WorksheetFormatFeatureFamily,
} from './worksheetFormatFeatureFamilyAnalysis.js';
import {
  evaluateWorksheetFormatBalanceGate,
  type WorksheetFormatBalanceGateOptions,
} from './worksheetFormatScoringStrategyComparison.js';

export interface WorksheetFormatDriftEvaluationCase {
  id: string;
  expectedReview: boolean;
  observationFeatures: readonly string[];
  prototypes: readonly FormatPrototype[];
  matchOptions?: FormatMatchOptions;
  gateOptions?: WorksheetFormatBalanceGateOptions;
}

export interface WorksheetFormatDriftSignalMetrics {
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

export interface WorksheetFormatDriftEvaluationCaseResult {
  id: string;
  expectedReview: boolean;
  status: 'matched' | 'ambiguous' | 'novel';
  confidence: number;
  deviationScore: number;
  boundaryWarning: boolean;
  differentFamilyCount: number;
  penalizingFamilyCount: number;
  matchedDeviationHigh: boolean;
  matchedDifferentFamilyCountHigh: boolean;
  matchedPenalizingFamilyCountHigh: boolean;
}

export interface WorksheetFormatDriftSignalEvaluation {
  cases: readonly WorksheetFormatDriftEvaluationCaseResult[];
  boundaryWarning: WorksheetFormatDriftSignalMetrics;
  matchedDeviationHigh: WorksheetFormatDriftSignalMetrics;
  matchedDifferentFamilyCountHigh: WorksheetFormatDriftSignalMetrics;
  matchedPenalizingFamilyCountHigh: WorksheetFormatDriftSignalMetrics;
  boundaryOrDeviation: WorksheetFormatDriftSignalMetrics;
  boundaryOrDifferentFamilyCount: WorksheetFormatDriftSignalMetrics;
  boundaryOrDeviationOrDifferentFamilyCount: WorksheetFormatDriftSignalMetrics;
}

export interface WorksheetFormatDriftSignalOptions {
  /**
   * Offline comparison threshold only. It is not a production contract.
   */
  matchedDeviationThreshold?: number;
  /**
   * semantic-label + relative-position already account for two families on a
   * single label rename. A value of 3 therefore asks for at least one
   * additional independently represented drift family.
   */
  matchedDifferentFamilyCountThreshold?: number;
  /**
   * Offline comparison threshold for ablation directions. Sparse projection
   * can make this count less stable than raw family differences.
   */
  matchedPenalizingFamilyCountThreshold?: number;
}

const DEFAULT_MATCHED_DEVIATION_THRESHOLD = 0.18;
const DEFAULT_MATCHED_DIFFERENT_FAMILY_COUNT_THRESHOLD = 3;
const DEFAULT_MATCHED_PENALIZING_FAMILY_COUNT_THRESHOLD = 3;

/**
 * Compares candidate review signals on a corpus that is independent from the
 * corpus used to describe the existing balance warnings.
 *
 * This helper never changes matcher status, thresholds, feature extraction, or
 * source profiles. Its output is evaluation evidence only.
 */
export function evaluateWorksheetFormatDriftSignals(
  cases: readonly WorksheetFormatDriftEvaluationCase[],
  options: WorksheetFormatDriftSignalOptions = {},
): WorksheetFormatDriftSignalEvaluation {
  const deviationThreshold =
    options.matchedDeviationThreshold ?? DEFAULT_MATCHED_DEVIATION_THRESHOLD;
  const differentFamilyThreshold =
    options.matchedDifferentFamilyCountThreshold
      ?? DEFAULT_MATCHED_DIFFERENT_FAMILY_COUNT_THRESHOLD;
  const penalizingFamilyThreshold =
    options.matchedPenalizingFamilyCountThreshold
      ?? DEFAULT_MATCHED_PENALIZING_FAMILY_COUNT_THRESHOLD;

  assertUnitInterval('matchedDeviationThreshold', deviationThreshold);
  assertPositiveInteger('matchedDifferentFamilyCountThreshold', differentFamilyThreshold);
  assertPositiveInteger('matchedPenalizingFamilyCountThreshold', penalizingFamilyThreshold);

  const results = cases.map((entry) => {
    const match = matchFormatObservation(
      entry.observationFeatures,
      entry.prototypes,
      entry.matchOptions ?? {},
    );
    const candidate = match.candidates[0];
    if (!candidate) {
      throw new Error(`Drift evaluation case "${entry.id}" must produce a candidate.`);
    }

    const prototype = entry.prototypes.find(
      (value) => value.id === candidate.prototypeId,
    );
    if (!prototype) {
      throw new Error(
        `Top prototype "${candidate.prototypeId}" was not found in case "${entry.id}".`,
      );
    }

    const gate = evaluateWorksheetFormatBalanceGate(
      entry.observationFeatures,
      entry.prototypes,
      entry.matchOptions ?? {},
      entry.gateOptions ?? {},
    );
    const boundaryWarning = gate.warnings.some((warning) =>
      warning.code === 'confidence-near-gate'
      || warning.code === 'winner-margin-near-gate',
    );

    const differentFamilyCount = countDifferentFamilies(
      entry.observationFeatures,
      prototype.features,
    );
    const ablation = evaluateWorksheetFormatFeatureFamilyAblation(
      entry.observationFeatures,
      prototype,
      entry.matchOptions ?? {},
    );
    const penalizingFamilyCount = ablation.families.filter(
      (family) =>
        family.comparable
        && (family.confidenceDelta ?? 0) < 0,
    ).length;

    return {
      id: entry.id,
      expectedReview: entry.expectedReview,
      status: match.status,
      confidence: candidate.confidence,
      deviationScore: candidate.deviationScore,
      boundaryWarning,
      differentFamilyCount,
      penalizingFamilyCount,
      matchedDeviationHigh:
        match.status === 'matched'
        && candidate.deviationScore >= deviationThreshold,
      matchedDifferentFamilyCountHigh:
        match.status === 'matched'
        && differentFamilyCount >= differentFamilyThreshold,
      matchedPenalizingFamilyCountHigh:
        match.status === 'matched'
        && penalizingFamilyCount >= penalizingFamilyThreshold,
    } satisfies WorksheetFormatDriftEvaluationCaseResult;
  });

  return {
    cases: results,
    boundaryWarning: calculateMetrics(results, (entry) => entry.boundaryWarning),
    matchedDeviationHigh: calculateMetrics(
      results,
      (entry) => entry.matchedDeviationHigh,
    ),
    matchedDifferentFamilyCountHigh: calculateMetrics(
      results,
      (entry) => entry.matchedDifferentFamilyCountHigh,
    ),
    matchedPenalizingFamilyCountHigh: calculateMetrics(
      results,
      (entry) => entry.matchedPenalizingFamilyCountHigh,
    ),
    boundaryOrDeviation: calculateMetrics(
      results,
      (entry) => entry.boundaryWarning || entry.matchedDeviationHigh,
    ),
    boundaryOrDifferentFamilyCount: calculateMetrics(
      results,
      (entry) => entry.boundaryWarning || entry.matchedDifferentFamilyCountHigh,
    ),
    boundaryOrDeviationOrDifferentFamilyCount: calculateMetrics(
      results,
      (entry) =>
        entry.boundaryWarning
        || entry.matchedDeviationHigh
        || entry.matchedDifferentFamilyCountHigh,
    ),
  };
}

export function countWorksheetFormatDifferentFamilies(
  observationFeatures: readonly string[],
  prototypeFeatures: readonly string[],
): number {
  return countDifferentFamilies(observationFeatures, prototypeFeatures);
}

function countDifferentFamilies(
  observationFeatures: readonly string[],
  prototypeFeatures: readonly string[],
): number {
  let count = 0;
  for (const family of WORKSHEET_FORMAT_FEATURE_FAMILIES) {
    const observation = familyFeatures(observationFeatures, family);
    const prototype = familyFeatures(prototypeFeatures, family);
    if (!sameSet(observation, prototype)) count += 1;
  }
  return count;
}

function familyFeatures(
  features: readonly string[],
  family: WorksheetFormatFeatureFamily,
): string[] {
  return normalizeFormatFeatures(features)
    .filter((feature) => classifyWorksheetFormatFeature(feature) === family);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function calculateMetrics(
  cases: readonly WorksheetFormatDriftEvaluationCaseResult[],
  isFlagged: (entry: WorksheetFormatDriftEvaluationCaseResult) => boolean,
): WorksheetFormatDriftSignalMetrics {
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

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
