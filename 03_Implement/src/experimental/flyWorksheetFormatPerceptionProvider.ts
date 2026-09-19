import {
  assertCognitiveObservation,
  assertCognitiveOutcome,
  toCognitiveObservationRef,
  type CognitiveObservation,
  type CognitiveSignalOutcome,
  type CognitiveProviderDescriptor,
  type CognitiveScore,
} from './cognitiveContract.js';
import type {
  FormatCandidate,
  FormatMatchStatus,
} from './flyInspiredFormatMatcher.js';
import {
  createWorksheetFormatObservationIdentityFromMatch,
  type WorksheetFormatObservationIdentityV1,
} from './worksheetFormatObservationIdentity.js';
import type {
  WorksheetFormatSnapshotMatch,
} from './worksheetFormatPrototype.js';

export const FLY_WORKSHEET_FORMAT_PROVIDER: CognitiveProviderDescriptor = Object.freeze({
  id: 'mmi.fly-worksheet-format',
  version: 'worksheet-format-v6',
  category: 'perception',
  executionBoundary: 'local',
  capabilities: Object.freeze([
    'format-candidate-ranking',
    'format-ambiguity',
    'format-novelty',
  ] as const),
});

export interface FlyPerceptionCandidate {
  prototypeId: string;
  confidence: number;
  deviationScore: number;
  sparseSimilarity: number;
  featureSimilarity: number;
}

export interface FlyWorksheetFormatPerceptionPayload {
  classification: FormatMatchStatus;
  winnerPrototypeId?: string;
  candidates: readonly FlyPerceptionCandidate[];
  noveltyScore: number;
  featureVersion: string;
  sourceProfileId: string;
  sourceEvidence: readonly string[];
  observationIdentity: WorksheetFormatObservationIdentityV1;
}

export type FlyWorksheetFormatPerceptionOutcome =
  CognitiveSignalOutcome<FlyWorksheetFormatPerceptionPayload>;

/**
 * Adapts the existing deterministic worksheet-format matcher result into the
 * provider-neutral Cognitive Contract without changing score calculation,
 * thresholds, ranking, or winner selection.
 */
export function adaptWorksheetFormatMatchToCognitiveOutcome(
  observation: CognitiveObservation,
  result: WorksheetFormatSnapshotMatch,
): FlyWorksheetFormatPerceptionOutcome {
  assertCognitiveObservation(observation);
  assertCompatibleProvenance(observation, result);

  const candidates = result.match.candidates.map(copyCandidate);
  const signalKind = signalKindForStatus(result.match.status);
  const top = result.match.candidates[0];

  const scores: CognitiveScore[] = [
    {
      namespace: FLY_WORKSHEET_FORMAT_PROVIDER.id,
      name: 'novelty-score',
      semantics: 'one minus the best candidate confidence as reported by the existing matcher',
      value: result.match.noveltyScore,
      range: { min: 0, max: 1 },
      higherIsStronger: true,
    },
  ];

  if (top) {
    scores.push(
      {
        namespace: FLY_WORKSHEET_FORMAT_PROVIDER.id,
        name: 'top-confidence',
        semantics: 'existing worksheet-format matcher confidence for the top visible candidate',
        value: top.confidence,
        range: { min: 0, max: 1 },
        higherIsStronger: true,
      },
      {
        namespace: FLY_WORKSHEET_FORMAT_PROVIDER.id,
        name: 'top-deviation-score',
        semantics: 'existing worksheet-format matcher deviation score for the top visible candidate',
        value: top.deviationScore,
        range: { min: 0, max: 1 },
        higherIsStronger: false,
      },
    );
  }

  const payload: FlyWorksheetFormatPerceptionPayload = {
    classification: result.match.status,
    ...(result.match.winner
      ? { winnerPrototypeId: result.match.winner.prototypeId }
      : {}),
    candidates,
    noveltyScore: result.match.noveltyScore,
    featureVersion: result.featureVersion,
    sourceProfileId: result.sourceProfileId,
    sourceEvidence: [...result.sourceEvidence],
    observationIdentity: createWorksheetFormatObservationIdentityFromMatch(
      observation.provenance.sourceDigest,
      result,
    ),
  };

  const outcome: FlyWorksheetFormatPerceptionOutcome = {
    status: 'signal',
    provider: FLY_WORKSHEET_FORMAT_PROVIDER,
    observation: toCognitiveObservationRef(observation),
    signal: {
      kind: signalKind,
      payload,
      scores,
      evidence: [
        { code: evidenceCodeForStatus(result.match.status) },
      ],
    },
  };

  assertCognitiveOutcome(outcome);
  return outcome;
}

function assertCompatibleProvenance(
  observation: CognitiveObservation,
  result: WorksheetFormatSnapshotMatch,
): void {
  const featureVersion = observation.provenance.featureVersion;
  if (featureVersion !== result.featureVersion) {
    throw new Error(
      `Cognitive observation feature version does not match worksheet result: ${String(featureVersion)} != ${result.featureVersion}.`,
    );
  }

  const sourceProfileId = observation.provenance.sourceProfileId;
  if (sourceProfileId !== result.sourceProfileId) {
    throw new Error(
      `Cognitive observation source profile does not match worksheet result: ${String(sourceProfileId)} != ${result.sourceProfileId}.`,
    );
  }
}

function copyCandidate(candidate: FormatCandidate): FlyPerceptionCandidate {
  return {
    prototypeId: candidate.prototypeId,
    confidence: candidate.confidence,
    deviationScore: candidate.deviationScore,
    sparseSimilarity: candidate.sparseSimilarity,
    featureSimilarity: candidate.featureSimilarity,
  };
}

function signalKindForStatus(status: FormatMatchStatus): string {
  switch (status) {
    case 'matched':
      return 'format-candidate-ranking';
    case 'ambiguous':
      return 'format-ambiguity';
    case 'novel':
      return 'format-novelty';
  }
}

function evidenceCodeForStatus(status: FormatMatchStatus): string {
  switch (status) {
    case 'matched':
      return 'FORMAT_MATCHED';
    case 'ambiguous':
      return 'FORMAT_AMBIGUOUS';
    case 'novel':
      return 'FORMAT_NOVEL';
  }
}
