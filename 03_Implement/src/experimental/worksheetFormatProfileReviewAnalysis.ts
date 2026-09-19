import {
  normalizeFormatFeatures,
  type FormatMatchOptions,
} from './flyInspiredFormatMatcher.js';
import {
  formatProfileToWorksheetPrototype,
  type FormatProfileV1,
} from './formatProfile.js';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import {
  filterWorksheetFormatFeaturesByEvidence,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
  WORKSHEET_FORMAT_STRUCTURE_ONLY_SOURCE_PROFILE,
  type WorksheetFormatPrototype,
  type WorksheetFormatSnapshotMatch,
} from './worksheetFormatPrototype.js';
import type {
  WorksheetFormatFillEvidenceCaseResult,
  WorksheetFormatFillEvidencePathResult,
} from './worksheetFormatFillEvidenceEvaluation.js';
import {
  classifyWorksheetFormatFillReview,
  createWorksheetFormatFillReviewAnalysisResult,
  meaningfulHeaderFillFromFeatures,
  type WorksheetFormatFillReviewAnalysis,
  type WorksheetFormatFillReviewAnalysisResult,
} from './worksheetFormatFillReviewAnalysis.js';

export interface WorksheetFormatProfileReviewAnalysisCase {
  id: string;
  observationSnapshot: WorksheetFormatSnapshot;
  approvedProfiles: readonly FormatProfileV1[];
  matchOptions?: FormatMatchOptions;
}

export function analyzeWorksheetFormatFillReviewFromProfiles(
  cases: readonly WorksheetFormatProfileReviewAnalysisCase[],
): WorksheetFormatFillReviewAnalysis {
  return {
    cases: cases.map(analyzeCase),
  };
}

function analyzeCase(
  entry: WorksheetFormatProfileReviewAnalysisCase,
): WorksheetFormatFillReviewAnalysisResult {
  if (entry.approvedProfiles.length === 0) {
    throw new Error(
      `Profile-backed fill review case "${entry.id}" requires at least one approved Format Profile.`,
    );
  }

  const fillPrototypes = entry.approvedProfiles.map((profile) =>
    formatProfileToWorksheetPrototype(
      profile,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    ),
  );
  const structureOnlyPrototypes = fillPrototypes.map(
    toStructureOnlyPrototype,
  );

  const withFill = matchWorksheetFormatSnapshot(
    entry.observationSnapshot,
    fillPrototypes,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    entry.matchOptions ?? {},
  );
  const structureOnly = matchWorksheetFormatSnapshot(
    entry.observationSnapshot,
    structureOnlyPrototypes,
    WORKSHEET_FORMAT_STRUCTURE_ONLY_SOURCE_PROFILE,
    entry.matchOptions ?? {},
  );

  const paired = toPairedResult(entry.id, withFill, structureOnly);
  const structureFeatureSets = structureOnlyPrototypes.map(
    (prototype) => normalizeFormatFeatures(prototype.features),
  );
  const prototypeFills = new Map(
    entry.approvedProfiles.map((profile) => [
      profile.id,
      meaningfulHeaderFillFromFeatures(profile.features),
    ]),
  );
  const observationFill = meaningfulHeaderFillFromFeatures(
    extractWorksheetFormatFeatures(entry.observationSnapshot).features,
  );

  const telemetry = classifyWorksheetFormatFillReview(paired, {
    observationFill,
    prototypeFills,
    structurallyEquivalentPrototypes:
      allFeatureSetsEqual(structureFeatureSets),
  });

  return createWorksheetFormatFillReviewAnalysisResult(
    paired,
    telemetry,
  );
}

function toStructureOnlyPrototype(
  prototype: WorksheetFormatPrototype,
): WorksheetFormatPrototype {
  const features = filterWorksheetFormatFeaturesByEvidence(
    prototype.features,
    WORKSHEET_FORMAT_STRUCTURE_ONLY_SOURCE_PROFILE.evidence,
  );
  if (features.length === 0) {
    throw new Error(
      `Format Profile "${prototype.id}" has no structure-only features.`,
    );
  }

  return {
    id: prototype.id,
    features,
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId:
      WORKSHEET_FORMAT_STRUCTURE_ONLY_SOURCE_PROFILE.id,
    sourceEvidence: [
      ...WORKSHEET_FORMAT_STRUCTURE_ONLY_SOURCE_PROFILE.evidence,
    ],
  };
}

function toPairedResult(
  id: string,
  withFillMatch: WorksheetFormatSnapshotMatch,
  structureOnlyMatch: WorksheetFormatSnapshotMatch,
): WorksheetFormatFillEvidenceCaseResult {
  const withFill = projectPath(withFillMatch);
  const structureOnly = projectPath(structureOnlyMatch);
  const topConfidenceDelta =
    withFill.topConfidence === undefined
    || structureOnly.topConfidence === undefined
      ? undefined
      : roundScore(
          withFill.topConfidence - structureOnly.topConfidence,
        );

  return {
    id,
    withFill,
    structureOnly,
    ...(topConfidenceDelta === undefined
      ? {}
      : { topConfidenceDelta }),
    statusChanged: withFill.match.status !== structureOnly.match.status,
  };
}

function projectPath(
  result: WorksheetFormatSnapshotMatch,
): WorksheetFormatFillEvidencePathResult {
  const top = result.match.candidates[0];
  const second = result.match.candidates[1];

  return {
    sourceProfileId: result.sourceProfileId,
    comparedFeatureCount: result.comparedFeatures.length,
    match: result.match,
    ...(top === undefined
      ? {}
      : {
          topPrototypeId: top.prototypeId,
          topConfidence: top.confidence,
        }),
    ...(top === undefined || second === undefined
      ? {}
      : {
          topTwoMargin: roundScore(
            top.confidence - second.confidence,
          ),
        }),
  };
}

function allFeatureSetsEqual(
  featureSets: readonly (readonly string[])[],
): boolean {
  const first = featureSets[0];
  if (!first) return false;
  return featureSets.every(
    (features) =>
      features.length === first.length
      && features.every(
        (feature, index) => feature === first[index],
      ),
  );
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
