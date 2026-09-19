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
import type {
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import type {
  WorksheetFormatFillEvidencePrototype,
} from './worksheetFormatFillEvidenceEvaluation.js';
import {
  analyzeWorksheetFormatFillReviewCase,
} from './worksheetFormatFillReviewTelemetry.js';

export const EXECUTABLE_PROPOSAL_DETERMINISTIC_REVIEW_SURFACE_SCHEMA_VERSION =
  'mmi-executable-proposal-deterministic-review-surface-v1' as const;

export interface ExecutableProposalDeterministicReviewInput {
  observationSnapshot: WorksheetFormatSnapshot;
  prototypeSnapshots: readonly WorksheetFormatFillEvidencePrototype[];
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
