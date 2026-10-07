import type {
  CandidateReviewObservation,
  CandidateReviewAdjustmentAggregate,
} from '../application/candidateReviewObservation.js';

export const CANDIDATE_REVIEW_PRODUCT_BASELINE_SCHEMA =
  'mmi.candidate-review-product-baseline/v1' as const;

export type ProductBaselineConditionClass =
  | 'current-product-baseline'
  | 'assisted';

export interface ProductBaselineSafetyCounts {
  sourceMutation: number;
  failedImportResidue: number;
  staleAcceptanceInheritance: number;
  inferredToObservedPromotion: number;
  workspaceEscape: number;
}

export interface ProductBaselineSafetyEvidence {
  counts: ProductBaselineSafetyCounts;
  /**
   * References to the tests, reports, or run artifacts that produced the
   * counts. These strings are provenance, not authority.
   */
  evidenceRefs: readonly string[];
}

export interface CandidateReviewProductRun {
  conditionId: string;
  conditionClass: ProductBaselineConditionClass;
  fixtureCohort: string;
  protocolId: string;
  observations: readonly CandidateReviewObservation[];
  safety: ProductBaselineSafetyEvidence;
}

export interface ProductBaselineAdjustmentAggregate
  extends CandidateReviewAdjustmentAggregate {}

export interface CandidateReviewProductBaseline {
  schema: typeof CANDIDATE_REVIEW_PRODUCT_BASELINE_SCHEMA;
  condition: {
    id: string;
    class: ProductBaselineConditionClass;
  };
  fixtureCohort: string;
  protocolId: string;
  sessions: number;
  work: {
    durationMs: number;
    selectedCandidates: number;
    reviewStateTransitions: number;
    toAccepted: number;
    toModified: number;
    toRejected: number;
    toDeferred: number;
    toUnreviewed: number;
    newlyImported: number;
    editingInterruptionSessions: number;
    adjustments: {
      table: ProductBaselineAdjustmentAggregate;
      imageAlt: ProductBaselineAdjustmentAggregate;
      total: ProductBaselineAdjustmentAggregate;
    };
  };
  derived: {
    durationMsPerSelectedCandidate: number | null;
    reviewStateTransitionsPerSelectedCandidate: number | null;
    changedSpanCharactersPerModifiedItem: number | null;
  };
  safety: {
    counts: ProductBaselineSafetyCounts;
    violationCount: number;
    passed: boolean;
    evidenceRefs: string[];
    evidenceBacked: boolean;
  };
}

export interface CandidateReviewProductComparison {
  schema: typeof CANDIDATE_REVIEW_PRODUCT_BASELINE_SCHEMA;
  fixtureCohort: string;
  protocolId: string;
  baselineConditionId: string;
  assistedConditionId: string;
  delta: {
    durationMs: number;
    selectedCandidates: number;
    reviewStateTransitions: number;
    newlyImported: number;
    editingInterruptionSessions: number;
    modifiedItems: number;
    changedSpanCharacters: number;
  };
  promotion: {
    eligible: boolean;
    improvedMetrics: string[];
    regressedMetrics: string[];
    reasons: string[];
  };
}

/**
 * Aggregate the content-free CandidateReviewObservation stream already emitted
 * by the current product. The result deliberately drops source label/digest,
 * Candidate identities, ranges, and reviewed text.
 */
export function aggregateCandidateReviewProductRun(
  run: CandidateReviewProductRun,
): CandidateReviewProductBaseline {
  assertText('conditionId', run.conditionId);
  assertText('fixtureCohort', run.fixtureCohort);
  assertText('protocolId', run.protocolId);
  if (
    run.conditionClass !== 'current-product-baseline'
    && run.conditionClass !== 'assisted'
  ) {
    throw new Error('conditionClass must be current-product-baseline or assisted');
  }

  const table = emptyAdjustmentAggregate();
  const imageAlt = emptyAdjustmentAggregate();
  const totals = {
    durationMs: 0,
    selectedCandidates: 0,
    reviewStateTransitions: 0,
    toAccepted: 0,
    toModified: 0,
    toRejected: 0,
    toDeferred: 0,
    toUnreviewed: 0,
    newlyImported: 0,
    editingInterruptionSessions: 0,
  };

  for (const [index, observation] of run.observations.entries()) {
    validateObservation(observation, index);
    totals.durationMs += observation.durationMs;
    totals.selectedCandidates += observation.ui.selectedCount;
    totals.reviewStateTransitions += observation.transitions.reviewStateChanged;
    totals.toAccepted += observation.transitions.toAccepted;
    totals.toModified += observation.transitions.toModified;
    totals.toRejected += observation.transitions.toRejected;
    totals.toDeferred += observation.transitions.toDeferred;
    totals.toUnreviewed += observation.transitions.toUnreviewed;
    totals.newlyImported += observation.transitions.newlyImported;
    totals.editingInterruptionSessions += observation.editingInterruptionProxy;
    addAdjustmentAggregate(table, observation.adjustments.table);
    addAdjustmentAggregate(imageAlt, observation.adjustments.imageAlt);
  }

  const totalAdjustments = emptyAdjustmentAggregate();
  addAdjustmentAggregate(totalAdjustments, table);
  addAdjustmentAggregate(totalAdjustments, imageAlt);

  const safetyCounts = copyAndValidateSafety(run.safety.counts);
  const violationCount = Object.values(safetyCounts)
    .reduce((sum, count) => sum + count, 0);
  if (!Array.isArray(run.safety.evidenceRefs)) {
    throw new Error('safety.evidenceRefs must be an array');
  }
  const evidenceRefs = run.safety.evidenceRefs.map((ref, index) => {
    assertText(`safety.evidenceRefs[${index}]`, ref);
    return ref;
  });

  return {
    schema: CANDIDATE_REVIEW_PRODUCT_BASELINE_SCHEMA,
    condition: {
      id: run.conditionId,
      class: run.conditionClass,
    },
    fixtureCohort: run.fixtureCohort,
    protocolId: run.protocolId,
    sessions: run.observations.length,
    work: {
      ...totals,
      adjustments: {
        table,
        imageAlt,
        total: totalAdjustments,
      },
    },
    derived: {
      durationMsPerSelectedCandidate: divideOrNull(
        totals.durationMs,
        totals.selectedCandidates,
      ),
      reviewStateTransitionsPerSelectedCandidate: divideOrNull(
        totals.reviewStateTransitions,
        totals.selectedCandidates,
      ),
      changedSpanCharactersPerModifiedItem: divideOrNull(
        totalAdjustments.changedSpanCharacters,
        totalAdjustments.modifiedItems,
      ),
    },
    safety: {
      counts: safetyCounts,
      violationCount,
      passed: violationCount === 0,
      evidenceRefs,
      evidenceBacked: evidenceRefs.length > 0,
    },
  };
}

/**
 * Compare the existing deterministic product path with one assisted condition.
 *
 * This first policy is intentionally conservative:
 * - both runs must use the same declared cohort/protocol and session count;
 * - both safety sets must be zero and have evidence references;
 * - the assisted condition may not import fewer newly useful Candidates;
 * - duration, presented work, state transitions, interruptions, and correction
 *   burden may not regress;
 * - at least one of those work metrics must improve.
 *
 * The function is a promotion gate for an experiment, not a statistical claim
 * of significance.
 */
export function compareCandidateReviewProductBaseline(
  baseline: CandidateReviewProductBaseline,
  assisted: CandidateReviewProductBaseline,
): CandidateReviewProductComparison {
  if (baseline.condition.class !== 'current-product-baseline') {
    throw new Error('baseline condition must be current-product-baseline');
  }
  if (assisted.condition.class !== 'assisted') {
    throw new Error('assisted condition must be assisted');
  }
  if (baseline.fixtureCohort !== assisted.fixtureCohort) {
    throw new Error('fixture cohort mismatch');
  }
  if (baseline.protocolId !== assisted.protocolId) {
    throw new Error('evaluation protocol mismatch');
  }

  const baselineModified = baseline.work.adjustments.total.modifiedItems;
  const assistedModified = assisted.work.adjustments.total.modifiedItems;
  const baselineChanged = baseline.work.adjustments.total.changedSpanCharacters;
  const assistedChanged = assisted.work.adjustments.total.changedSpanCharacters;

  const deltas = {
    durationMs: assisted.work.durationMs - baseline.work.durationMs,
    selectedCandidates:
      assisted.work.selectedCandidates - baseline.work.selectedCandidates,
    reviewStateTransitions:
      assisted.work.reviewStateTransitions - baseline.work.reviewStateTransitions,
    newlyImported: assisted.work.newlyImported - baseline.work.newlyImported,
    editingInterruptionSessions:
      assisted.work.editingInterruptionSessions
      - baseline.work.editingInterruptionSessions,
    modifiedItems: assistedModified - baselineModified,
    changedSpanCharacters: assistedChanged - baselineChanged,
  };

  const reasons: string[] = [];
  const improvedMetrics: string[] = [];
  const regressedMetrics: string[] = [];

  if (baseline.sessions === 0 || assisted.sessions === 0) {
    reasons.push('both conditions need at least one observed session');
  }
  if (baseline.sessions !== assisted.sessions) {
    reasons.push('controlled comparison requires the same session count');
  }
  if (!baseline.safety.passed || !assisted.safety.passed) {
    reasons.push('safety violations are non-compensatory');
  }
  if (!baseline.safety.evidenceBacked || !assisted.safety.evidenceBacked) {
    reasons.push('safety counts need explicit evidence references');
  }
  if (deltas.newlyImported < 0) {
    reasons.push('assisted condition imported fewer newly useful Candidates');
    regressedMetrics.push('newlyImported');
  }

  const lowerIsBetter: Array<[string, number]> = [
    ['durationMs', deltas.durationMs],
    ['selectedCandidates', deltas.selectedCandidates],
    ['reviewStateTransitions', deltas.reviewStateTransitions],
    ['editingInterruptionSessions', deltas.editingInterruptionSessions],
    ['modifiedItems', deltas.modifiedItems],
    ['changedSpanCharacters', deltas.changedSpanCharacters],
  ];
  for (const [name, delta] of lowerIsBetter) {
    if (delta < 0) improvedMetrics.push(name);
    if (delta > 0) regressedMetrics.push(name);
  }

  if (regressedMetrics.some((name) => name !== 'newlyImported')) {
    reasons.push(
      'assisted condition regressed at least one predeclared work metric',
    );
  }
  if (improvedMetrics.length === 0) {
    reasons.push('assisted condition did not improve a predeclared work metric');
  }

  return {
    schema: CANDIDATE_REVIEW_PRODUCT_BASELINE_SCHEMA,
    fixtureCohort: baseline.fixtureCohort,
    protocolId: baseline.protocolId,
    baselineConditionId: baseline.condition.id,
    assistedConditionId: assisted.condition.id,
    delta: deltas,
    promotion: {
      eligible: reasons.length === 0,
      improvedMetrics,
      regressedMetrics: [...new Set(regressedMetrics)],
      reasons,
    },
  };
}

function validateObservation(
  observation: CandidateReviewObservation,
  index: number,
): void {
  if (observation.schema !== 'mmi.candidate-review-observation/v2') {
    throw new Error(`observation ${index} uses unsupported schema`);
  }
  const values = [
    observation.durationMs,
    observation.ui.selectedCount,
    observation.transitions.reviewStateChanged,
    observation.transitions.toAccepted,
    observation.transitions.toModified,
    observation.transitions.toRejected,
    observation.transitions.toDeferred,
    observation.transitions.toUnreviewed,
    observation.transitions.newlyImported,
    observation.editingInterruptionProxy,
  ];
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`observation ${index} contains invalid work counts`);
    }
  }
  if (
    observation.editingInterruptionProxy !== 0
    && observation.editingInterruptionProxy !== 1
  ) {
    throw new Error(
      `observation ${index} editingInterruptionProxy must be 0 or 1`,
    );
  }
  const transitionSum =
    observation.transitions.toAccepted
    + observation.transitions.toModified
    + observation.transitions.toRejected
    + observation.transitions.toDeferred
    + observation.transitions.toUnreviewed;
  if (transitionSum !== observation.transitions.reviewStateChanged) {
    throw new Error(
      `observation ${index} review transition counts are inconsistent`,
    );
  }
  for (const aggregate of [
    observation.adjustments.table,
    observation.adjustments.imageAlt,
  ]) {
    validateAdjustmentAggregate(aggregate, `observation ${index}`);
  }
}

function copyAndValidateSafety(
  counts: ProductBaselineSafetyCounts,
): ProductBaselineSafetyCounts {
  if (!counts || typeof counts !== 'object') {
    throw new Error('safety counts are required');
  }
  const names: Array<keyof ProductBaselineSafetyCounts> = [
    'sourceMutation',
    'failedImportResidue',
    'staleAcceptanceInheritance',
    'inferredToObservedPromotion',
    'workspaceEscape',
  ];
  for (const name of names) {
    const value = counts[name];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`safety count ${name} must be a non-negative integer`);
    }
  }
  return {
    sourceMutation: counts.sourceMutation,
    failedImportResidue: counts.failedImportResidue,
    staleAcceptanceInheritance: counts.staleAcceptanceInheritance,
    inferredToObservedPromotion: counts.inferredToObservedPromotion,
    workspaceEscape: counts.workspaceEscape,
  };
}

function emptyAdjustmentAggregate(): ProductBaselineAdjustmentAggregate {
  return {
    modifiedItems: 0,
    originalCharacters: 0,
    reviewedCharacters: 0,
    changedSpanCharacters: 0,
  };
}

function addAdjustmentAggregate(
  target: ProductBaselineAdjustmentAggregate,
  value: CandidateReviewAdjustmentAggregate,
): void {
  validateAdjustmentAggregate(value, 'review adjustment');
  target.modifiedItems += value.modifiedItems;
  target.originalCharacters += value.originalCharacters;
  target.reviewedCharacters += value.reviewedCharacters;
  target.changedSpanCharacters += value.changedSpanCharacters;
}

function validateAdjustmentAggregate(
  value: CandidateReviewAdjustmentAggregate,
  name: string,
): void {
  for (const count of [
    value.modifiedItems,
    value.originalCharacters,
    value.reviewedCharacters,
    value.changedSpanCharacters,
  ]) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${name} counts must be non-negative integers`);
    }
  }
}

function divideOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function assertText(name: string, value: string): void {
  if (!value.trim()) throw new Error(`${name} must be a non-empty string`);
}
