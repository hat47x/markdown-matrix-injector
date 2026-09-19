import {
  assertCognitiveOutcome,
  type CognitiveProviderDescriptor,
  type CognitiveScore,
} from './cognitiveContract.js';
import {
  COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
  type AuthorityRevalidationRequirement,
  type CognitiveReviewEnvelope,
  type CognitiveReviewProfileRef,
} from './cognitiveReviewEnvelope.js';
import type {
  ClosedChoiceJudgmentPayload,
} from './closedChoiceJudgment.js';
import type {
  FlyPerceptionCandidate,
} from './flyWorksheetFormatPerceptionProvider.js';

export const COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION =
  'mmi-cognitive-review-presentation-v1' as const;

export interface CognitiveReviewProviderPresentation {
  id: string;
  version: string;
  category: 'perception' | 'judgment' | 'reasoning-generation';
  executionBoundary: 'local' | 'external-opt-in';
}

export interface CognitiveReviewMetricPresentation {
  providerId: string;
  namespace: string;
  name: string;
  semantics: string;
  value: number;
  range?: {
    min: number;
    max: number;
  };
  higherIsStronger?: boolean;
}

export interface CognitiveReviewAuthorityPresentation {
  role: 'authority-boundary';
  disposition: 'review-only';
  writeAuthority: 'none';
  applyStatus: 'not-authorized';
  sourceDigest: string;
  revalidation: readonly AuthorityRevalidationRequirement[];
}

export interface CognitiveReviewCandidatePresentation {
  rank: number;
  prototypeId: string;
  profileLabel: string;
  approvalReference: string;
  confidence: number;
  deviationScore: number;
  sparseSimilarity: number;
  featureSimilarity: number;
}

export interface CognitiveReviewPerceptionPresentation {
  role: 'cognitive-perception';
  provider: CognitiveReviewProviderPresentation;
  signalKind: string;
  classification: 'matched' | 'ambiguous' | 'novel';
  winnerPrototypeId?: string;
  noveltyScore: number;
  candidates: readonly CognitiveReviewCandidatePresentation[];
  metrics: readonly CognitiveReviewMetricPresentation[];
}

export interface CognitiveReviewJudgmentNotRequestedPresentation {
  role: 'cognitive-judgment';
  state: 'not-requested';
}

export interface CognitiveReviewJudgmentProposalPresentation<
  TChoice extends string = string,
> {
  role: 'cognitive-judgment';
  state: 'proposal';
  provider: CognitiveReviewProviderPresentation;
  signalKind: 'closed-choice-judgment';
  disposition: 'proposal-only';
  questionId: string;
  choice: TChoice;
  probability: number;
  metrics: readonly CognitiveReviewMetricPresentation[];
}

export interface CognitiveReviewJudgmentNonDecisionPresentation {
  role: 'cognitive-judgment';
  state: 'non-decision';
  provider: CognitiveReviewProviderPresentation;
  status: 'abstained' | 'unsupported' | 'unavailable';
  reasonCode: string;
  detail?: string;
  metrics: readonly CognitiveReviewMetricPresentation[];
}

export type CognitiveReviewJudgmentPresentation<
  TChoice extends string = string,
> =
  | CognitiveReviewJudgmentNotRequestedPresentation
  | CognitiveReviewJudgmentProposalPresentation<TChoice>
  | CognitiveReviewJudgmentNonDecisionPresentation;

export interface CognitiveReviewProfileProvenancePresentation {
  id: string;
  label: string;
  approvalReference: string;
  baselineSourceDigest: string;
  featureVersion: string;
  sourceProfileId: string;
}

export interface CognitiveReviewProvenancePresentation {
  role: 'provenance';
  sourceDigest: string;
  providers: readonly CognitiveReviewProviderPresentation[];
  profiles: readonly CognitiveReviewProfileProvenancePresentation[];
}

export interface CognitiveReviewPresentationV1<
  TChoice extends string = string,
> {
  schemaVersion: typeof COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION;
  audience: 'human-review';
  authority: CognitiveReviewAuthorityPresentation;
  perception: CognitiveReviewPerceptionPresentation;
  judgment: CognitiveReviewJudgmentPresentation<TChoice>;
  provenance: CognitiveReviewProvenancePresentation;
}

export function createCognitiveReviewPresentation<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
): CognitiveReviewPresentationV1<TChoice> {
  assertEnvelopeShape(envelope);

  const perceptionProvider = toProvider(envelope.perception.provider);
  const candidates = envelope.perception.signal.payload.candidates.map(
    (candidate, index) => toCandidate(candidate, envelope.profiles[index], index),
  );

  const judgment = toJudgmentPresentation(envelope);
  const providers = [perceptionProvider];

  if (envelope.judgment !== undefined) {
    providers.push(toProvider(envelope.judgment.provider));
  }

  return {
    schemaVersion: COGNITIVE_REVIEW_PRESENTATION_SCHEMA_VERSION,
    audience: 'human-review',
    authority: {
      role: 'authority-boundary',
      disposition: 'review-only',
      writeAuthority: 'none',
      applyStatus: 'not-authorized',
      sourceDigest: envelope.sourceDigest,
      revalidation: envelope.authorityRevalidation.map(
        (requirement) => ({ ...requirement }),
      ),
    },
    perception: {
      role: 'cognitive-perception',
      provider: perceptionProvider,
      signalKind: envelope.perception.signal.kind,
      classification: envelope.perception.signal.payload.classification,
      ...(envelope.perception.signal.payload.winnerPrototypeId === undefined
        ? {}
        : {
            winnerPrototypeId:
              envelope.perception.signal.payload.winnerPrototypeId,
          }),
      noveltyScore: envelope.perception.signal.payload.noveltyScore,
      candidates,
      metrics: projectMetrics(
        envelope.perception.provider.id,
        envelope.perception.signal.scores ?? [],
      ),
    },
    judgment,
    provenance: {
      role: 'provenance',
      sourceDigest: envelope.sourceDigest,
      providers,
      profiles: envelope.profiles.map((profile) => ({
        id: profile.id,
        label: profile.label,
        approvalReference: profile.approvalReference,
        baselineSourceDigest: profile.baselineSourceDigest,
        featureVersion: profile.featureVersion,
        sourceProfileId: profile.sourceProfileId,
      })),
    },
  };
}

function assertEnvelopeShape<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
): void {
  if (envelope.schemaVersion !== COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported cognitive review envelope schema: ${String(envelope.schemaVersion)}.`,
    );
  }
  if (envelope.disposition !== 'review-only') {
    throw new Error('Cognitive review presentation requires review-only disposition.');
  }
  if (envelope.writeAuthority !== 'none') {
    throw new Error('Cognitive review presentation requires writeAuthority=none.');
  }
  if (envelope.sourceDigest.trim().length === 0) {
    throw new Error('Cognitive review presentation requires a source digest.');
  }
  if (envelope.sourceDigest !== envelope.perception.observation.sourceDigest) {
    throw new Error(
      'Cognitive review presentation source digest does not match Perception.',
    );
  }

  assertCognitiveOutcome(envelope.perception);

  if (
    envelope.authorityRevalidation.some(
      (requirement) => requirement.state !== 'pending',
    )
  ) {
    throw new Error(
      'Cognitive review presentation cannot display completed Authority revalidation.',
    );
  }

  const candidates = envelope.perception.signal.payload.candidates;
  if (candidates.length !== envelope.profiles.length) {
    throw new Error(
      'Cognitive review candidate/Profile binding length does not match.',
    );
  }

  candidates.forEach((candidate, index) => {
    const profile = envelope.profiles[index];
    if (profile === undefined || profile.id !== candidate.prototypeId) {
      throw new Error(
        `Cognitive review candidate/Profile binding mismatch at rank ${index + 1}.`,
      );
    }
    assertProfileRef(profile);
  });

  const winner = envelope.perception.signal.payload.winnerPrototypeId;
  if (
    winner !== undefined
    && !candidates.some((candidate) => candidate.prototypeId === winner)
  ) {
    throw new Error(
      'Cognitive review winner is not present in visible candidates.',
    );
  }

  if (envelope.judgment !== undefined) {
    assertCognitiveOutcome(envelope.judgment);
    if (envelope.judgment.observation.sourceDigest !== envelope.sourceDigest) {
      throw new Error(
        'Cognitive review presentation Judgment source digest mismatch.',
      );
    }
    if (envelope.judgment.status === 'signal') {
      if (envelope.judgment.signal.kind !== 'closed-choice-judgment') {
        throw new Error(
          'Cognitive review presentation requires closed-choice Judgment signal.',
        );
      }
      if (envelope.judgment.signal.payload.disposition !== 'proposal-only') {
        throw new Error(
          'Cognitive review presentation requires proposal-only Judgment.',
        );
      }
    } else if (
      !['abstained', 'unsupported', 'unavailable'].includes(
        envelope.judgment.status,
      )
    ) {
      throw new Error(
        `Unsupported cognitive review Judgment state: ${envelope.judgment.status}.`,
      );
    }
  }
}

function assertProfileRef(profile: CognitiveReviewProfileRef): void {
  if (profile.id.trim().length === 0) {
    throw new Error('Cognitive review profile id must not be empty.');
  }
  if (profile.label.trim().length === 0) {
    throw new Error('Cognitive review profile label must not be empty.');
  }
  if (profile.approvalReference.trim().length === 0) {
    throw new Error(
      `Cognitive review profile approval reference must not be empty: ${profile.id}.`,
    );
  }
  if (profile.baselineSourceDigest.trim().length === 0) {
    throw new Error(
      `Cognitive review profile baseline digest must not be empty: ${profile.id}.`,
    );
  }
}

function toCandidate(
  candidate: FlyPerceptionCandidate,
  profile: CognitiveReviewProfileRef | undefined,
  index: number,
): CognitiveReviewCandidatePresentation {
  if (profile === undefined || profile.id !== candidate.prototypeId) {
    throw new Error(
      `Missing profile binding for presentation candidate: ${candidate.prototypeId}.`,
    );
  }
  return {
    rank: index + 1,
    prototypeId: candidate.prototypeId,
    profileLabel: profile.label,
    approvalReference: profile.approvalReference,
    confidence: candidate.confidence,
    deviationScore: candidate.deviationScore,
    sparseSimilarity: candidate.sparseSimilarity,
    featureSimilarity: candidate.featureSimilarity,
  };
}

function toJudgmentPresentation<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
): CognitiveReviewJudgmentPresentation<TChoice> {
  const judgment = envelope.judgment;
  if (judgment === undefined) {
    return {
      role: 'cognitive-judgment',
      state: 'not-requested',
    };
  }

  const provider = toProvider(judgment.provider);
  if (judgment.status === 'signal') {
    const payload: ClosedChoiceJudgmentPayload<TChoice> =
      judgment.signal.payload;
    return {
      role: 'cognitive-judgment',
      state: 'proposal',
      provider,
      signalKind: 'closed-choice-judgment',
      disposition: 'proposal-only',
      questionId: payload.questionId,
      choice: payload.choice,
      probability: payload.probability,
      metrics: projectMetrics(
        judgment.provider.id,
        judgment.signal.scores ?? [],
      ),
    };
  }

  if (!['abstained', 'unsupported', 'unavailable'].includes(judgment.status)) {
    throw new Error(
      `Unsupported cognitive review Judgment state: ${judgment.status}.`,
    );
  }

  return {
    role: 'cognitive-judgment',
    state: 'non-decision',
    provider,
    status: judgment.status,
    reasonCode: judgment.reasonCode,
    ...(judgment.detail === undefined ? {} : { detail: judgment.detail }),
    metrics: projectMetrics(
      judgment.provider.id,
      judgment.scores ?? [],
    ),
  };
}

function projectMetrics(
  providerId: string,
  scores: readonly CognitiveScore[],
): CognitiveReviewMetricPresentation[] {
  return scores.map((score) => ({
    providerId,
    namespace: score.namespace,
    name: score.name,
    semantics: score.semantics,
    value: score.value,
    ...(score.range === undefined
      ? {}
      : {
          range: {
            min: score.range.min,
            max: score.range.max,
          },
        }),
    ...(score.higherIsStronger === undefined
      ? {}
      : { higherIsStronger: score.higherIsStronger }),
  }));
}

function toProvider(
  provider: CognitiveProviderDescriptor,
): CognitiveReviewProviderPresentation {
  return {
    id: provider.id,
    version: provider.version,
    category: provider.category,
    executionBoundary: provider.executionBoundary,
  };
}
