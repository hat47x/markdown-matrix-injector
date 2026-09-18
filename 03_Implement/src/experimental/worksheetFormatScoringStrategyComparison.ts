import {
  createSparseFormatSignature,
  matchFormatObservation,
  normalizeFormatFeatures,
  type FormatCandidate,
  type FormatMatchOptions,
  type FormatMatchResult,
  type FormatMatchStatus,
  type FormatPrototype,
} from './flyInspiredFormatMatcher.js';
import {
  classifyWorksheetFormatFeature,
  summarizeWorksheetFormatFeatureFamilies,
  WORKSHEET_FORMAT_FEATURE_FAMILIES,
  type WorksheetFormatFeatureFamily,
} from './worksheetFormatFeatureFamilyAnalysis.js';

export type WorksheetFormatOfflineScoringStrategy =
  | 'flat'
  | 'family-normalized'
  | 'column-family-capped';

export interface WorksheetFormatOfflineScoringOptions extends FormatMatchOptions {
  columnFamilyCap?: number;
}

export interface WorksheetFormatOfflineCandidate extends FormatCandidate {
  strategy: WorksheetFormatOfflineScoringStrategy;
}

export interface WorksheetFormatOfflineMatch {
  strategy: WorksheetFormatOfflineScoringStrategy;
  status: FormatMatchStatus;
  winner?: WorksheetFormatOfflineCandidate;
  candidates: readonly WorksheetFormatOfflineCandidate[];
  noveltyScore: number;
}

export type WorksheetFormatBalanceWarningCode =
  | 'confidence-near-gate'
  | 'winner-margin-near-gate'
  | 'column-family-share-high'
  | 'single-family-share-high';

export interface WorksheetFormatBalanceWarning {
  code: WorksheetFormatBalanceWarningCode;
  message: string;
  value: number;
  limit: number;
}

export interface WorksheetFormatBalanceGateOptions {
  nearConfidenceDistance?: number;
  nearWinnerMarginDistance?: number;
  maxColumnFamilyShare?: number;
  maxSingleFamilyShare?: number;
  minConfidence?: number;
  minWinnerMargin?: number;
}

export interface WorksheetFormatBalanceGateResult {
  match: FormatMatchResult;
  warnings: readonly WorksheetFormatBalanceWarning[];
}

const DEFAULT_MIN_CONFIDENCE = 0.7;
const DEFAULT_MIN_WINNER_MARGIN = 0.05;
const DEFAULT_MAX_CANDIDATES = 3;
const DEFAULT_COLUMN_FAMILY_CAP = 3;
const DEFAULT_NEAR_CONFIDENCE_DISTANCE = 0.03;
const DEFAULT_NEAR_WINNER_MARGIN_DISTANCE = 0.02;
const DEFAULT_MAX_COLUMN_FAMILY_SHARE = 0.5;
const DEFAULT_MAX_SINGLE_FAMILY_SHARE = 0.6;

export function compareWorksheetFormatOfflineScoringStrategies(
  observationFeatures: readonly string[],
  prototypes: readonly FormatPrototype[],
  options: WorksheetFormatOfflineScoringOptions = {},
): {
  flat: WorksheetFormatOfflineMatch;
  familyNormalized: WorksheetFormatOfflineMatch;
  columnFamilyCapped: WorksheetFormatOfflineMatch;
} {
  return {
    flat: fromCurrentMatcher(observationFeatures, prototypes, options),
    familyNormalized: scoreAlternative(
      'family-normalized',
      observationFeatures,
      prototypes,
      options,
    ),
    columnFamilyCapped: scoreAlternative(
      'column-family-capped',
      observationFeatures,
      prototypes,
      options,
    ),
  };
}

/**
 * Adds design-time warnings around the current flat matcher without changing
 * its classification. This is intentionally a governance aid rather than a
 * fourth runtime scorer.
 */
export function evaluateWorksheetFormatBalanceGate(
  observationFeatures: readonly string[],
  prototypes: readonly FormatPrototype[],
  matchOptions: FormatMatchOptions = {},
  gateOptions: WorksheetFormatBalanceGateOptions = {},
): WorksheetFormatBalanceGateResult {
  const match = matchFormatObservation(observationFeatures, prototypes, matchOptions);
  const warnings: WorksheetFormatBalanceWarning[] = [];
  const minConfidence =
    gateOptions.minConfidence ?? matchOptions.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minWinnerMargin =
    gateOptions.minWinnerMargin ?? matchOptions.minWinnerMargin ?? DEFAULT_MIN_WINNER_MARGIN;
  const nearConfidenceDistance =
    gateOptions.nearConfidenceDistance ?? DEFAULT_NEAR_CONFIDENCE_DISTANCE;
  const nearWinnerMarginDistance =
    gateOptions.nearWinnerMarginDistance ?? DEFAULT_NEAR_WINNER_MARGIN_DISTANCE;
  const maxColumnFamilyShare =
    gateOptions.maxColumnFamilyShare ?? DEFAULT_MAX_COLUMN_FAMILY_SHARE;
  const maxSingleFamilyShare =
    gateOptions.maxSingleFamilyShare ?? DEFAULT_MAX_SINGLE_FAMILY_SHARE;

  const best = match.candidates[0];
  if (best && Math.abs(best.confidence - minConfidence) <= nearConfidenceDistance) {
    warnings.push({
      code: 'confidence-near-gate',
      message: 'Top candidate confidence is close to the acceptance gate.',
      value: best.confidence,
      limit: minConfidence,
    });
  }

  const second = match.candidates[1];
  if (best && second) {
    const margin = roundScore(best.confidence - second.confidence);
    if (Math.abs(margin - minWinnerMargin) <= nearWinnerMarginDistance) {
      warnings.push({
        code: 'winner-margin-near-gate',
        message: 'Top-two candidate margin is close to the ambiguity gate.',
        value: margin,
        limit: minWinnerMargin,
      });
    }
  }

  const shares = summarizeWorksheetFormatFeatureFamilies(observationFeatures);
  const shareOf = (family: WorksheetFormatFeatureFamily): number =>
    shares.find((entry) => entry.family === family)?.share ?? 0;
  const columnShare = roundScore(
    shareOf('semantic-label') + shareOf('relative-position'),
  );
  if (columnShare > maxColumnFamilyShare) {
    warnings.push({
      code: 'column-family-share-high',
      message: 'Column-proportional feature families make up more than the configured share.',
      value: columnShare,
      limit: maxColumnFamilyShare,
    });
  }

  const largest = shares.reduce(
    (current, entry) => entry.share > current.share ? entry : current,
    { family: 'other' as WorksheetFormatFeatureFamily, count: 0, share: 0 },
  );
  if (largest.share > maxSingleFamilyShare) {
    warnings.push({
      code: 'single-family-share-high',
      message: `Feature family "${largest.family}" exceeds the configured share.`,
      value: largest.share,
      limit: maxSingleFamilyShare,
    });
  }

  return { match, warnings };
}

function fromCurrentMatcher(
  observationFeatures: readonly string[],
  prototypes: readonly FormatPrototype[],
  options: FormatMatchOptions,
): WorksheetFormatOfflineMatch {
  const current = matchFormatObservation(observationFeatures, prototypes, options);
  return {
    strategy: 'flat',
    status: current.status,
    ...(current.winner ? { winner: { ...current.winner, strategy: 'flat' as const } } : {}),
    candidates: current.candidates.map((candidate) => ({
      ...candidate,
      strategy: 'flat' as const,
    })),
    noveltyScore: current.noveltyScore,
  };
}

function scoreAlternative(
  strategy: Exclude<WorksheetFormatOfflineScoringStrategy, 'flat'>,
  observationFeatures: readonly string[],
  prototypes: readonly FormatPrototype[],
  options: WorksheetFormatOfflineScoringOptions,
): WorksheetFormatOfflineMatch {
  const observation = normalizeFormatFeatures(observationFeatures);
  if (observation.length === 0 || prototypes.length === 0) {
    return { strategy, status: 'novel', candidates: [], noveltyScore: 1 };
  }

  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minWinnerMargin = options.minWinnerMargin ?? DEFAULT_MIN_WINNER_MARGIN;
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const columnFamilyCap = options.columnFamilyCap ?? DEFAULT_COLUMN_FAMILY_CAP;

  if (!Number.isInteger(columnFamilyCap) || columnFamilyCap <= 0) {
    throw new Error('columnFamilyCap must be a positive integer.');
  }

  const observationSignature = createSparseFormatSignature(observation, options);
  const candidates = prototypes.map((prototype) => {
    const prototypeFeatures = normalizeFormatFeatures(prototype.features);
    if (!prototype.id.trim()) {
      throw new Error('Format prototype id must not be empty.');
    }
    if (prototypeFeatures.length === 0) {
      throw new Error(
        `Format prototype "${prototype.id}" must contain at least one feature.`,
      );
    }

    const prototypeSignature = createSparseFormatSignature(prototypeFeatures, options);
    const sparseSimilarity = jaccardSimilarity(
      observationSignature.activeIndices,
      prototypeSignature.activeIndices,
    );
    const featureSimilarity = strategy === 'family-normalized'
      ? familyNormalizedSimilarity(observation, prototypeFeatures)
      : columnFamilyCappedSimilarity(observation, prototypeFeatures, columnFamilyCap);
    const confidence = roundScore(
      (featureSimilarity * 0.7) + (sparseSimilarity * 0.3),
    );

    return {
      strategy,
      prototypeId: prototype.id,
      confidence,
      deviationScore: roundScore(1 - featureSimilarity),
      sparseSimilarity: roundScore(sparseSimilarity),
      featureSimilarity: roundScore(featureSimilarity),
    } satisfies WorksheetFormatOfflineCandidate;
  }).sort((left, right) =>
    right.confidence - left.confidence
      || left.deviationScore - right.deviationScore
      || left.prototypeId.localeCompare(right.prototypeId),
  );

  const best = candidates[0];
  const second = candidates[1];
  const visibleCandidates = candidates.slice(0, maxCandidates);
  const noveltyScore = roundScore(1 - best.confidence);

  if (best.confidence < minConfidence) {
    return { strategy, status: 'novel', candidates: visibleCandidates, noveltyScore };
  }
  if (
    second
    && roundScore(best.confidence - second.confidence) < minWinnerMargin
  ) {
    return { strategy, status: 'ambiguous', candidates: visibleCandidates, noveltyScore };
  }
  return {
    strategy,
    status: 'matched',
    winner: best,
    candidates: visibleCandidates,
    noveltyScore,
  };
}

function familyNormalizedSimilarity(
  observation: readonly string[],
  prototype: readonly string[],
): number {
  const activeFamilies = activeFamilyUnion(observation, prototype);
  if (activeFamilies.length === 0) return 1;

  const total = activeFamilies.reduce(
    (sum, family) => sum + familySimilarity(observation, prototype, family),
    0,
  );
  return total / activeFamilies.length;
}

function columnFamilyCappedSimilarity(
  observation: readonly string[],
  prototype: readonly string[],
  cap: number,
): number {
  const activeFamilies = activeFamilyUnion(observation, prototype);
  if (activeFamilies.length === 0) return 1;

  let weightedSimilarity = 0;
  let totalWeight = 0;
  for (const family of activeFamilies) {
    const observationFamily = familyFeatures(observation, family);
    const prototypeFamily = familyFeatures(prototype, family);
    const unionCount = new Set([
      ...observationFamily,
      ...prototypeFamily,
    ]).size;
    const weight = (
      family === 'semantic-label' || family === 'relative-position'
    )
      ? Math.min(unionCount, cap)
      : unionCount;

    weightedSimilarity +=
      jaccardSimilarity(observationFamily, prototypeFamily) * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 1 : weightedSimilarity / totalWeight;
}

function activeFamilyUnion(
  observation: readonly string[],
  prototype: readonly string[],
): WorksheetFormatFeatureFamily[] {
  const families = new Set<WorksheetFormatFeatureFamily>();
  for (const feature of [...observation, ...prototype]) {
    families.add(classifyWorksheetFormatFeature(feature));
  }
  return WORKSHEET_FORMAT_FEATURE_FAMILIES
    .filter((family) => families.has(family));
}

function familySimilarity(
  observation: readonly string[],
  prototype: readonly string[],
  family: WorksheetFormatFeatureFamily,
): number {
  return jaccardSimilarity(
    familyFeatures(observation, family),
    familyFeatures(prototype, family),
  );
}

function familyFeatures(
  features: readonly string[],
  family: WorksheetFormatFeatureFamily,
): string[] {
  return normalizeFormatFeatures(features)
    .filter((feature) => classifyWorksheetFormatFeature(feature) === family);
}

function jaccardSimilarity<T extends string | number>(
  left: readonly T[],
  right: readonly T[],
): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 && rightSet.size === 0) return 1;

  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
