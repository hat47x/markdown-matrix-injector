import type {
  CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';
import type {
  CognitiveReviewPresentationV1,
} from './cognitiveReviewPresentation.js';
import type {
  AuthorityVerificationOverlayV1,
} from './authorityVerificationOverlay.js';
import type {
  FormatCandidate,
  FormatMatchResult,
  FormatMatchStatus,
} from './flyInspiredFormatMatcher.js';
import {
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from './worksheetFormatPrototype.js';
import type {
  WorksheetFormatFillReviewAnalysisResult,
  WorksheetFormatFillReviewTelemetryCode,
} from './worksheetFormatFillReviewTelemetry.js';

export const DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION =
  'mmi-deterministic-review-evidence-v1' as const;

export const DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION =
  'mmi-deterministic-review-evidence-surface-v1' as const;

export type DeterministicReviewReasonCategory =
  | 'decision-impact'
  | 'evidence-unavailable'
  | 'diagnostic';

export type DeterministicReviewReasonReviewRole =
  | 'review-relevant'
  | 'diagnostic-only';

export interface DeterministicReviewReasonV1 {
  code: WorksheetFormatFillReviewTelemetryCode;
  category: DeterministicReviewReasonCategory;
  reviewRole: DeterministicReviewReasonReviewRole;
}

export interface DeterministicReviewComparisonPathV1 {
  sourceProfileId: string;
  status: FormatMatchStatus;
  winnerPrototypeId?: string;
  topPrototypeId?: string;
  topConfidence?: number;
  topTwoMargin?: number;
  noveltyScore: number;
}

export interface DeterministicReviewComparisonV1 {
  kind: 'worksheet-format-fill-vs-structure-only';
  primary: DeterministicReviewComparisonPathV1;
  control: DeterministicReviewComparisonPathV1;
}

export interface DeterministicReviewEvidenceProducerV1 {
  kind: 'deterministic-analysis';
  componentId: 'mmi.experimental.worksheet-format-fill-review';
  componentVersion: '1';
  executionBoundary: 'local';
}

export interface DeterministicReviewEvidenceV1 {
  schemaVersion: typeof DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION;
  role: 'deterministic-review-evidence';
  sourceDigest: string;
  featureVersion: typeof WORKSHEET_FORMAT_FEATURE_VERSION;
  sourceProfileId: string;
  sourceEvidence: readonly string[];
  producer: DeterministicReviewEvidenceProducerV1;
  reasons: readonly DeterministicReviewReasonV1[];
  reviewRelevantReasonCount: number;
  diagnosticReasonCount: number;
  comparison: DeterministicReviewComparisonV1;
}

export interface VerifiedReviewSurfaceLike<
  TChoice extends string = string,
> {
  audience: 'human-review';
  review: CognitiveReviewPresentationV1<TChoice>;
  authorityVerification: AuthorityVerificationOverlayV1;
}

export interface DeterministicReviewEvidenceSurfaceV1<
  TChoice extends string = string,
  TSurface extends VerifiedReviewSurfaceLike<TChoice> =
    VerifiedReviewSurfaceLike<TChoice>,
> {
  schemaVersion: typeof DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION;
  audience: 'human-review';
  surface: TSurface;
  deterministicReviewEvidence: DeterministicReviewEvidenceV1;
}

const DECISION_IMPACT_CODES = new Set<WorksheetFormatFillReviewTelemetryCode>([
  'fill-supported-acceptance',
  'fill-supported-disambiguation',
  'fill-induced-ambiguity',
  'fill-induced-rejection',
  'fill-changed-winner',
]);

/**
 * Projects the existing fill-review comparison into a reviewable deterministic
 * evidence artifact.
 *
 * This does not create a Cognitive signal and does not create Authority
 * evidence. The primary fill-aware matcher result must exactly match the Fly
 * Perception payload already present in the Cognitive Review Envelope.
 */
export function createWorksheetFormatDeterministicReviewEvidence<
  TChoice extends string,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  result: WorksheetFormatFillReviewAnalysisResult,
): DeterministicReviewEvidenceV1 {
  assertEnvelopeBinding(envelope, result);

  const reasons = result.telemetry.map(toReason);
  const reviewRelevantReasonCount = reasons.filter(
    (reason) => reason.reviewRole === 'review-relevant',
  ).length;

  return {
    schemaVersion: DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION,
    role: 'deterministic-review-evidence',
    sourceDigest: envelope.sourceDigest,
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: result.withFill.sourceProfileId,
    sourceEvidence: [...envelope.perception.signal.payload.sourceEvidence],
    producer: {
      kind: 'deterministic-analysis',
      componentId: 'mmi.experimental.worksheet-format-fill-review',
      componentVersion: '1',
      executionBoundary: 'local',
    },
    reasons,
    reviewRelevantReasonCount,
    diagnosticReasonCount: reasons.length - reviewRelevantReasonCount,
    comparison: {
      kind: 'worksheet-format-fill-vs-structure-only',
      primary: projectPath(result.withFill),
      control: projectPath(result.structureOnly),
    },
  };
}

/**
 * Wraps an already verified human-review surface with a separate deterministic
 * evidence artifact. Existing Cognitive and Authority schemas remain unchanged.
 */
export function createDeterministicReviewEvidenceSurface<
  TChoice extends string,
  TSurface extends VerifiedReviewSurfaceLike<TChoice>,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  surface: TSurface,
  evidence: DeterministicReviewEvidenceV1,
): DeterministicReviewEvidenceSurfaceV1<TChoice, TSurface> {
  assertSurfaceBinding(envelope, surface, evidence);

  return {
    schemaVersion: DETERMINISTIC_REVIEW_EVIDENCE_SURFACE_SCHEMA_VERSION,
    audience: 'human-review',
    surface,
    deterministicReviewEvidence: evidence,
  };
}

function toReason(
  code: WorksheetFormatFillReviewTelemetryCode,
): DeterministicReviewReasonV1 {
  if (DECISION_IMPACT_CODES.has(code)) {
    return {
      code,
      category: 'decision-impact',
      reviewRole: 'review-relevant',
    };
  }

  if (code === 'fill-unavailable-for-discrimination') {
    return {
      code,
      category: 'evidence-unavailable',
      reviewRole: 'review-relevant',
    };
  }

  return {
    code,
    category: 'diagnostic',
    reviewRole: 'diagnostic-only',
  };
}

function projectPath(
  path: WorksheetFormatFillReviewAnalysisResult['withFill'],
): DeterministicReviewComparisonPathV1 {
  return {
    sourceProfileId: path.sourceProfileId,
    status: path.match.status,
    ...(path.match.winner === undefined
      ? {}
      : { winnerPrototypeId: path.match.winner.prototypeId }),
    ...(path.topPrototypeId === undefined
      ? {}
      : { topPrototypeId: path.topPrototypeId }),
    ...(path.topConfidence === undefined
      ? {}
      : { topConfidence: path.topConfidence }),
    ...(path.topTwoMargin === undefined
      ? {}
      : { topTwoMargin: path.topTwoMargin }),
    noveltyScore: path.match.noveltyScore,
  };
}

function assertEnvelopeBinding<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  result: WorksheetFormatFillReviewAnalysisResult,
): void {
  if (envelope.sourceDigest.trim().length === 0) {
    throw new Error('Deterministic review evidence requires a source digest.');
  }

  const payload = envelope.perception.signal.payload;
  if (payload.featureVersion !== WORKSHEET_FORMAT_FEATURE_VERSION) {
    throw new Error(
      'Deterministic review evidence feature version does not match the current worksheet contract.',
    );
  }
  if (result.withFill.sourceProfileId !== payload.sourceProfileId) {
    throw new Error(
      'Deterministic review evidence source profile does not match Perception.',
    );
  }

  assertSameMatch(result.withFill.match, payload);
}

function assertSameMatch(
  match: FormatMatchResult,
  payload: CognitiveReviewEnvelope['perception']['signal']['payload'],
): void {
  if (match.status !== payload.classification) {
    throw new Error(
      'Deterministic review primary classification does not match Perception.',
    );
  }
  if (match.noveltyScore !== payload.noveltyScore) {
    throw new Error(
      'Deterministic review novelty score does not match Perception.',
    );
  }

  const winner = match.winner?.prototypeId;
  if (winner !== payload.winnerPrototypeId) {
    throw new Error(
      'Deterministic review winner does not match Perception.',
    );
  }

  if (match.candidates.length !== payload.candidates.length) {
    throw new Error(
      'Deterministic review candidate count does not match Perception.',
    );
  }

  match.candidates.forEach((candidate, index) => {
    const expected = payload.candidates[index];
    if (expected === undefined || !sameCandidate(candidate, expected)) {
      throw new Error(
        `Deterministic review candidate does not match Perception at rank ${index + 1}.`,
      );
    }
  });
}

function sameCandidate(
  actual: FormatCandidate,
  expected: {
    prototypeId: string;
    confidence: number;
    deviationScore: number;
    sparseSimilarity: number;
    featureSimilarity: number;
  },
): boolean {
  return actual.prototypeId === expected.prototypeId
    && actual.confidence === expected.confidence
    && actual.deviationScore === expected.deviationScore
    && actual.sparseSimilarity === expected.sparseSimilarity
    && actual.featureSimilarity === expected.featureSimilarity;
}

function assertSurfaceBinding<
  TChoice extends string,
  TSurface extends VerifiedReviewSurfaceLike<TChoice>,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  surface: TSurface,
  evidence: DeterministicReviewEvidenceV1,
): void {
  assertEvidenceShape(evidence);

  if (surface.audience !== 'human-review') {
    throw new Error(
      'Deterministic review evidence requires a human-review surface.',
    );
  }

  const sourceDigest = envelope.sourceDigest;
  if (
    evidence.sourceDigest !== sourceDigest
    || surface.review.authority.sourceDigest !== sourceDigest
    || surface.review.provenance.sourceDigest !== sourceDigest
    || surface.authorityVerification.sourceDigest !== sourceDigest
  ) {
    throw new Error(
      'Deterministic review evidence source digest does not match the review surface.',
    );
  }

  const payload = envelope.perception.signal.payload;
  if (
    evidence.featureVersion !== payload.featureVersion
    || evidence.sourceProfileId !== payload.sourceProfileId
    || !sameStrings(
      [...evidence.sourceEvidence].sort(),
      [...payload.sourceEvidence].sort(),
    )
  ) {
    throw new Error(
      'Deterministic review evidence provenance does not match Perception.',
    );
  }

  if (
    surface.review.authority.disposition !== 'review-only'
    || surface.review.authority.writeAuthority !== 'none'
    || surface.review.authority.applyStatus !== 'not-authorized'
  ) {
    throw new Error(
      'Deterministic review evidence requires an unchanged review-only/no-write boundary.',
    );
  }

  assertPrimaryComparisonMatchesPerception(
    envelope,
    evidence.comparison.primary,
  );
}

function assertEvidenceShape(
  evidence: DeterministicReviewEvidenceV1,
): void {
  if (
    evidence.schemaVersion !== DETERMINISTIC_REVIEW_EVIDENCE_SCHEMA_VERSION
    || evidence.role !== 'deterministic-review-evidence'
  ) {
    throw new Error('Unsupported deterministic review evidence schema.');
  }
  if (
    evidence.producer.kind !== 'deterministic-analysis'
    || evidence.producer.componentId !==
      'mmi.experimental.worksheet-format-fill-review'
    || evidence.producer.componentVersion !== '1'
    || evidence.producer.executionBoundary !== 'local'
  ) {
    throw new Error('Invalid deterministic review evidence producer.');
  }
  if (evidence.featureVersion !== WORKSHEET_FORMAT_FEATURE_VERSION) {
    throw new Error('Invalid deterministic review evidence feature version.');
  }
  if (
    evidence.sourceDigest.trim().length === 0
    || evidence.sourceProfileId.trim().length === 0
    || evidence.comparison.kind !==
      'worksheet-format-fill-vs-structure-only'
    || evidence.comparison.primary.sourceProfileId !==
      evidence.sourceProfileId
    || evidence.comparison.control.sourceProfileId.trim().length === 0
  ) {
    throw new Error('Invalid deterministic review evidence provenance.');
  }

  const seen = new Set<WorksheetFormatFillReviewTelemetryCode>();
  let reviewRelevant = 0;
  let diagnostic = 0;
  for (const reason of evidence.reasons) {
    if (seen.has(reason.code)) {
      throw new Error(
        `Duplicate deterministic review reason: ${reason.code}.`,
      );
    }
    seen.add(reason.code);
    const expected = toReason(reason.code);
    if (
      reason.category !== expected.category
      || reason.reviewRole !== expected.reviewRole
    ) {
      throw new Error(
        `Invalid deterministic review reason classification: ${reason.code}.`,
      );
    }
    if (reason.reviewRole === 'review-relevant') reviewRelevant += 1;
    else diagnostic += 1;
  }

  if (
    evidence.reviewRelevantReasonCount !== reviewRelevant
    || evidence.diagnosticReasonCount !== diagnostic
  ) {
    throw new Error('Deterministic review reason counts are inconsistent.');
  }
}

function assertPrimaryComparisonMatchesPerception<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  primary: DeterministicReviewComparisonPathV1,
): void {
  const payload = envelope.perception.signal.payload;
  if (
    primary.status !== payload.classification
    || primary.winnerPrototypeId !== payload.winnerPrototypeId
    || primary.noveltyScore !== payload.noveltyScore
    || primary.topPrototypeId !== payload.candidates[0]?.prototypeId
    || primary.topConfidence !== payload.candidates[0]?.confidence
  ) {
    throw new Error(
      'Deterministic review primary comparison does not match Perception.',
    );
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
