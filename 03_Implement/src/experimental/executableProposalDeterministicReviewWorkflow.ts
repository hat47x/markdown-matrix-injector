import type {
  AuthorityWorkbookLoader,
} from './authorityRevalidationAdapter.js';
import {
  prepareExecutableProposalVerifiedReviewWithDefaultLoader,
  prepareExecutableProposalVerifiedReviewWithLoader,
  type ExecutableProposalVerifiedReviewWorkflowInput,
} from './executableProposalVerifiedReviewWorkflow.js';
import type {
  ExecutableProposalVerifiedReviewSurfaceV1,
} from './executableProposalVerifiedReviewSurface.js';
import {
  createDeterministicReviewEvidenceSurface,
  createWorksheetFormatDeterministicReviewEvidence,
  type DeterministicReviewEvidenceV1,
} from './deterministicReviewEvidence.js';
import {
  assertFormatProfile,
  type FormatProfileV1,
} from './formatProfile.js';
import type {
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import {
  assertWorksheetFormatObservationIdentityMatchesSnapshot,
} from './worksheetFormatObservationIdentity.js';
import {
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from './worksheetFormatPrototype.js';
import {
  analyzeWorksheetFormatFillReviewFromProfiles,
} from './worksheetFormatProfileReviewAnalysis.js';
import {
  createUnifiedHumanReviewViewModel,
  type UnifiedHumanReviewViewModelV1,
} from './unifiedHumanReviewViewModel.js';

export interface ExecutableProposalDeterministicReviewInput {
  observationSnapshot: WorksheetFormatSnapshot;
  approvedProfiles: readonly FormatProfileV1[];
}

export type ExecutableProposalDeterministicReviewWorkflowInput<
  TChoice extends string = string,
> = ExecutableProposalVerifiedReviewWorkflowInput<TChoice> & {
  deterministicReview: ExecutableProposalDeterministicReviewInput;
};

export function prepareExecutableProposalDeterministicReviewWithLoader<
  TChoice extends string,
>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
  workbookLoader: AuthorityWorkbookLoader,
): UnifiedHumanReviewViewModelV1<TChoice> {
  const evidence = createEvidence(input);
  const verified = prepareExecutableProposalVerifiedReviewWithLoader(
    baseWorkflowInput(input),
    workbookLoader,
  );
  return composeViewModel(input, verified, evidence);
}

export async function prepareExecutableProposalDeterministicReviewWithDefaultLoader<
  TChoice extends string,
>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): Promise<UnifiedHumanReviewViewModelV1<TChoice>> {
  const evidence = createEvidence(input);
  const verified = await prepareExecutableProposalVerifiedReviewWithDefaultLoader(
    baseWorkflowInput(input),
  );
  return composeViewModel(input, verified, evidence);
}

function createEvidence<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): DeterministicReviewEvidenceV1 {
  assertApprovedProfilesMatchEnvelope(input);
  assertWorksheetFormatObservationIdentityMatchesSnapshot(
    input.envelope.perception.signal.payload.observationIdentity,
    input.envelope.sourceDigest,
    input.deterministicReview.observationSnapshot,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const analysis = analyzeWorksheetFormatFillReviewFromProfiles([{
    id: 'executable-proposal-deterministic-review',
    observationSnapshot: input.deterministicReview.observationSnapshot,
    approvedProfiles: input.deterministicReview.approvedProfiles,
  }]).cases[0];

  if (!analysis) {
    throw new Error(
      'Profile-backed deterministic review analysis returned no case result.',
    );
  }

  return createWorksheetFormatDeterministicReviewEvidence(
    input.envelope,
    analysis,
  );
}

function composeViewModel<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
  verified: ExecutableProposalVerifiedReviewSurfaceV1<TChoice>,
  evidence: DeterministicReviewEvidenceV1,
): UnifiedHumanReviewViewModelV1<TChoice> {
  const wrapped = createDeterministicReviewEvidenceSurface(
    input.envelope,
    verified,
    evidence,
  );

  return createUnifiedHumanReviewViewModel(
    input.envelope,
    wrapped,
  );
}

function assertApprovedProfilesMatchEnvelope<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): void {
  const profiles = new Map(
    input.deterministicReview.approvedProfiles.map((profile) => {
      assertFormatProfile(profile);
      if (profile.status !== 'approved') {
        throw new Error(
          `Deterministic review requires an approved Format Profile: ${profile.id}.`,
        );
      }
      return [profile.id, profile] as const;
    }),
  );

  if (
    profiles.size !== input.deterministicReview.approvedProfiles.length
    || profiles.size !== input.envelope.profiles.length
  ) {
    throw new Error(
      'Deterministic review approved Profile pool does not match the Cognitive Review Envelope.',
    );
  }

  for (const profileRef of input.envelope.profiles) {
    const profile = profiles.get(profileRef.id);
    if (
      profile === undefined
      || profile.label !== profileRef.label
      || profile.featureVersion !== profileRef.featureVersion
      || profile.sourceProfileId !== profileRef.sourceProfileId
      || profile.provenance.sourceDigest !== profileRef.baselineSourceDigest
      || profile.approval?.approvalReference !== profileRef.approvalReference
      || !sameStrings(
        [...profile.sourceEvidence].sort(),
        [...profileRef.sourceEvidence].sort(),
      )
    ) {
      throw new Error(
        `Deterministic review approved Profile does not match Envelope ref: ${profileRef.id}.`,
      );
    }
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function baseWorkflowInput<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): ExecutableProposalVerifiedReviewWorkflowInput<TChoice> {
  const { deterministicReview: _deterministicReview, ...base } = input;
  return base;
}

// Compile-time guards: orchestration accepts source observation + approved
// Profiles, never caller-prepared review/evaluation artifacts.
type _NoPreparedDeterministicEvidence =
  'deterministicReviewEvidence' extends
    keyof ExecutableProposalDeterministicReviewWorkflowInput
      ? never
      : true;
const _noPreparedDeterministicEvidence: _NoPreparedDeterministicEvidence = true;
void _noPreparedDeterministicEvidence;

type _NoPresentationInjection =
  'presentation' extends keyof ExecutableProposalDeterministicReviewWorkflowInput
    ? never
    : true;
const _noPresentationInjection: _NoPresentationInjection = true;
void _noPresentationInjection;

type _NoExpectedReviewLabel =
  'expectedReview' extends keyof ExecutableProposalDeterministicReviewInput
    ? never
    : true;
const _noExpectedReviewLabel: _NoExpectedReviewLabel = true;
void _noExpectedReviewLabel;

type _NoPreparedTelemetry =
  'telemetry' extends keyof ExecutableProposalDeterministicReviewInput
    ? never
    : true;
const _noPreparedTelemetry: _NoPreparedTelemetry = true;
void _noPreparedTelemetry;

type _NoMatcherOptions =
  'matchOptions' extends keyof ExecutableProposalDeterministicReviewInput
    ? never
    : true;
const _noMatcherOptions: _NoMatcherOptions = true;
void _noMatcherOptions;

type _NoPrototypeSnapshots =
  'prototypeSnapshots' extends keyof ExecutableProposalDeterministicReviewInput
    ? never
    : true;
const _noPrototypeSnapshots: _NoPrototypeSnapshots = true;
void _noPrototypeSnapshots;
