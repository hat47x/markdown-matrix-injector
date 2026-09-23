import type {
  AuthorityWorkbookLoader,
  ExecutableProposalAuthorityRevalidationInput,
} from './authorityRevalidationAdapter.js';
import {
  runExecutableProposalAuthorityEvidenceWithDefaultLoader,
  runExecutableProposalAuthorityEvidenceWithLoader,
  type LoadedExecutableProposalAuthorityInput,
} from './authorityLoadedProposalWorkflow.js';
import {
  createCognitiveReviewPresentation,
} from './cognitiveReviewPresentation.js';
import {
  createExecutableProposalVerifiedReviewSurface,
  type ExecutableProposalVerifiedReviewSurfaceV1,
} from './executableProposalVerifiedReviewSurface.js';

export type ExecutableProposalVerifiedReviewWorkflowInput<
  TChoice extends string = string,
> = LoadedExecutableProposalAuthorityInput<TChoice>;

export function prepareExecutableProposalVerifiedReviewWithLoader<
  TChoice extends string,
>(
  input: ExecutableProposalVerifiedReviewWorkflowInput<TChoice>,
  workbookLoader: AuthorityWorkbookLoader,
): ExecutableProposalVerifiedReviewSurfaceV1<TChoice> {
  const presentation = createCognitiveReviewPresentation(input.envelope);
  const evidence = runExecutableProposalAuthorityEvidenceWithLoader(
    input,
    workbookLoader,
  );

  return createExecutableProposalVerifiedReviewSurface(
    input.envelope,
    presentation,
    input.rawNotation,
    evidence,
  );
}

export async function prepareExecutableProposalVerifiedReviewWithDefaultLoader<
  TChoice extends string,
>(
  input: ExecutableProposalVerifiedReviewWorkflowInput<TChoice>,
): Promise<ExecutableProposalVerifiedReviewSurfaceV1<TChoice>> {
  const presentation = createCognitiveReviewPresentation(input.envelope);
  const evidence =
    await runExecutableProposalAuthorityEvidenceWithDefaultLoader(input);

  return createExecutableProposalVerifiedReviewSurface(
    input.envelope,
    presentation,
    input.rawNotation,
    evidence,
  );
}

// Compile-time guard: workflow input must never grow a preloaded WorkbookData
// escape hatch. Loader selection stays explicit at the orchestration boundary.
type _NoPreloadedWorkbook =
  'workbook' extends keyof ExecutableProposalVerifiedReviewWorkflowInput
    ? never
    : true;
const _noPreloadedWorkbook: _NoPreloadedWorkbook = true;
void _noPreloadedWorkbook;

// Keep the imported base input visible to type-check future drift without
// exporting a second orchestration input shape.
type _BaseInputCompatibility =
  ExecutableProposalVerifiedReviewWorkflowInput extends Omit<
    ExecutableProposalAuthorityRevalidationInput,
    'workbook' | 'workbookLoader'
  >
    ? true
    : never;
const _baseInputCompatibility: _BaseInputCompatibility = true;
void _baseInputCompatibility;
