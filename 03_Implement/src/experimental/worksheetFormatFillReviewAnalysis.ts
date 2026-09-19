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

export interface WorksheetFormatFillReviewAnalysisResult
  extends WorksheetFormatFillEvidenceCaseResult {
  telemetry: readonly WorksheetFormatFillReviewTelemetryCode[];
  decisionImpact: boolean;
  essentialUnavailable: boolean;
  highImpactReviewTelemetry: boolean;
  broadFillUnavailable: boolean;
  broadFillDisagreement: boolean;
}

export interface WorksheetFormatFillReviewAnalysis {
  cases: readonly WorksheetFormatFillReviewAnalysisResult[];
}

const DECISION_IMPACT_CODES = new Set<WorksheetFormatFillReviewTelemetryCode>([
  'fill-supported-acceptance',
  'fill-supported-disambiguation',
  'fill-induced-ambiguity',
  'fill-induced-rejection',
  'fill-changed-winner',
]);

export function analyzeWorksheetFormatFillReview(
  cases: readonly WorksheetFormatFillEvidenceCase[],
): WorksheetFormatFillReviewAnalysis {
  const paired = evaluateWorksheetFormatFillEvidence(cases);
  const results = paired.cases.map((entry, index) => {
    const source = cases[index];
    if (!source || source.id !== entry.id) {
      throw new Error('Fill review analysis case ordering changed unexpectedly.');
    }

    const telemetry = classifyTelemetry(source, entry);
    const decisionImpact = telemetry.some(
      (code) => DECISION_IMPACT_CODES.has(code),
    );
    const essentialUnavailable = telemetry.includes(
      'fill-unavailable-for-discrimination',
    );
    const broadFillUnavailable = telemetry.includes('fill-unavailable');
    const broadFillDisagreement = telemetry.includes(
      'fill-tone-disagreement',
    );

    return {
      ...entry,
      telemetry,
      decisionImpact,
      essentialUnavailable,
      highImpactReviewTelemetry: decisionImpact || essentialUnavailable,
      broadFillUnavailable,
      broadFillDisagreement,
    } satisfies WorksheetFormatFillReviewAnalysisResult;
  });

  return { cases: results };
}

function classifyTelemetry(
  source: WorksheetFormatFillEvidenceCase,
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
  snapshot: WorksheetFormatFillEvidenceCase['observationSnapshot'],
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
  source: WorksheetFormatFillEvidenceCase,
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
  prototypeFills: ReadonlyMap<
    string,
    Exclude<FormatFillTone, 'none' | 'other'> | undefined
  >,
): number {
  return new Set(
    [...prototypeFills.values()].filter(
      (value): value is Exclude<FormatFillTone, 'none' | 'other'> =>
        value !== undefined,
    ),
  ).size;
}
