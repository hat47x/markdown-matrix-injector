import {
  normalizeFormatFeatures,
  type FormatMatchStatus,
} from './flyInspiredFormatMatcher.js';
import {
  extractWorksheetFormatFeatures,
  type FormatFillTone,
} from './worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
} from './worksheetFormatPrototype.js';
import {
  evaluateWorksheetFormatFillEvidence,
  WORKSHEET_FORMAT_FILL_EVALUATION_STRUCTURE_ONLY_PROFILE,
  type WorksheetFormatFillEvidenceCase,
  type WorksheetFormatFillEvidenceCaseResult,
} from './worksheetFormatFillEvidenceEvaluation.js';

export type WorksheetFormatFillReviewTelemetryCode =
  | 'fill-supported-acceptance'
  | 'fill-supported-disambiguation'
  | 'fill-induced-ambiguity'
  | 'fill-induced-rejection'
  | 'fill-changed-winner'
  | 'fill-unavailable'
  | 'fill-unavailable-for-discrimination'
  | 'fill-tone-disagreement';

export interface WorksheetFormatFillReviewCase
  extends WorksheetFormatFillEvidenceCase {
  expectedReview: boolean;
}

export interface WorksheetFormatFillReviewCaseResult
  extends WorksheetFormatFillEvidenceCaseResult {
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

const DECISION_IMPACT_CODES = new Set<WorksheetFormatFillReviewTelemetryCode>([
  'fill-supported-acceptance',
  'fill-supported-disambiguation',
  'fill-induced-ambiguity',
  'fill-induced-rejection',
  'fill-changed-winner',
]);

/**
 * Evaluates fill-specific telemetry without changing the matcher or creating a
 * production review gate.
 *
 * The telemetry intentionally distinguishes:
 *
 * - decision impact: fill changed status or winner
 * - essential unavailability: fill is the only discriminating evidence among
 *   otherwise structurally equivalent prototypes, but observation fill is absent
 * - broad availability/disagreement facts, which are useful diagnostics but can
 *   be noisy when interpreted as per-case review requirements
 */
export function evaluateWorksheetFormatFillReviewTelemetry(
  cases: readonly WorksheetFormatFillReviewCase[],
): WorksheetFormatFillReviewEvaluation {
  const paired = evaluateWorksheetFormatFillEvidence(cases);
  const results = paired.cases.map((entry, index) => {
    const source = cases[index];
    if (!source || source.id !== entry.id) {
      throw new Error('Fill review evaluation case ordering changed unexpectedly.');
    }

    const telemetry = classifyTelemetry(source, entry);
    const decisionImpact = telemetry.some((code) => DECISION_IMPACT_CODES.has(code));
    const essentialUnavailable = telemetry.includes('fill-unavailable-for-discrimination');
    const broadFillUnavailable = telemetry.includes('fill-unavailable');
    const broadFillDisagreement = telemetry.includes('fill-tone-disagreement');

    return {
      ...entry,
      expectedReview: source.expectedReview,
      telemetry,
      decisionImpact,
      essentialUnavailable,
      highImpactReviewTelemetry: decisionImpact || essentialUnavailable,
      broadFillUnavailable,
      broadFillDisagreement,
    } satisfies WorksheetFormatFillReviewCaseResult;
  });

  return {
    cases: results,
    decisionImpact: calculateMetrics(results, (entry) => entry.decisionImpact),
    essentialUnavailable: calculateMetrics(
      results,
      (entry) => entry.essentialUnavailable,
    ),
    highImpactReviewTelemetry: calculateMetrics(
      results,
      (entry) => entry.highImpactReviewTelemetry,
    ),
    broadFillUnavailable: calculateMetrics(
      results,
      (entry) => entry.broadFillUnavailable,
    ),
    broadFillDisagreement: calculateMetrics(
      results,
      (entry) => entry.broadFillDisagreement,
    ),
    anyTelemetry: calculateMetrics(
      results,
      (entry) => entry.telemetry.length > 0,
    ),
  };
}

function classifyTelemetry(
  source: WorksheetFormatFillReviewCase,
  result: WorksheetFormatFillEvidenceCaseResult,
): WorksheetFormatFillReviewTelemetryCode[] {
  const telemetry: WorksheetFormatFillReviewTelemetryCode[] = [];
  const withFillStatus = result.withFill.match.status;
  const structureStatus = result.structureOnly.match.status;

  pushStatusTransition(telemetry, structureStatus, withFillStatus);

  if (
    result.withFill.topPrototypeId
    && result.structureOnly.topPrototypeId
    && result.withFill.topPrototypeId !== result.structureOnly.topPrototypeId
  ) {
    telemetry.push('fill-changed-winner');
  }

  const observationFill = meaningfulHeaderFill(source.observationSnapshot);
  const prototypeFills = new Map(
    source.prototypeSnapshots.map((prototype) => [
      prototype.id,
      meaningfulHeaderFill(prototype.snapshot),
    ]),
  );

  if (
    observationFill === undefined
    && [...prototypeFills.values()].some((fill) => fill !== undefined)
  ) {
    telemetry.push('fill-unavailable');
  }

  if (
    observationFill === undefined
    && result.withFill.match.status === 'ambiguous'
    && result.structureOnly.match.status === 'ambiguous'
    && structurallyEquivalentPrototypes(source)
    && distinctMeaningfulFills(prototypeFills) >= 2
  ) {
    telemetry.push('fill-unavailable-for-discrimination');
  }

  const structureWinnerFill = result.structureOnly.topPrototypeId
    ? prototypeFills.get(result.structureOnly.topPrototypeId)
    : undefined;
  if (
    observationFill !== undefined
    && structureWinnerFill !== undefined
    && observationFill !== structureWinnerFill
  ) {
    telemetry.push('fill-tone-disagreement');
  }

  return telemetry;
}

function pushStatusTransition(
  telemetry: WorksheetFormatFillReviewTelemetryCode[],
  structureStatus: FormatMatchStatus,
  withFillStatus: FormatMatchStatus,
): void {
  if (structureStatus === 'novel' && withFillStatus === 'matched') {
    telemetry.push('fill-supported-acceptance');
    return;
  }
  if (structureStatus === 'ambiguous' && withFillStatus === 'matched') {
    telemetry.push('fill-supported-disambiguation');
    return;
  }
  if (structureStatus === 'matched' && withFillStatus === 'ambiguous') {
    telemetry.push('fill-induced-ambiguity');
    return;
  }
  if (structureStatus === 'matched' && withFillStatus === 'novel') {
    telemetry.push('fill-induced-rejection');
  }
}

function meaningfulHeaderFill(
  snapshot: WorksheetFormatFillReviewCase['observationSnapshot'],
): Exclude<FormatFillTone, 'none' | 'other'> | undefined {
  const feature = extractWorksheetFormatFeatures(snapshot).features.find(
    (value) =>
      value === 'header:dark-fill'
      || value === 'header:gray-fill'
      || value === 'header:light-fill',
  );
  if (feature === 'header:dark-fill') return 'dark';
  if (feature === 'header:gray-fill') return 'gray';
  if (feature === 'header:light-fill') return 'light';
  return undefined;
}

function structurallyEquivalentPrototypes(
  source: WorksheetFormatFillReviewCase,
): boolean {
  const featureSets = source.prototypeSnapshots.map((prototype) =>
    normalizeFormatFeatures(
      createWorksheetFormatPrototype(
        prototype.id,
        prototype.snapshot,
        WORKSHEET_FORMAT_FILL_EVALUATION_STRUCTURE_ONLY_PROFILE,
      ).features,
    ),
  );
  const first = featureSets[0];
  if (!first) return false;
  return featureSets.every((features) =>
    features.length === first.length
    && features.every((feature, index) => feature === first[index]),
  );
}

function distinctMeaningfulFills(
  prototypeFills: ReadonlyMap<string, Exclude<FormatFillTone, 'none' | 'other'> | undefined>,
): number {
  return new Set(
    [...prototypeFills.values()].filter(
      (value): value is Exclude<FormatFillTone, 'none' | 'other'> =>
        value !== undefined,
    ),
  ).size;
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
