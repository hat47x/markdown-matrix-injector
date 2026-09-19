import {
  runExecutableProposalAuthorityEvidence,
  type ExecutableProposalAuthorityEvidenceV1,
} from './executableProposalAuthorityEvidence.js';
import type {
  AuthorityWorkbookLoader,
  ExecutableProposalAuthorityRevalidationInput,
} from './authorityRevalidationAdapter.js';

export type LoadedExecutableProposalAuthorityInput<
  TChoice extends string = string,
> = Omit<
  ExecutableProposalAuthorityRevalidationInput<TChoice>,
  'workbook' | 'workbookLoader'
>;

export function runExecutableProposalAuthorityEvidenceWithLoader<
  TChoice extends string,
>(
  input: LoadedExecutableProposalAuthorityInput<TChoice>,
  workbookLoader: AuthorityWorkbookLoader,
): ExecutableProposalAuthorityEvidenceV1 {
  return runExecutableProposalAuthorityEvidence({
    ...input,
    workbookLoader,
  });
}

export async function runExecutableProposalAuthorityEvidenceWithDefaultLoader<
  TChoice extends string,
>(
  input: LoadedExecutableProposalAuthorityInput<TChoice>,
): Promise<ExecutableProposalAuthorityEvidenceV1> {
  const { loadWorkbook } = await import('../core/workbookLoader.js');

  return runExecutableProposalAuthorityEvidenceWithLoader(
    input,
    (absolutePath) => loadWorkbook({ absolutePath }),
  );
}
