import type {
  WorksheetFormatFillEvidenceCase,
} from './worksheetFormatFillEvidenceEvaluation.js';
import {
  analyzeWorksheetFormatFillReview,
  type WorksheetFormatFillReviewAnalysisResult,
  type WorksheetFormatFillReviewTelemetryCode,
} from './worksheetFormatFillReviewAnalysis.js';

export type {
  WorksheetFormatFillReviewTelemetryCode,
} from './worksheetFormatFillReviewAnalysis.js';

export interface WorksheetFormatFillReviewCase
  extends WorksheetFormatFillEvidenceCase {
  expectedReview: boolean;
}

export interface WorksheetFormatFillReviewCaseResult
  extends WorksheetFormatFillReviewAnalysisResult {
  expectedReview: boolean;
  telemetry: readonly WorksheetFormatFillReviewTelemetryCode[];
  decisionImpact: boolean;
  essentialUnavailable: boolean;
  highImpactReviewTelemetry: boolean;
  broadFillUnavailable: boolean;
  broadFillDisagreement: boolean;
}

export interface WorksheetFormatFillReviewMetrics {
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

export interface WorksheetFormatFillReviewEvaluation {
  cases: readonly WorksheetFormatFillReviewCaseResult[];
  decisionImpact: WorksheetFormatFillReviewMetrics;
  essentialUnavailable: WorksheetFormatFillReviewMetrics;
  highImpactReviewTelemetry: WorksheetFormatFillReviewMetrics;
  broadFillUnavailable: WorksheetFormatFillReviewMetrics;
  broadFillDisagreement: WorksheetFormatFillReviewMetrics;
  anyTelemetry: WorksheetFormatFillReviewMetrics;
}

function calculateMetrics(
  cases: readonly WorksheetFormatFillReviewCaseResult[],
  isFlagged: (entry: WorksheetFormatFillReviewCaseResult) => boolean,
): WorksheetFormatFillReviewMetrics {
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
