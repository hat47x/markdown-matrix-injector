import { createHash } from 'node:crypto';
import {
  bindAuthorityRevalidationReceipt,
  type AuthorityRevalidationBinding,
  type AuthorityRevalidationReceiptV1,
} from './authorityRevalidationReceipt.js';
import {
  runExecutableProposalAuthorityRevalidation,
  type ExecutableProposalAuthorityRevalidationInput,
} from './authorityRevalidationAdapter.js';
import type {
  CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';

export const EXECUTABLE_PROPOSAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION =
  'mmi-executable-proposal-authority-evidence-v1' as const;

export const EXECUTABLE_PROPOSAL_IDENTITY_REPRESENTATION =
  'mmi-notation-trimmed-utf8-v1' as const;

export interface ExecutableProposalIdentityV1 {
  algorithm: 'sha256';
  representation: typeof EXECUTABLE_PROPOSAL_IDENTITY_REPRESENTATION;
  digest: string;
}

export interface ExecutableProposalAuthorityEvidenceV1 {
  schemaVersion: typeof EXECUTABLE_PROPOSAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION;
  sourceDigest: string;
  proposal: ExecutableProposalIdentityV1;
  receipt: AuthorityRevalidationReceiptV1;
}

export interface ExecutableProposalAuthorityEvidenceBindingV1 {
  schemaVersion: 'mmi-executable-proposal-authority-evidence-binding-v1';
  sourceDigest: string;
  proposal: ExecutableProposalIdentityV1;
  authorityStatus: 'satisfied' | 'blocked';
  authority: AuthorityRevalidationBinding;
}

export function runExecutableProposalAuthorityEvidence<
  TChoice extends string,
>(
  input: ExecutableProposalAuthorityRevalidationInput<TChoice>,
): ExecutableProposalAuthorityEvidenceV1 {
  const receipt = runExecutableProposalAuthorityRevalidation(input);

  return {
    schemaVersion: EXECUTABLE_PROPOSAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION,
    sourceDigest: input.envelope.sourceDigest,
    proposal: createExecutableProposalIdentity(input.rawNotation),
    receipt: copyReceipt(receipt),
  };
}

export function bindExecutableProposalAuthorityEvidence<
  TChoice extends string,
>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  rawNotation: string,
  evidence: ExecutableProposalAuthorityEvidenceV1,
): ExecutableProposalAuthorityEvidenceBindingV1 {
  assertEvidenceBoundary(envelope, rawNotation, evidence);

  const authority = bindAuthorityRevalidationReceipt(
    envelope,
    evidence.receipt,
  );

  return {
    schemaVersion: 'mmi-executable-proposal-authority-evidence-binding-v1',
    sourceDigest: evidence.sourceDigest,
    proposal: { ...evidence.proposal },
    authorityStatus: authority.status,
    authority,
  };
}

export function createExecutableProposalIdentity(
  rawNotation: string,
): ExecutableProposalIdentityV1 {
  const digest = createHash('sha256')
    .update(rawNotation.trim(), 'utf8')
    .digest('hex');

  return {
    algorithm: 'sha256',
    representation: EXECUTABLE_PROPOSAL_IDENTITY_REPRESENTATION,
    digest: `sha256:${digest}`,
  };
}

function assertEvidenceBoundary<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  rawNotation: string,
  evidence: ExecutableProposalAuthorityEvidenceV1,
): void {
  if (
    evidence.schemaVersion !==
    EXECUTABLE_PROPOSAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported executable proposal Authority Evidence schema: ${String(evidence.schemaVersion)}.`,
    );
  }

  if (
    evidence.proposal.algorithm !== 'sha256'
    || evidence.proposal.representation !==
      EXECUTABLE_PROPOSAL_IDENTITY_REPRESENTATION
  ) {
    throw new Error(
      'Unsupported executable proposal identity algorithm or representation.',
    );
  }

  if (
    evidence.sourceDigest.trim().length === 0
    || evidence.sourceDigest !== envelope.sourceDigest
    || evidence.receipt.sourceDigest !== envelope.sourceDigest
  ) {
    throw new Error(
      'Executable proposal Authority Evidence source digest does not match the Cognitive Review Envelope.',
    );
  }

  if (evidence.receipt.scope !== 'executable-proposal') {
    throw new Error(
      'Executable proposal Authority Evidence requires an executable-proposal Receipt.',
    );
  }

  const currentProposal = createExecutableProposalIdentity(rawNotation);
  if (currentProposal.digest !== evidence.proposal.digest) {
    throw new Error(
      'Executable proposal digest does not match the Authority Evidence.',
    );
  }
}

function copyReceipt(
  receipt: AuthorityRevalidationReceiptV1,
): AuthorityRevalidationReceiptV1 {
  return {
    ...receipt,
    issuer: { ...receipt.issuer },
    checks: receipt.checks.map((check) => ({
      ...check,
      ...(check.detail === undefined ? {} : { detail: check.detail }),
    })),
  };
}
