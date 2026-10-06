import { createHash } from 'node:crypto';
import fs from 'node:fs';

import {
  imageCandidates,
  readExcelImages,
} from '../adapters/excelImageAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import {
  candidateProblem,
  type Candidate,
  type CandidateKind,
  type Provenance,
  type SourceLocator,
} from '../core/candidate.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import {
  AI_HANDOFF_SCHEMA,
  assertAiHandoffPackage,
  candidateIdentityOf,
  type AiHandoffPackageV1,
  type HandoffCandidateIdentity,
  type HandoffProvenanceView,
} from './aiHandoff.js';
import {
  validateAiHandoffNotationProposal,
  type AiHandoffProposalValidationV1,
} from './aiHandoffProposalValidation.js';

export const AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA =
  'mmi.ai-handoff-transformation-proposal/v1' as const;
export const AI_HANDOFF_TRANSFORMATION_VALIDATION_SCHEMA =
  'mmi.ai-handoff-transformation-validation/v1' as const;

export type AiHandoffTransformationTargetState = 'linked' | 'extracted';

export interface AiHandoffTransformationProposalV1 {
  schema: typeof AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA;
  candidate: HandoffCandidateIdentity;
  targetState: AiHandoffTransformationTargetState;
  rationale: string;
  unresolved: readonly string[];
}

export type AiHandoffTransformationPlan =
  | {
      operation: 'link-existing-reference';
      candidate: HandoffCandidateIdentity;
      notation: string;
    }
  | {
      operation: 'extract-standard-asset';
      candidate: HandoffCandidateIdentity;
      candidateKind: 'table-range';
      conversion: 'gfm-table-v1';
    }
  | {
      operation: 'extract-standard-asset';
      candidate: HandoffCandidateIdentity;
      candidateKind: 'image';
      conversion: 'raw-image-bytes-v1';
    };

export type AiHandoffTransformationCheckName =
  | 'package'
  | 'proposal-schema'
  | 'operation-boundary'
  | 'candidate-allowlist'
  | 'source-identity'
  | 'current-candidate'
  | 'transformation-contract'
  | 'authority-revalidation';

export interface AiHandoffTransformationCheck {
  check: AiHandoffTransformationCheckName;
  status: 'passed' | 'failed' | 'not-run';
  code: string;
  detail?: string;
}

export interface AiHandoffTransformationValidationV1 {
  schema: typeof AI_HANDOFF_TRANSFORMATION_VALIDATION_SCHEMA;
  handoffSchema: typeof AI_HANDOFF_SCHEMA;
  proposalDigest: string;
  status: 'accepted-for-review' | 'blocked';
  candidate?: HandoffCandidateIdentity;
  targetState?: AiHandoffTransformationTargetState;
  plan?: AiHandoffTransformationPlan;
  notationValidation?: AiHandoffProposalValidationV1;
  checks: readonly AiHandoffTransformationCheck[];
}

export interface ValidateAiHandoffTransformationProposalInput {
  handoff: AiHandoffPackageV1;
  proposal: unknown;
  markdownFilePath: string;
  workspaceRoot: string;
}

interface OfferedCandidate {
  identity: HandoffCandidateIdentity;
  kind: CandidateKind;
  locator: SourceLocator;
  provenance: HandoffProvenanceView;
}

/**
 * Revalidate an external AI's requested Candidate state transition without
 * executing it. The external proposal cannot choose a path, command,
 * conversion implementation, or notation. MMI rediscovers the current
 * Candidate from source bytes and returns only an accepted-for-review plan.
 */
export async function validateAiHandoffTransformationProposal(
  input: ValidateAiHandoffTransformationProposalInput,
): Promise<AiHandoffTransformationValidationV1> {
  assertAiHandoffPackage(input.handoff);
  const checks = new Map<
    AiHandoffTransformationCheckName,
    AiHandoffTransformationCheck
  >();
  pass(checks, 'package', 'HANDOFF_PACKAGE_ACCEPTED');

  if (!isProposal(input.proposal)) {
    fail(
      checks,
      'proposal-schema',
      'TRANSFORMATION_PROPOSAL_SCHEMA_INVALID',
      'Transformation proposal must contain only schema, candidate, targetState, rationale and unresolved.',
    );
    return finish(input.proposal, checks);
  }
  const proposal = input.proposal;
  pass(
    checks,
    'proposal-schema',
    'TRANSFORMATION_PROPOSAL_SCHEMA_ACCEPTED',
  );

  // A transformation proposal is still only a suggestion for user review.
  // It does not expand the v1 handoff's operation boundary or grant writes.
  if (!input.handoff.allowedOperations.includes('suggest-user-review')) {
    fail(
      checks,
      'operation-boundary',
      'TRANSFORMATION_REVIEW_SUGGESTION_NOT_ALLOWED',
      'The handoff package does not allow user-review suggestions.',
    );
    return finish(proposal, checks);
  }
  pass(
    checks,
    'operation-boundary',
    'TRANSFORMATION_REMAINS_REVIEW_ONLY',
  );

  const offered = offeredCandidate(
    input.handoff,
    proposal.candidate.digest,
  );
  if (!offered) {
    fail(
      checks,
      'candidate-allowlist',
      'TRANSFORMATION_CANDIDATE_NOT_IN_HANDOFF',
      proposal.candidate.digest,
    );
    return finish(proposal, checks);
  }
  pass(
    checks,
    'candidate-allowlist',
    'TRANSFORMATION_CANDIDATE_IN_HANDOFF',
  );

  let sourcePath: string;
  let actualDigest: string;
  try {
    sourcePath = resolveSourcePath({
      markdownFilePath: input.markdownFilePath,
      sourcePath: offered.locator.source,
      workspaceRoot: input.workspaceRoot,
    });
    actualDigest = readSourceFileIdentity(sourcePath).digest;
    const handoffSource = input.handoff.sources.find(
      (item) =>
        normalizeSource(item.source) === normalizeSource(offered.locator.source),
    );
    if (
      !handoffSource
      || handoffSource.sourceDigest !== offered.locator.sourceDigest
      || actualDigest !== offered.locator.sourceDigest
    ) {
      fail(
        checks,
        'source-identity',
        'TRANSFORMATION_SOURCE_DIGEST_MISMATCH',
        `current=${actualDigest}, handoff-candidate=${offered.locator.sourceDigest}, handoff-source=${handoffSource?.sourceDigest ?? 'missing'}`,
      );
      return finish(proposal, checks);
    }
  } catch (error) {
    fail(
      checks,
      'source-identity',
      'TRANSFORMATION_SOURCE_REVALIDATION_FAILED',
      error instanceof Error ? error.message : String(error),
    );
    return finish(proposal, checks);
  }
  pass(
    checks,
    'source-identity',
    'TRANSFORMATION_SOURCE_IDENTITY_MATCHED',
  );

  let rediscovered: Candidate[];
  try {
    rediscovered = rediscoverCandidates(
      sourcePath,
      offered.locator.source,
      actualDigest,
      offered.kind,
    );
  } catch (error) {
    fail(
      checks,
      'current-candidate',
      'TRANSFORMATION_CURRENT_CANDIDATE_REDISCOVERY_FAILED',
      error instanceof Error ? error.message : String(error),
    );
    return finish(proposal, checks);
  }

  const current = rediscovered.filter(
    (candidate) =>
      !candidateProblem(candidate)
      && candidateIdentityOf(candidate).digest === proposal.candidate.digest,
  );
  if (current.length !== 1) {
    fail(
      checks,
      'current-candidate',
      current.length === 0
        ? 'TRANSFORMATION_CURRENT_CANDIDATE_NOT_FOUND'
        : 'TRANSFORMATION_CURRENT_CANDIDATE_AMBIGUOUS',
      `current matches: ${current.length}`,
    );
    return finish(proposal, checks);
  }
  const candidate = current[0];
  if (!sameProvenance(candidate.provenance, offered.provenance)) {
    fail(
      checks,
      'current-candidate',
      'TRANSFORMATION_CANDIDATE_PROVENANCE_CHANGED',
      'The current Candidate was produced by a different algorithm/runtime basis; regenerate the handoff before using the proposal.',
    );
    return finish(proposal, checks);
  }
  pass(
    checks,
    'current-candidate',
    'TRANSFORMATION_CURRENT_CANDIDATE_REDISCOVERED',
  );

  if (proposal.targetState === 'linked') {
    if (!candidate.reference) {
      fail(
        checks,
        'transformation-contract',
        'TRANSFORMATION_LINK_REFERENCE_UNAVAILABLE',
        'The current Candidate has no locally generated MMI reference.',
      );
      return finish(proposal, checks);
    }
    pass(
      checks,
      'transformation-contract',
      'TRANSFORMATION_LINK_USES_LOCAL_REFERENCE',
    );
    const notationValidation = await validateAiHandoffNotationProposal({
      handoff: input.handoff,
      rawNotation: candidate.reference,
      markdownFilePath: input.markdownFilePath,
      workspaceRoot: input.workspaceRoot,
    });
    if (notationValidation.status !== 'accepted') {
      fail(
        checks,
        'authority-revalidation',
        'TRANSFORMATION_LINK_AUTHORITY_REVALIDATION_BLOCKED',
        notationValidation.checks
          .filter((item) => item.status === 'failed')
          .map((item) => `${item.check}:${item.code}`)
          .join(', '),
      );
      return finish(proposal, checks, notationValidation);
    }
    pass(
      checks,
      'authority-revalidation',
      'TRANSFORMATION_LINK_AUTHORITY_REVALIDATED',
    );
    return finish(
      proposal,
      checks,
      notationValidation,
      {
        operation: 'link-existing-reference',
        candidate: proposal.candidate,
        notation: candidate.reference,
      },
    );
  }

  const extraction = extractionPlan(candidate, proposal.candidate);
  if (!extraction.ok) {
    fail(
      checks,
      'transformation-contract',
      extraction.code,
      extraction.detail,
    );
    return finish(proposal, checks);
  }
  pass(
    checks,
    'transformation-contract',
    'TRANSFORMATION_EXTRACTION_CONTRACT_SUPPORTED',
  );
  pass(
    checks,
    'authority-revalidation',
    'TRANSFORMATION_EXTRACTION_CURRENT_CANDIDATE_REVALIDATED',
  );
  return finish(proposal, checks, undefined, extraction.plan);
}

function rediscoverCandidates(
  sourcePath: string,
  sourceLabel: string,
  sourceDigest: string,
  kind: CandidateKind,
): Candidate[] {
  if (kind === 'table-range') {
    const workbook = loadWorkbook({ absolutePath: sourcePath });
    return Object.entries(workbook.sheets).flatMap(
      ([sheetName, sheet]) =>
        tableCandidates({
          source: sourceLabel,
          sourceDigest,
          sheetName,
          sheet,
        }),
    );
  }
  if (kind === 'image') {
    if (!/\.(xlsx|xlsm)$/iu.test(sourcePath)) return [];
    const images = readExcelImages(fs.readFileSync(sourcePath));
    if (images.diagnostics.some((item) => item.severity === 'error')) {
      return [];
    }
    return imageCandidates({
      source: sourceLabel,
      sourceDigest,
      images: images.images,
    });
  }
  return [];
}

function extractionPlan(
  candidate: Candidate,
  identity: HandoffCandidateIdentity,
):
  | { ok: true; plan: AiHandoffTransformationPlan }
  | { ok: false; code: string; detail: string } {
  if (candidate.kind === 'table-range') {
    if (!candidate.locator.sheet || !candidate.locator.range) {
      return {
        ok: false,
        code: 'TRANSFORMATION_TABLE_LOCATOR_INCOMPLETE',
        detail: 'Table extraction requires a current sheet and range.',
      };
    }
    return {
      ok: true,
      plan: {
        operation: 'extract-standard-asset',
        candidate: identity,
        candidateKind: 'table-range',
        conversion: 'gfm-table-v1',
      },
    };
  }

  if (candidate.kind === 'image') {
    const format = candidate.claims.find(
      (claim) =>
        claim.aspect === 'format'
        && claim.status === 'observed'
        && typeof claim.value === 'string',
    )?.value;
    if (
      typeof format !== 'string'
      || !EXTRACTABLE_IMAGE_FORMATS.has(format.toLowerCase())
    ) {
      return {
        ok: false,
        code: 'TRANSFORMATION_IMAGE_FORMAT_UNSUPPORTED',
        detail: `Image format is not extractable: ${String(format ?? 'missing')}`,
      };
    }
    return {
      ok: true,
      plan: {
        operation: 'extract-standard-asset',
        candidate: identity,
        candidateKind: 'image',
        conversion: 'raw-image-bytes-v1',
      },
    };
  }

  return {
    ok: false,
    code: 'TRANSFORMATION_CANDIDATE_KIND_UNSUPPORTED',
    detail: `No Extracted path is implemented for Candidate kind ${candidate.kind}.`,
  };
}

const EXTRACTABLE_IMAGE_FORMATS = new Set([
  'png',
  'jpeg',
  'gif',
  'bmp',
  'svg',
]);

function offeredCandidate(
  handoff: AiHandoffPackageV1,
  digest: string,
): OfferedCandidate | undefined {
  const matches: OfferedCandidate[] = [];

  for (const item of handoff.confirmedFacts) {
    if (item.candidateIdentity.digest === digest) {
      matches.push({
        identity: item.candidateIdentity,
        kind: item.candidateKind,
        locator: item.locator,
        provenance: item.provenance,
      });
    }
  }
  for (const item of handoff.inferredCandidates) {
    if (item.candidateIdentity.digest === digest) {
      matches.push({
        identity: item.candidateIdentity,
        kind: item.kind,
        locator: item.locator,
        provenance: item.provenance,
      });
    }
  }
  for (const item of handoff.unresolvedIssues) {
    if (
      item.kind === 'abstained-claim'
      && item.candidateIdentity.digest === digest
    ) {
      matches.push({
        identity: item.candidateIdentity,
        kind: item.candidateKind,
        locator: item.locator,
        provenance: item.provenance,
      });
    }
  }
  if (matches.length === 0) return undefined;
  const canonical = canonicalJson({
    kind: matches[0].kind,
    locator: matches[0].locator,
    provenance: matches[0].provenance,
  });
  return matches.every(
    (item) =>
      canonicalJson({
        kind: item.kind,
        locator: item.locator,
        provenance: item.provenance,
      }) === canonical,
  )
    ? matches[0]
    : undefined;
}

function sameProvenance(
  current: Provenance,
  offered: HandoffProvenanceView,
): boolean {
  return canonicalJson(current) === canonicalJson(offered);
}

function isProposal(
  value: unknown,
): value is AiHandoffTransformationProposalV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proposal = value as Partial<AiHandoffTransformationProposalV1>
    & Record<string, unknown>;
  const keys = Object.keys(proposal).sort();
  if (
    JSON.stringify(keys)
    !== JSON.stringify([
      'candidate',
      'rationale',
      'schema',
      'targetState',
      'unresolved',
    ])
  ) return false;
  return proposal.schema === AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA
    && isIdentity(proposal.candidate)
    && (
      proposal.targetState === 'linked'
      || proposal.targetState === 'extracted'
    )
    && typeof proposal.rationale === 'string'
    && proposal.rationale.trim().length > 0
    && Array.isArray(proposal.unresolved)
    && proposal.unresolved.every((item) => typeof item === 'string');
}

function isIdentity(value: unknown): value is HandoffCandidateIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Partial<HandoffCandidateIdentity>
    & Record<string, unknown>;
  const keys = Object.keys(identity).sort();
  return JSON.stringify(keys)
      === JSON.stringify(['algorithm', 'digest', 'representation'])
    && identity.algorithm === 'sha256'
    && identity.representation === 'mmi-candidate-occurrence-content-v1'
    && typeof identity.digest === 'string'
    && /^sha256:[0-9a-f]{64}$/u.test(identity.digest);
}

function normalizeSource(source: string): string {
  return source.replaceAll('\\', '/');
}

/** Order in which checks are reported; a check that did not run is reported as `not-run`. */
const CHECK_ORDER: readonly AiHandoffTransformationCheckName[] = [
  'package',
  'proposal-schema',
  'operation-boundary',
  'candidate-allowlist',
  'source-identity',
  'current-candidate',
  'transformation-contract',
  'authority-revalidation',
];

function finish(
  proposal: unknown,
  checks: Map<
    AiHandoffTransformationCheckName,
    AiHandoffTransformationCheck
  >,
  notationValidation?: AiHandoffProposalValidationV1,
  plan?: AiHandoffTransformationPlan,
): AiHandoffTransformationValidationV1 {
  const ordered = CHECK_ORDER.map((name) =>
    checks.get(name) ?? {
      check: name,
      status: 'not-run' as const,
      code: 'CHECK_NOT_RUN',
    });
  const parsed = isProposal(proposal) ? proposal : undefined;
  return {
    schema: AI_HANDOFF_TRANSFORMATION_VALIDATION_SCHEMA,
    handoffSchema: AI_HANDOFF_SCHEMA,
    proposalDigest: `sha256:${createHash('sha256')
      .update(canonicalJson(proposal), 'utf8')
      .digest('hex')}`,
    status: ordered.every((item) => item.status === 'passed')
      ? 'accepted-for-review'
      : 'blocked',
    ...(parsed ? {
      candidate: parsed.candidate,
      targetState: parsed.targetState,
    } : {}),
    ...(plan ? { plan } : {}),
    ...(notationValidation ? { notationValidation } : {}),
    checks: ordered,
  };
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function pass(
  checks: Map<
    AiHandoffTransformationCheckName,
    AiHandoffTransformationCheck
  >,
  check: AiHandoffTransformationCheckName,
  code: string,
): void {
  checks.set(check, { check, status: 'passed', code });
}

function fail(
  checks: Map<
    AiHandoffTransformationCheckName,
    AiHandoffTransformationCheck
  >,
  check: AiHandoffTransformationCheckName,
  code: string,
  detail: string,
): void {
  checks.set(check, { check, status: 'failed', code, detail });
}
