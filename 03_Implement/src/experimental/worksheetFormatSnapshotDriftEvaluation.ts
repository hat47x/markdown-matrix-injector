import type { FormatMatchOptions } from './flyInspiredFormatMatcher.js';
import type { WorksheetFormatSnapshot } from './worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  type WorksheetFormatPrototype,
  type WorksheetFormatSourceProfile,
} from './worksheetFormatPrototype.js';
import {
  evaluateWorksheetFormatDriftSignals,
  type WorksheetFormatDriftEvaluationCase,
  type WorksheetFormatDriftSignalEvaluation,
  type WorksheetFormatDriftSignalOptions,
} from './worksheetFormatMultiFamilyDriftEvaluation.js';
import type {
  WorksheetFormatBalanceGateOptions,
} from './worksheetFormatScoringStrategyComparison.js';

export interface WorksheetFormatSnapshotDriftPrototype {
  id: string;
  snapshot: WorksheetFormatSnapshot;
}

export interface WorksheetFormatSnapshotDriftCase {
  id: string;
  expectedReview: boolean;
  observationSnapshot: WorksheetFormatSnapshot;
  prototypeSnapshots: readonly WorksheetFormatSnapshotDriftPrototype[];
  sourceProfile: WorksheetFormatSourceProfile;
  matchOptions?: FormatMatchOptions;
  gateOptions?: WorksheetFormatBalanceGateOptions;
}

export interface WorksheetFormatMaterializedDriftCase {
  id: string;
  expectedReview: boolean;
  sourceProfileId: string;
  sourceEvidence: readonly string[];
  rawObservationFeatures: readonly string[];
  comparedObservationFeatures: readonly string[];
  prototypes: readonly WorksheetFormatPrototype[];
}

export interface WorksheetFormatSnapshotDriftEvaluation {
  materializedCases: readonly WorksheetFormatMaterializedDriftCase[];
  signals: WorksheetFormatDriftSignalEvaluation;
}

/**
 * Runs snapshot-level evaluation through the same adapter, prototype builder,
 * source-profile filter, and matcher boundary used by the experimental
 * worksheet format path.
 *
 * The helper deliberately does not reproduce feature extraction or evidence
 * filtering. It materializes ordinary WorksheetFormatPrototype values and the
 * observation's comparedFeatures through the existing production-shaped
 * experimental APIs, then delegates signal analysis to the existing
 * evaluation-only drift helper.
 */
export function evaluateWorksheetFormatSnapshotDriftSignals(
  cases: readonly WorksheetFormatSnapshotDriftCase[],
  signalOptions: WorksheetFormatDriftSignalOptions = {},
): WorksheetFormatSnapshotDriftEvaluation {
  const materializedCases: WorksheetFormatMaterializedDriftCase[] = [];
  const driftCases: WorksheetFormatDriftEvaluationCase[] = [];

  for (const entry of cases) {
    if (entry.prototypeSnapshots.length === 0) {
      throw new Error(
        `Snapshot drift evaluation case "${entry.id}" requires at least one prototype.`,
      );
    }

    const prototypes = entry.prototypeSnapshots.map((prototype) =>
      createWorksheetFormatPrototype(
        prototype.id,
        prototype.snapshot,
        entry.sourceProfile,
      ));

    const snapshotMatch = matchWorksheetFormatSnapshot(
      entry.observationSnapshot,
      prototypes,
      entry.sourceProfile,
      entry.matchOptions ?? {},
    );

    materializedCases.push({
      id: entry.id,
      expectedReview: entry.expectedReview,
      sourceProfileId: snapshotMatch.sourceProfileId,
      sourceEvidence: snapshotMatch.sourceEvidence,
      rawObservationFeatures: snapshotMatch.observation.features,
      comparedObservationFeatures: snapshotMatch.comparedFeatures,
      prototypes,
    });

    driftCases.push({
      id: entry.id,
      expectedReview: entry.expectedReview,
      observationFeatures: snapshotMatch.comparedFeatures,
      prototypes,
      matchOptions: entry.matchOptions,
      gateOptions: entry.gateOptions,
    });
  }

  return {
    materializedCases,
    signals: evaluateWorksheetFormatDriftSignals(driftCases, signalOptions),
  };
}
