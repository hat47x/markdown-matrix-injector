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
  formatProfileToWorksheetPrototype,
  type FormatProfileV1,
} from './formatProfile.js';
import type {
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import type {
  WorksheetFormatFillEvidencePrototype,
} from './worksheetFormatFillEvidenceEvaluation.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from './worksheetFormatPrototype.js';
import {
  analyzeWorksheetFormatFillReviewCase,
} from './worksheetFormatFillReviewTelemetry.js';

export const EXECUTABLE_PROPOSAL_DETERMINISTIC_REVIEW_SURFACE_SCHEMA_VERSION =
  'mmi-executable-proposal-deterministic-review-surface-v1' as const;

export interface ExecutableProposalDeterministicReviewInput {
  observationSnapshot: WorksheetFormatSnapshot;
  prototypeSnapshots: readonly WorksheetFormatFillEvidencePrototype[];
  approvedProfiles: readonly FormatProfileV1[];
}

export type ExecutableProposalDeterministicReviewWorkflowInput<
  TChoice extends string = string,
> = ExecutableProposalVerifiedReviewWorkflowInput<TChoice> & {
  deterministicReview: ExecutableProposalDeterministicReviewInput;
};

export interface ExecutableProposalDeterministicReviewSurfaceV1<
  TChoice extends string = string,
> {
  schemaVersion:
    typeof EXECUTABLE_PROPOSAL_DETERMINISTIC_REVIEW_SURFACE_SCHEMA_VERSION;
  audience: 'human-review';
  proposal: ExecutableProposalVerifiedReviewSurfaceV1<TChoice>['proposal'];
  review: ExecutableProposalVerifiedReviewSurfaceV1<TChoice>['review'];
  authorityVerification:
    ExecutableProposalVerifiedReviewSurfaceV1<TChoice>['authorityVerification'];
  deterministicReviewEvidence: DeterministicReviewEvidenceV1;
}

export function prepareExecutableProposalDeterministicReviewWithLoader<
  TChoice extends string,
>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
  workbookLoader: AuthorityWorkbookLoader,
): ExecutableProposalDeterministicReviewSurfaceV1<TChoice> {
  const evidence = createEvidence(input);
  const verified = prepareExecutableProposalVerifiedReviewWithLoader(
    baseWorkflowInput(input),
    workbookLoader,
  );
  return composeSurface(input, verified, evidence);
}

export async function prepareExecutableProposalDeterministicReviewWithDefaultLoader<
  TChoice extends string,
>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): Promise<ExecutableProposalDeterministicReviewSurfaceV1<TChoice>> {
  const evidence = createEvidence(input);
  const verified = await prepareExecutableProposalVerifiedReviewWithDefaultLoader(
    baseWorkflowInput(input),
  );
  return composeSurface(input, verified, evidence);
}

function createEvidence<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): DeterministicReviewEvidenceV1 {
  assertPrototypePoolMatchesEnvelope(input);
  assertPrototypeSnapshotsMatchApprovedProfiles(input);

  const analysis = analyzeWorksheetFormatFillReviewCase({
    id: 'executable-proposal-deterministic-review',
    observationSnapshot: input.deterministicReview.observationSnapshot,
    prototypeSnapshots: input.deterministicReview.prototypeSnapshots,
  });

  return createWorksheetFormatDeterministicReviewEvidence(
    input.envelope,
    analysis,
  );
}

function composeSurface<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
  verified: ExecutableProposalVerifiedReviewSurfaceV1<TChoice>,
  evidence: DeterministicReviewEvidenceV1,
): ExecutableProposalDeterministicReviewSurfaceV1<TChoice> {
  const wrapped = createDeterministicReviewEvidenceSurface(
    input.envelope,
    verified,
    evidence,
  );

  return {
    schemaVersion:
      EXECUTABLE_PROPOSAL_DETERMINISTIC_REVIEW_SURFACE_SCHEMA_VERSION,
    audience: 'human-review',
    proposal: wrapped.surface.proposal,
    review: wrapped.surface.review,
    authorityVerification: wrapped.surface.authorityVerification,
    deterministicReviewEvidence: wrapped.deterministicReviewEvidence,
  };
}

function assertPrototypePoolMatchesEnvelope<TChoice extends string>(
  input: ExecutableProposalDeterministicReviewWorkflowInput<TChoice>,
): void {
  const actual = input.deterministicReview.prototypeSnapshots
    .map((prototype) => prototype.id)
    .sort();
  const expected = input.envelope.profiles
    .map((profile) => profile.id)
    .sort();

  if (
    new Set(actual).size !== actual.length
    || actual.length !== expected.length
    || !actual.every((id, index) => id === expected[index])
  ) {
    throw new Error(
      'Deterministic review prototype pool does not match the Cognitive Review Envelope profiles.',
    );
  }
}

function assertPrototypeSnapshotsMatchApprovedProfiles<
  TChoice extends string,
>(
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

  for (const entry of input.deterministicReview.prototypeSnapshots) {
    const profile = profiles.get(entry.id);
    if (profile === undefined) {
      throw new Error(
        `Missing approved Format Profile for deterministic prototype: ${entry.id}.`,
      );
    }

    const derived = createWorksheetFormatPrototype(
      entry.id,
      entry.snapshot,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    );
    const approved = formatProfileToWorksheetPrototype(
      profile,
      SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    );

    if (!sameStrings(derived.features, approved.features)) {
      throw new Error(
        `Deterministic prototype snapshot does not match approved Profile features: ${entry.id}.`,
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

// Compile-time guard: this orchestration entrypoint accepts source snapshots,
// not caller-prepared review artifacts or matcher options.
type _NoPreparedDeterministicEvidence =
  'deterministicReviewEvidence'
    extends keyof ExecutableProposalDeterministicReviewWorkflowInput
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

type _NoDeterministicMatchOptions =
  'matchOptions' extends keyof ExecutableProposalDeterministicReviewInput
    ? never
    : true;
const _noDeterministicMatchOptions: _NoDeterministicMatchOptions = true;
void _noDeterministicMatchOptions;


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
