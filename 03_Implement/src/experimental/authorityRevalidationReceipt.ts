import {
  COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
  type AuthorityRevalidationCheck,
  type AuthorityRevalidationRequirement,
  type CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';

export const AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION =
  'mmi-authority-revalidation-receipt-v1' as const;

export type AuthorityRevalidationScope =
  | 'review-evidence'
  | 'executable-proposal';

export type AuthorityRevalidationCheckStatus =
  | 'passed'
  | 'failed'
  | 'not-applicable';

export interface AuthorityRevalidationIssuer {
  kind: 'authority-plane';
  componentId: string;
  componentVersion: string;
  runId: string;
}

export interface AuthorityRevalidationCheckResult {
  check: AuthorityRevalidationCheck;
  status: AuthorityRevalidationCheckStatus;
  evidenceCode: string;
  detail?: string;
}

export interface AuthorityRevalidationReceiptV1 {
  schemaVersion: typeof AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION;
  envelopeSchemaVersion: typeof COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION;
  sourceDigest: string;
  scope: AuthorityRevalidationScope;
  issuer: AuthorityRevalidationIssuer;
  checks: readonly AuthorityRevalidationCheckResult[];
}

export interface AuthorityRevalidationBinding {
  status: 'satisfied' | 'blocked';
  sourceDigest: string;
  scope: AuthorityRevalidationScope;
  issuer: AuthorityRevalidationIssuer;
  checks: readonly AuthorityRevalidationCheckResult[];
  failedChecks: readonly AuthorityRevalidationCheck[];
}

export function bindAuthorityRevalidationReceipt<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  receipt: AuthorityRevalidationReceiptV1,
): AuthorityRevalidationBinding {
  assertEnvelopeBoundary(envelope);
  assertReceiptIdentity(envelope, receipt);
  assertIssuer(receipt.issuer);

  const requirements = envelope.authorityRevalidation;
  const requirementByCheck = new Map<
    AuthorityRevalidationCheck,
    AuthorityRevalidationRequirement
  >();
  for (const requirement of requirements) {
    if (requirementByCheck.has(requirement.check)) {
      throw new Error(
        `Duplicate Authority requirement in envelope: ${requirement.check}.`,
      );
    }
    if (requirement.state !== 'pending') {
      throw new Error(
        `Authority requirement must remain pending in Cognitive Review Envelope: ${requirement.check}.`,
      );
    }
    requirementByCheck.set(requirement.check, requirement);
  }

  const resultByCheck = new Map<
    AuthorityRevalidationCheck,
    AuthorityRevalidationCheckResult
  >();
  for (const result of receipt.checks) {
    assertCheckResult(result);
    if (resultByCheck.has(result.check)) {
      throw new Error(
        `Duplicate Authority revalidation check result: ${result.check}.`,
      );
    }
    const requirement = requirementByCheck.get(result.check);
    if (!requirement) {
      throw new Error(
        `Authority revalidation receipt contains an extra check: ${result.check}.`,
      );
    }
    assertApplicability(receipt.scope, requirement, result);
    resultByCheck.set(result.check, result);
  }

  if (resultByCheck.size !== requirementByCheck.size) {
    const missing = requirements
      .filter((requirement) => !resultByCheck.has(requirement.check))
      .map((requirement) => requirement.check);
    throw new Error(
      `Authority revalidation receipt is missing checks: ${missing.join(', ')}.`,
    );
  }

  const canonicalChecks = requirements.map((requirement) => {
    const result = resultByCheck.get(requirement.check);
    if (!result) {
      throw new Error(
        `Authority revalidation result disappeared during canonicalization: ${requirement.check}.`,
      );
    }
    return {
      ...result,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
    };
  });

  const failedChecks = canonicalChecks
    .filter((result) => result.status === 'failed')
    .map((result) => result.check);

  return {
    status: failedChecks.length === 0 ? 'satisfied' : 'blocked',
    sourceDigest: receipt.sourceDigest,
    scope: receipt.scope,
    issuer: { ...receipt.issuer },
    checks: canonicalChecks,
    failedChecks,
  };
}

function assertEnvelopeBoundary<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
): void {
  if (envelope.schemaVersion !== COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Cognitive Review Envelope schema: ${String(envelope.schemaVersion)}.`,
    );
  }
  if (envelope.disposition !== 'review-only') {
    throw new Error(
      'Authority receipt can only bind to a review-only Cognitive Review Envelope.',
    );
  }
  if (envelope.writeAuthority !== 'none') {
    throw new Error(
      'Authority receipt requires Cognitive Review Envelope writeAuthority=none.',
    );
  }
  if (
    envelope.sourceDigest.trim().length === 0
    || envelope.sourceDigest !== envelope.perception.observation.sourceDigest
  ) {
    throw new Error(
      'Cognitive Review Envelope has an invalid source identity boundary.',
    );
  }
}

function assertReceiptIdentity<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  receipt: AuthorityRevalidationReceiptV1,
): void {
  if (
    receipt.schemaVersion !== AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported Authority revalidation receipt schema: ${String(receipt.schemaVersion)}.`,
    );
  }
  if (
    receipt.envelopeSchemaVersion !==
    COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION
  ) {
    throw new Error(
      'Authority revalidation receipt targets an incompatible envelope schema.',
    );
  }
  if (receipt.sourceDigest.trim().length === 0) {
    throw new Error(
      'Authority revalidation receipt source digest must not be empty.',
    );
  }
  if (receipt.sourceDigest !== envelope.sourceDigest) {
    throw new Error(
      'Authority revalidation receipt source digest does not match the Cognitive Review Envelope.',
    );
  }
  if (!['review-evidence', 'executable-proposal'].includes(receipt.scope)) {
    throw new Error(
      `Unsupported Authority revalidation scope: ${String(receipt.scope)}.`,
    );
  }
}

function assertIssuer(issuer: AuthorityRevalidationIssuer): void {
  if (issuer.kind !== 'authority-plane') {
    throw new Error(
      `Authority revalidation issuer kind must be authority-plane: ${String(issuer.kind)}.`,
    );
  }
  assertNonEmpty('issuer.componentId', issuer.componentId);
  assertNonEmpty('issuer.componentVersion', issuer.componentVersion);
  assertNonEmpty('issuer.runId', issuer.runId);
}

function assertCheckResult(
  result: AuthorityRevalidationCheckResult,
): void {
  if (!['passed', 'failed', 'not-applicable'].includes(result.status)) {
    throw new Error(
      `Unsupported Authority check status for ${result.check}: ${String(result.status)}.`,
    );
  }
  assertNonEmpty(
    `evidenceCode for ${result.check}`,
    result.evidenceCode,
  );
  if (result.detail !== undefined) {
    assertNonEmpty(`detail for ${result.check}`, result.detail);
  }
}

function assertApplicability(
  scope: AuthorityRevalidationScope,
  requirement: AuthorityRevalidationRequirement,
  result: AuthorityRevalidationCheckResult,
): void {
  if (requirement.appliesTo === 'always') {
    if (result.status === 'not-applicable') {
      throw new Error(
        `Always-required Authority check cannot be not-applicable: ${result.check}.`,
      );
    }
    return;
  }

  if (scope === 'review-evidence') {
    if (result.status !== 'not-applicable') {
      throw new Error(
        `Executable-proposal Authority check must be not-applicable in review-evidence scope: ${result.check}.`,
      );
    }
    return;
  }

  if (result.status === 'not-applicable') {
    throw new Error(
      `Executable-proposal Authority check cannot be not-applicable in executable-proposal scope: ${result.check}.`,
    );
  }
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
}
