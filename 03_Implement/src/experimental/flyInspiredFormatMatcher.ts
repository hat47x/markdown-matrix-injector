export type FormatMatchStatus = 'matched' | 'ambiguous' | 'novel';

export interface FormatPrototype {
  id: string;
  features: readonly string[];
}

export interface SparseFormatSignature {
  dimensions: number;
  activeIndices: readonly number[];
}

export interface FormatCandidate {
  prototypeId: string;
  confidence: number;
  deviationScore: number;
  sparseSimilarity: number;
  featureSimilarity: number;
}

export interface FormatMatchResult {
  status: FormatMatchStatus;
  winner?: FormatCandidate;
  candidates: readonly FormatCandidate[];
  noveltyScore: number;
}

export interface FormatMatchOptions {
  dimensions?: number;
  activeBits?: number;
  projectionsPerFeature?: number;
  minConfidence?: number;
  minWinnerMargin?: number;
  maxCandidates?: number;
}

interface ResolvedOptions {
  dimensions: number;
  activeBits: number;
  projectionsPerFeature: number;
  minConfidence: number;
  minWinnerMargin: number;
  maxCandidates: number;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  dimensions: 512,
  activeBits: 32,
  projectionsPerFeature: 4,
  minConfidence: 0.7,
  minWinnerMargin: 0.05,
  maxCandidates: 3,
};

/**
 * Normalizes already-abstracted format features for deterministic comparison.
 * This module deliberately does not inspect files, workbooks, cells, or styles.
 */
export function normalizeFormatFeatures(features: readonly string[]): string[] {
  return [...new Set(features.map((feature) => feature.normalize('NFKC').trim()).filter(Boolean))].sort();
}

/**
 * FlyHash-inspired deterministic sparse projection.
 *
 * Each feature activates several stable buckets in a larger space. A global
 * winner-take-all step keeps only the strongest buckets. This captures the
 * computational properties useful for candidate retrieval without claiming
 * biological fidelity or requiring randomness, learning, or external models.
 */
export function createSparseFormatSignature(
  features: readonly string[],
  options: FormatMatchOptions = {},
): SparseFormatSignature {
  const resolved = resolveOptions(options);
  const normalized = normalizeFormatFeatures(features);
  if (normalized.length === 0) {
    return { dimensions: resolved.dimensions, activeIndices: [] };
  }

  const activations = new Map<number, number>();
  for (const feature of normalized) {
    for (let projection = 0; projection < resolved.projectionsPerFeature; projection += 1) {
      const index = stableHash(`${feature}\u0000${projection}`) % resolved.dimensions;
      activations.set(index, (activations.get(index) ?? 0) + 1);
    }
  }

  const activeIndices = [...activations.entries()]
    .sort(([leftIndex, leftCount], [rightIndex, rightCount]) => rightCount - leftCount || leftIndex - rightIndex)
    .slice(0, Math.min(resolved.activeBits, activations.size))
    .map(([index]) => index)
    .sort((left, right) => left - right);

  return { dimensions: resolved.dimensions, activeIndices };
}

/**
 * Ranks known format prototypes without modifying either the observation or
 * the source of truth. Unknown and near-tied observations explicitly stop as
 * `novel` / `ambiguous` rather than being forced into a known format.
 */
export function matchFormatObservation(
  observationFeatures: readonly string[],
  prototypes: readonly FormatPrototype[],
  options: FormatMatchOptions = {},
): FormatMatchResult {
  const resolved = resolveOptions(options);
  const normalizedObservation = normalizeFormatFeatures(observationFeatures);
  if (normalizedObservation.length === 0 || prototypes.length === 0) {
    return { status: 'novel', candidates: [], noveltyScore: 1 };
  }

  const observationSignature = createSparseFormatSignature(normalizedObservation, resolved);
  const candidates = prototypes.map((prototype) => {
    const prototypeFeatures = normalizeFormatFeatures(prototype.features);
    if (!prototype.id.trim()) {
      throw new Error('Format prototype id must not be empty.');
    }
    if (prototypeFeatures.length === 0) {
      throw new Error(`Format prototype "${prototype.id}" must contain at least one feature.`);
    }

    const prototypeSignature = createSparseFormatSignature(prototypeFeatures, resolved);
    const featureSimilarity = jaccardSimilarity(normalizedObservation, prototypeFeatures);
    const sparseSimilarity = jaccardSimilarity(
      observationSignature.activeIndices,
      prototypeSignature.activeIndices,
    );
    const confidence = roundScore((featureSimilarity * 0.7) + (sparseSimilarity * 0.3));

    return {
      prototypeId: prototype.id,
      confidence,
      deviationScore: roundScore(1 - featureSimilarity),
      sparseSimilarity: roundScore(sparseSimilarity),
      featureSimilarity: roundScore(featureSimilarity),
    } satisfies FormatCandidate;
  }).sort((left, right) =>
    right.confidence - left.confidence
      || left.deviationScore - right.deviationScore
      || left.prototypeId.localeCompare(right.prototypeId),
  );

  const best = candidates[0];
  const second = candidates[1];
  const visibleCandidates = candidates.slice(0, resolved.maxCandidates);
  const noveltyScore = roundScore(1 - best.confidence);

  if (best.confidence < resolved.minConfidence) {
    return { status: 'novel', candidates: visibleCandidates, noveltyScore };
  }

  if (second && roundScore(best.confidence - second.confidence) < resolved.minWinnerMargin) {
    return { status: 'ambiguous', candidates: visibleCandidates, noveltyScore };
  }

  return {
    status: 'matched',
    winner: best,
    candidates: visibleCandidates,
    noveltyScore,
  };
}

function resolveOptions(options: FormatMatchOptions): ResolvedOptions {
  const resolved: ResolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  assertPositiveInteger('dimensions', resolved.dimensions);
  assertPositiveInteger('activeBits', resolved.activeBits);
  assertPositiveInteger('projectionsPerFeature', resolved.projectionsPerFeature);
  assertPositiveInteger('maxCandidates', resolved.maxCandidates);
  if (resolved.activeBits > resolved.dimensions) {
    throw new Error('activeBits must not exceed dimensions.');
  }
  assertUnitInterval('minConfidence', resolved.minConfidence);
  assertUnitInterval('minWinnerMargin', resolved.minWinnerMargin);
  return resolved;
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

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function jaccardSimilarity<T extends string | number>(left: readonly T[], right: readonly T[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }

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
