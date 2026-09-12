import {
  matchFormatObservation,
  type FormatMatchOptions,
  type FormatMatchResult,
  type FormatPrototype,
} from './flyInspiredFormatMatcher.js';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatFeatureObservation,
  type WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';

export const WORKSHEET_FORMAT_FEATURE_VERSION = 'worksheet-format-v1' as const;

export type WorksheetFormatEvidenceKind = 'structure' | 'fill' | 'border';

export interface WorksheetFormatSourceProfile {
  id: string;
  evidence: readonly WorksheetFormatEvidenceKind[];
}

/**
 * Conservative profile for XLSX parsed by SheetJS CE 0.20.3.
 * Structural data and fill evidence are part of the comparison contract;
 * border evidence is deliberately excluded until runtime evidence proves it.
 */
export const SHEETJS_CE_XLSX_0203_SOURCE_PROFILE: WorksheetFormatSourceProfile = Object.freeze({
  id: 'sheetjs-ce-xlsx-0.20.3-fill-v1',
  evidence: Object.freeze(['structure', 'fill'] as const),
});

export interface WorksheetFormatPrototype extends FormatPrototype {
  featureVersion: typeof WORKSHEET_FORMAT_FEATURE_VERSION;
  sourceProfileId: string;
  sourceEvidence: readonly WorksheetFormatEvidenceKind[];
}

export interface WorksheetFormatSnapshotMatch {
  featureVersion: typeof WORKSHEET_FORMAT_FEATURE_VERSION;
  sourceProfileId: string;
  sourceEvidence: readonly WorksheetFormatEvidenceKind[];
  observation: WorksheetFormatFeatureObservation;
  match: FormatMatchResult;
}

/**
 * Creates a prototype from the exact same feature adapter used for observations.
 * A prototype must never be hand-trimmed to a few convenient features because
 * asymmetric feature sets distort Jaccard-based deviation scores.
 */
export function createWorksheetFormatPrototype(
  id: string,
  snapshot: WorksheetFormatSnapshot,
  sourceProfile: WorksheetFormatSourceProfile,
): WorksheetFormatPrototype {
  const normalizedId = id.trim();
  const profile = normalizeSourceProfile(sourceProfile);
  if (!normalizedId) throw new Error('Worksheet format prototype id must not be empty.');

  const observation = extractWorksheetFormatFeatures(snapshot);
  if (observation.features.length === 0) {
    throw new Error(`Worksheet format prototype "${normalizedId}" has no observable format features.`);
  }

  return {
    id: normalizedId,
    features: [...observation.features],
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: profile.id,
    sourceEvidence: profile.evidence,
  };
}

/**
 * Matches only prototypes produced by the same adapter version and source
 * profile. Mixing SheetJS CE XLSX observations with synthetic/full-style
 * prototypes is rejected rather than silently inflating deviation scores.
 */
export function matchWorksheetFormatSnapshot(
  snapshot: WorksheetFormatSnapshot,
  prototypes: readonly WorksheetFormatPrototype[],
  sourceProfile: WorksheetFormatSourceProfile,
  options: FormatMatchOptions = {},
): WorksheetFormatSnapshotMatch {
  const profile = normalizeSourceProfile(sourceProfile);

  for (const prototype of prototypes) {
    if (prototype.featureVersion !== WORKSHEET_FORMAT_FEATURE_VERSION) {
      throw new Error(`Incompatible worksheet format feature version for prototype "${prototype.id}".`);
    }
    if (prototype.sourceProfileId !== profile.id || !sameEvidence(prototype.sourceEvidence, profile.evidence)) {
      throw new Error(`Incompatible worksheet format source profile for prototype "${prototype.id}".`);
    }
  }

  const observation = extractWorksheetFormatFeatures(snapshot);
  return {
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: profile.id,
    sourceEvidence: profile.evidence,
    observation,
    match: matchFormatObservation(observation.features, prototypes, options),
  };
}

function normalizeSourceProfile(sourceProfile: WorksheetFormatSourceProfile): {
  id: string;
  evidence: WorksheetFormatEvidenceKind[];
} {
  const id = sourceProfile.id.trim();
  if (!id) throw new Error('Worksheet format source profile id must not be empty.');
  if (!Array.isArray(sourceProfile.evidence) || sourceProfile.evidence.length === 0) {
    throw new Error('Worksheet format source profile must declare at least one evidence kind.');
  }
  const allowed = new Set<WorksheetFormatEvidenceKind>(['structure', 'fill', 'border']);
  const evidence = [...new Set(sourceProfile.evidence)];
  for (const value of evidence) {
    if (!allowed.has(value)) throw new Error(`Unsupported worksheet format evidence kind: ${String(value)}.`);
  }
  return { id, evidence: evidence.sort() };
}

function sameEvidence(left: readonly WorksheetFormatEvidenceKind[], right: readonly WorksheetFormatEvidenceKind[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
