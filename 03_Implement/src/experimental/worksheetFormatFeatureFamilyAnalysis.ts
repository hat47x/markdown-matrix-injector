import {
  matchFormatObservation,
  normalizeFormatFeatures,
  type FormatCandidate,
  type FormatMatchOptions,
  type FormatPrototype,
} from './flyInspiredFormatMatcher.js';

/**
 * Human-readable groups used only to inspect how the current matcher is being
 * influenced by the v6 feature set. These groups do not change matching,
 * feature extraction, source profiles, or production behavior.
 */
export const WORKSHEET_FORMAT_FEATURE_FAMILIES = [
  'semantic-label',
  'relative-position',
  'table-skeleton',
  'body-occupancy',
  'merge-shape',
  'fill',
  'border',
  'other',
] as const;

export type WorksheetFormatFeatureFamily = typeof WORKSHEET_FORMAT_FEATURE_FAMILIES[number];

export interface WorksheetFormatFeatureFamilyShare {
  family: WorksheetFormatFeatureFamily;
  count: number;
  share: number;
}

export interface WorksheetFormatFeatureFamilyAblation {
  family: WorksheetFormatFeatureFamily;
  comparable: boolean;
  baselineConfidence: number;
  ablatedConfidence?: number;
  /**
   * baseline - ablated.
   * Positive: the family supports similarity in this pair.
   * Negative: the family contributes deviation in this pair.
   */
  confidenceDelta?: number;
  baselineFeatureSimilarity: number;
  ablatedFeatureSimilarity?: number;
}

/**
 * Maps a v6 feature string to an analysis family.
 *
 * Classification is deliberately explicit and prefix-based so a contributor
 * can audit it without understanding the sparse projection implementation.
 * Unknown future features fall into `other` rather than being silently
 * assigned to a familiar family.
 */
export function classifyWorksheetFormatFeature(feature: string): WorksheetFormatFeatureFamily {
  const normalized = feature.normalize('NFKC').trim();

  if (
    normalized === 'header:fill-present'
    || (normalized.startsWith('header:') && normalized.endsWith('-fill'))
  ) {
    return 'fill';
  }
  if (normalized.startsWith('border:')) return 'border';
  if (normalized.startsWith('column-position:')) return 'relative-position';
  if (normalized.startsWith('column:')) return 'semantic-label';
  if (normalized.startsWith('layout:body-majority-occupancy:')) return 'body-occupancy';
  if (
    normalized.startsWith('merge:')
    || normalized.includes('horizontal-merge-links:')
  ) {
    return 'merge-shape';
  }
  if (
    normalized.startsWith('region:')
    || normalized.startsWith('layout:')
    || normalized.startsWith('header:')
    || normalized.startsWith('body:')
  ) {
    return 'table-skeleton';
  }
  return 'other';
}

/**
 * Counts how much of one feature vector belongs to each family.
 *
 * This exposes cardinality effects such as `column:*` and
 * `column-position:*` growing with table width while skeleton features remain
 * mostly fixed in count.
 */
export function summarizeWorksheetFormatFeatureFamilies(
  features: readonly string[],
): WorksheetFormatFeatureFamilyShare[] {
  const normalized = normalizeFormatFeatures(features);
  const counts = new Map<WorksheetFormatFeatureFamily, number>();

  for (const feature of normalized) {
    const family = classifyWorksheetFormatFeature(feature);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  return WORKSHEET_FORMAT_FEATURE_FAMILIES
    .map((family) => ({
      family,
      count: counts.get(family) ?? 0,
      share: normalized.length === 0
        ? 0
        : roundScore((counts.get(family) ?? 0) / normalized.length),
    }))
    .filter((entry) => entry.count > 0);
}

/**
 * Performs a symmetric leave-one-family-out analysis for one known prototype.
 *
 * Both the observation and prototype lose the selected family before the
 * existing matcher is called again. This is an evaluation aid, not a new
 * scoring path. It answers: "for this pair, how much does the current result
 * move when this whole family is absent?"
 *
 * The function intentionally reports candidate confidence even when the
 * normal matcher status is `novel`. That makes near-threshold behavior visible
 * without weakening any gate.
 */
export function evaluateWorksheetFormatFeatureFamilyAblation(
  observationFeatures: readonly string[],
  prototype: FormatPrototype,
  options: FormatMatchOptions = {},
): { baseline: FormatCandidate; families: WorksheetFormatFeatureFamilyAblation[] } {
  const baseline = candidateFor(observationFeatures, prototype, options);
  const families = new Set<WorksheetFormatFeatureFamily>([
    ...normalizeFormatFeatures(observationFeatures).map(classifyWorksheetFormatFeature),
    ...normalizeFormatFeatures(prototype.features).map(classifyWorksheetFormatFeature),
  ]);

  const evaluations = [...families]
    .sort()
    .map((family) => {
      const observation = withoutFamily(observationFeatures, family);
      const prototypeFeatures = withoutFamily(prototype.features, family);

      if (observation.length === 0 || prototypeFeatures.length === 0) {
        return {
          family,
          comparable: false,
          baselineConfidence: baseline.confidence,
          baselineFeatureSimilarity: baseline.featureSimilarity,
        } satisfies WorksheetFormatFeatureFamilyAblation;
      }

      const ablated = candidateFor(
        observation,
        { ...prototype, features: prototypeFeatures },
        options,
      );
      return {
        family,
        comparable: true,
        baselineConfidence: baseline.confidence,
        ablatedConfidence: ablated.confidence,
        confidenceDelta: roundScore(baseline.confidence - ablated.confidence),
        baselineFeatureSimilarity: baseline.featureSimilarity,
        ablatedFeatureSimilarity: ablated.featureSimilarity,
      } satisfies WorksheetFormatFeatureFamilyAblation;
    });

  return { baseline, families: evaluations };
}

function withoutFamily(
  features: readonly string[],
  family: WorksheetFormatFeatureFamily,
): string[] {
  return normalizeFormatFeatures(features)
    .filter((feature) => classifyWorksheetFormatFeature(feature) !== family);
}

function candidateFor(
  features: readonly string[],
  prototype: FormatPrototype,
  options: FormatMatchOptions,
): FormatCandidate {
  const candidate = matchFormatObservation(features, [prototype], options).candidates[0];
  if (!candidate) {
    throw new Error(
      'Feature-family evaluation requires a non-empty comparable observation and prototype.',
    );
  }
  return candidate;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
