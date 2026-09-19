import type {
  FormatMatchOptions,
  FormatMatchResult,
} from './flyInspiredFormatMatcher.js';
import type {
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  type WorksheetFormatSourceProfile,
} from './worksheetFormatPrototype.js';

export interface WorksheetFormatFillEvidencePrototype {
  id: string;
  snapshot: WorksheetFormatSnapshot;
}

export interface WorksheetFormatFillEvidenceCase {
  id: string;
  observationSnapshot: WorksheetFormatSnapshot;
  prototypeSnapshots: readonly WorksheetFormatFillEvidencePrototype[];
  matchOptions?: FormatMatchOptions;
}

export interface WorksheetFormatFillEvidencePathResult {
  sourceProfileId: string;
  comparedFeatureCount: number;
  match: FormatMatchResult;
  topPrototypeId?: string;
  topConfidence?: number;
  topTwoMargin?: number;
}

export interface WorksheetFormatFillEvidenceCaseResult {
  id: string;
  withFill: WorksheetFormatFillEvidencePathResult;
  structureOnly: WorksheetFormatFillEvidencePathResult;
  topConfidenceDelta?: number;
  statusChanged: boolean;
}

export interface WorksheetFormatFillEvidenceEvaluation {
  cases: readonly WorksheetFormatFillEvidenceCaseResult[];
}

export const WORKSHEET_FORMAT_FILL_EVALUATION_STRUCTURE_ONLY_PROFILE:
  WorksheetFormatSourceProfile = Object.freeze({
    id: 'worksheet-fill-eval-structure-only-v1',
    evidence: Object.freeze(['structure'] as const),
  });

/**
 * Replays the same snapshots twice:
 *
 * 1. with the conservative SheetJS structure+fill profile
 * 2. with structure-only evidence
 *
 * This is an evaluation helper. It does not permit cross-profile prototype
 * comparison and does not change runtime matching behavior. Each path creates
 * its own prototypes through the ordinary adapter/profile boundary.
 */
export function evaluateWorksheetFormatFillEvidence(
  cases: readonly WorksheetFormatFillEvidenceCase[],
  fillProfile: WorksheetFormatSourceProfile =
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  structureOnlyProfile: WorksheetFormatSourceProfile =
    WORKSHEET_FORMAT_FILL_EVALUATION_STRUCTURE_ONLY_PROFILE,
): WorksheetFormatFillEvidenceEvaluation {
  return {
    cases: cases.map((entry) => {
      if (entry.prototypeSnapshots.length === 0) {
        throw new Error(
          `Fill evidence evaluation case "${entry.id}" requires at least one prototype.`,
        );
      }

      const withFill = evaluatePath(entry, fillProfile);
      const structureOnly = evaluatePath(entry, structureOnlyProfile);
      const topConfidenceDelta =
        withFill.topConfidence === undefined
        || structureOnly.topConfidence === undefined
          ? undefined
          : roundScore(withFill.topConfidence - structureOnly.topConfidence);

      return {
        id: entry.id,
        withFill,
        structureOnly,
        ...(topConfidenceDelta === undefined ? {} : { topConfidenceDelta }),
        statusChanged: withFill.match.status !== structureOnly.match.status,
      };
    }),
  };
}

function evaluatePath(
  entry: WorksheetFormatFillEvidenceCase,
  sourceProfile: WorksheetFormatSourceProfile,
): WorksheetFormatFillEvidencePathResult {
  const prototypes = entry.prototypeSnapshots.map((prototype) =>
    createWorksheetFormatPrototype(
      prototype.id,
      prototype.snapshot,
      sourceProfile,
    ));

  const result = matchWorksheetFormatSnapshot(
    entry.observationSnapshot,
    prototypes,
    sourceProfile,
    entry.matchOptions ?? {},
  );
  const top = result.match.candidates[0];
  const second = result.match.candidates[1];

  return {
    sourceProfileId: result.sourceProfileId,
    comparedFeatureCount: result.comparedFeatures.length,
    match: result.match,
    ...(top ? {
      topPrototypeId: top.prototypeId,
      topConfidence: top.confidence,
    } : {}),
    ...(top && second ? {
      topTwoMargin: roundScore(top.confidence - second.confidence),
    } : {}),
  };
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
