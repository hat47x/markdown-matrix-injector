import {
  assertCognitiveOutcome,
  type CognitiveAbstentionOutcome,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentOutcome,
  ClosedChoiceJudgmentPayload,
} from './closedChoiceJudgment.js';
import {
  assertFormatProfile,
  assertFormatProfileCompatible,
  type FormatProfileV1,
} from './formatProfile.js';
import type {
  FlyWorksheetFormatPerceptionOutcome,
} from './flyWorksheetFormatPerceptionProvider.js';
import {
  assertWorksheetFormatObservationIdentityProvenance,
} from './worksheetFormatObservationIdentity.js';
import type {
  WorksheetFormatEvidenceKind,
  WorksheetFormatSourceProfile,
} from './worksheetFormatPrototype.js';

export const COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION =
  'mmi-cognitive-review-envelope-v1' as const;

export type AuthorityRevalidationCheck =
  | 'source-identity'
  | 'profile-compatibility'
  | 'parser'
  | 'parameter-schema'
  | 'resolver'
  | 'containment'
  | 'source-existence'
  | 'preview';

export type AuthorityRevalidationApplicability =
  | 'always'
  | 'executable-proposal';

export interface AuthorityRevalidationRequirement {
  check: AuthorityRevalidationCheck;
  appliesTo: AuthorityRevalidationApplicability;
  state: 'pending';
}

export interface CognitiveReviewProfileRef {
  id: string;
  label: string;
  featureVersion: string;
  sourceProfileId: string;
  sourceEvidence: readonly WorksheetFormatEvidenceKind[];
  baselineSourceDigest: string;
  approvalReference: string;
}

export interface CognitiveReviewEnvelope<TChoice extends string = string> {
  schemaVersion: typeof COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION;
  disposition: 'review-only';
  writeAuthority: 'none';
  sourceDigest: string;
  perception: FlyWorksheetFormatPerceptionOutcome;
  profiles: readonly CognitiveReviewProfileRef[];
  judgment?: ClosedChoiceJudgmentOutcome<TChoice>;
  authorityRevalidation: readonly AuthorityRevalidationRequirement[];
}

export interface CreateCognitiveReviewEnvelopeInput<
  TChoice extends string = string,
> {
  perception: FlyWorksheetFormatPerceptionOutcome;
  approvedProfiles: readonly FormatProfileV1[];
  sourceProfile: WorksheetFormatSourceProfile;
  judgment?: ClosedChoiceJudgmentOutcome<TChoice>;
}

const AUTHORITY_REVALIDATION_REQUIREMENTS:
  readonly AuthorityRevalidationRequirement[] = Object.freeze([
    Object.freeze({
      check: 'source-identity',
      appliesTo: 'always',
      state: 'pending',
    }),
    Object.freeze({
      check: 'profile-compatibility',
      appliesTo: 'always',
      state: 'pending',
    }),
    Object.freeze({
      check: 'parser',
      appliesTo: 'executable-proposal',
      state: 'pending',
    }),
    Object.freeze({
      check: 'parameter-schema',
      appliesTo: 'executable-proposal',
      state: 'pending',
    }),
    Object.freeze({
      check: 'resolver',
      appliesTo: 'executable-proposal',
      state: 'pending',
    }),
    Object.freeze({
      check: 'containment',
      appliesTo: 'executable-proposal',
      state: 'pending',
    }),
    Object.freeze({
      check: 'source-existence',
      appliesTo: 'executable-proposal',
      state: 'pending',
    }),
    Object.freeze({
      check: 'preview',
      appliesTo: 'executable-proposal',
      state: 'pending',
    }),
  ] as const);

export function createCognitiveReviewEnvelope<TChoice extends string>(
  input: CreateCognitiveReviewEnvelopeInput<TChoice>,
): CognitiveReviewEnvelope<TChoice> {
  assertCognitiveOutcome(input.perception);
  assertPerceptionShape(input.perception);
  assertSourceProfile(input.sourceProfile);
  assertPerceptionSourceProfile(input.perception, input.sourceProfile);
  assertWorksheetFormatObservationIdentityProvenance(
    input.perception.signal.payload.observationIdentity,
    {
      sourceDigest: input.perception.observation.sourceDigest,
      featureVersion: input.perception.signal.payload.featureVersion,
      sourceProfileId: input.perception.signal.payload.sourceProfileId,
      sourceEvidence: input.perception.signal.payload.sourceEvidence,
    },
  );

  const profileById = new Map<string, FormatProfileV1>();
  for (const profile of input.approvedProfiles) {
    assertFormatProfile(profile);
    if (profile.status !== 'approved') {
      throw new Error(
        `Cognitive review requires approved Format Profiles: ${profile.id}.`,
      );
    }
    assertFormatProfileCompatible(profile, input.sourceProfile);
    assertProfileMatchesPerception(profile, input.perception);

    if (profileById.has(profile.id)) {
      throw new Error(
        `Duplicate Format Profile id in cognitive review pool: ${profile.id}.`,
      );
    }
    profileById.set(profile.id, profile);
  }

  const visibleCandidateIds = uniqueCandidateIds(input.perception);
  const profiles = visibleCandidateIds.map((id) => {
    const profile = profileById.get(id);
    if (!profile) {
      throw new Error(
        `Missing approved Format Profile for visible candidate: ${id}.`,
      );
    }
    return toProfileRef(profile);
  });

  if (input.perception.signal.payload.winnerPrototypeId !== undefined) {
    const winnerId = input.perception.signal.payload.winnerPrototypeId;
    if (!visibleCandidateIds.includes(winnerId)) {
      throw new Error(
        `Perception winner is not present in visible candidates: ${winnerId}.`,
      );
    }
  }

  if (input.judgment !== undefined) {
    assertJudgment(input.judgment, input.perception.observation.sourceDigest);
  }

  return {
    schemaVersion: COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
    disposition: 'review-only',
    writeAuthority: 'none',
    sourceDigest: input.perception.observation.sourceDigest,
    perception: input.perception,
    profiles,
    ...(input.judgment === undefined ? {} : { judgment: input.judgment }),
    authorityRevalidation: AUTHORITY_REVALIDATION_REQUIREMENTS.map(
      (requirement) => ({ ...requirement }),
    ),
  };
}

function assertPerceptionShape(
  perception: FlyWorksheetFormatPerceptionOutcome,
): void {
  if (perception.provider.category !== 'perception') {
    throw new Error('Cognitive review perception must use the perception category.');
  }
  if (
    ![
      'format-candidate-ranking',
      'format-ambiguity',
      'format-novelty',
    ].includes(perception.signal.kind)
  ) {
    throw new Error(
      `Unsupported cognitive review perception signal: ${perception.signal.kind}.`,
    );
  }
}

function assertSourceProfile(
  sourceProfile: WorksheetFormatSourceProfile,
): void {
  if (sourceProfile.id.trim().length === 0) {
    throw new Error('Cognitive review source profile id must not be empty.');
  }
  if (sourceProfile.evidence.length === 0) {
    throw new Error(
      'Cognitive review source profile must declare at least one evidence kind.',
    );
  }
  const unique = new Set(sourceProfile.evidence);
  if (unique.size !== sourceProfile.evidence.length) {
    throw new Error(
      'Cognitive review source profile evidence must not contain duplicates.',
    );
  }
}

function assertPerceptionSourceProfile(
  perception: FlyWorksheetFormatPerceptionOutcome,
  sourceProfile: WorksheetFormatSourceProfile,
): void {
  const payload = perception.signal.payload;
  if (payload.sourceProfileId !== sourceProfile.id) {
    throw new Error(
      'Perception source profile does not match cognitive review source profile.',
    );
  }
  if (
    !sameStrings(
      [...payload.sourceEvidence].sort(),
      [...sourceProfile.evidence].sort(),
    )
  ) {
    throw new Error(
      'Perception source evidence does not match cognitive review source profile.',
    );
  }
}

function assertProfileMatchesPerception(
  profile: FormatProfileV1,
  perception: FlyWorksheetFormatPerceptionOutcome,
): void {
  const payload = perception.signal.payload;
  if (profile.featureVersion !== payload.featureVersion) {
    throw new Error(
      `Format Profile feature version does not match Perception: ${profile.id}.`,
    );
  }
  if (profile.sourceProfileId !== payload.sourceProfileId) {
    throw new Error(
      `Format Profile source profile does not match Perception: ${profile.id}.`,
    );
  }
  if (
    !sameStrings(
      [...profile.sourceEvidence].sort(),
      [...payload.sourceEvidence].sort(),
    )
  ) {
    throw new Error(
      `Format Profile source evidence does not match Perception: ${profile.id}.`,
    );
  }
}

function uniqueCandidateIds(
  perception: FlyWorksheetFormatPerceptionOutcome,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const candidate of perception.signal.payload.candidates) {
    if (seen.has(candidate.prototypeId)) {
      throw new Error(
        `Duplicate visible Perception candidate: ${candidate.prototypeId}.`,
      );
    }
    seen.add(candidate.prototypeId);
    ids.push(candidate.prototypeId);
  }
  return ids;
}

function assertJudgment<TChoice extends string>(
  judgment: ClosedChoiceJudgmentOutcome<TChoice>,
  expectedSourceDigest: string,
): void {
  assertCognitiveOutcome(judgment);
  if (judgment.provider.category !== 'judgment') {
    throw new Error('Cognitive review Judgment must use the judgment category.');
  }
  if (judgment.observation.sourceDigest !== expectedSourceDigest) {
    throw new Error(
      'Cognitive review Judgment source digest does not match Perception.',
    );
  }

  if (judgment.status === 'signal') {
    assertJudgmentSignal(judgment.signal.kind, judgment.signal.payload);
    return;
  }

  assertAllowedNonDecision(judgment);
}

function assertJudgmentSignal<TChoice extends string>(
  kind: string,
  payload: ClosedChoiceJudgmentPayload<TChoice>,
): void {
  if (kind !== 'closed-choice-judgment') {
    throw new Error(
      `Unsupported cognitive review Judgment signal: ${kind}.`,
    );
  }
  if (payload.disposition !== 'proposal-only') {
    throw new Error(
      'Cognitive review Judgment signal must remain proposal-only.',
    );
  }
}

function assertAllowedNonDecision(
  judgment: CognitiveAbstentionOutcome,
): void {
  if (
    !['abstained', 'unsupported', 'unavailable'].includes(judgment.status)
  ) {
    throw new Error(
      `Unsupported cognitive review Judgment non-decision: ${judgment.status}.`,
    );
  }
}

function toProfileRef(profile: FormatProfileV1): CognitiveReviewProfileRef {
  const approval = profile.approval;
  if (approval === undefined) {
    throw new Error(
      `Approved Format Profile is missing approval metadata: ${profile.id}.`,
    );
  }
  return {
    id: profile.id,
    label: profile.label,
    featureVersion: profile.featureVersion,
    sourceProfileId: profile.sourceProfileId,
    sourceEvidence: [...profile.sourceEvidence],
    baselineSourceDigest: profile.provenance.sourceDigest,
    approvalReference: approval.approvalReference,
  };
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
