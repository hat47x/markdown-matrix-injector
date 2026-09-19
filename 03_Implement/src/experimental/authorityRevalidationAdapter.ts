import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  PathContainmentError,
  resolveSourcePath,
} from '../core/pathResolver.js';
import { renderEmbedCard } from '../core/renderCard.js';
import { renderEmbedFrame } from '../core/renderEmbedFrame.js';
import { renderEmbedTable } from '../core/renderTable.js';
import {
  shouldRenderAsCardAfterLoad,
  shouldRenderAsCardImmediately,
} from '../core/smartFallback.js';
import type { WorkbookData } from '../core/workbookLoader.js';
import {
  parseEmbedSyntax,
  type EmbedQuery,
} from '../parser/embedSyntax.js';
import {
  validateKnownEmbedQueryParameters,
} from '../parser/parameterContract.js';
import {
  AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
  type AuthorityRevalidationCheckResult,
  type AuthorityRevalidationIssuer,
  type AuthorityRevalidationReceiptV1,
} from './authorityRevalidationReceipt.js';
import {
  COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
  type AuthorityRevalidationCheck,
  type CognitiveReviewEnvelope,
} from './cognitiveReviewEnvelope.js';

export type AuthorityWorkbookLoader =
  (absolutePath: string) => WorkbookData;

export interface ExecutableProposalAuthorityRevalidationInput<
  TChoice extends string = string,
> {
  envelope: CognitiveReviewEnvelope<TChoice>;
  rawNotation: string;
  markdownFilePath: string;
  workspaceRoot?: string;
  workbook?: WorkbookData;
  workbookLoader?: AuthorityWorkbookLoader;
  issuer: AuthorityRevalidationIssuer;
  uriScheme?: string;
}

interface EvaluationContext {
  query?: EmbedQuery;
  resolvedPath?: string;
  containmentFailure?: PathContainmentError;
  resolveFailure?: Error;
}

interface PreviewEvaluation {
  sourceLoadAttempted: boolean;
}

const CHECK_ORDER: readonly AuthorityRevalidationCheck[] = [
  'source-identity',
  'profile-compatibility',
  'parser',
  'parameter-schema',
  'resolver',
  'containment',
  'source-existence',
  'preview',
];

export function runExecutableProposalAuthorityRevalidation<
  TChoice extends string,
>(
  input: ExecutableProposalAuthorityRevalidationInput<TChoice>,
): AuthorityRevalidationReceiptV1 {
  assertEnvelopeShape(input.envelope);
  assertWorkbookInput(input);

  const results = new Map<
    AuthorityRevalidationCheck,
    AuthorityRevalidationCheckResult
  >();

  const query = parseEmbedSyntax(input.rawNotation);
  if (query) {
    setPassed(results, 'parser', 'PARSER_ACCEPTED');
  } else {
    setFailed(
      results,
      'parser',
      'PARSER_REJECTED',
      'Notation could not be parsed as one MMI embed.',
    );
  }

  if (query) {
    const parameterIssue =
      validateKnownEmbedQueryParameters(query.params)[0];
    if (parameterIssue) {
      setFailed(
        results,
        'parameter-schema',
        'PARAMETER_VOCABULARY_REJECTED',
        parameterIssue.message,
      );
    } else {
      setPassed(
        results,
        'parameter-schema',
        'PARAMETER_VOCABULARY_ACCEPTED',
      );
    }
  } else {
    setFailed(
      results,
      'parameter-schema',
      'PARAMETER_VOCABULARY_NOT_VERIFIED',
      'Parameter validation requires a parsed MMI embed.',
    );
  }

  if (profileContractMatches(input.envelope)) {
    setPassed(
      results,
      'profile-compatibility',
      'PROFILE_CONTRACT_MATCHED',
    );
  } else {
    setFailed(
      results,
      'profile-compatibility',
      'PROFILE_CONTRACT_MISMATCH',
      'Visible Perception candidates and approved Profile references are inconsistent.',
    );
  }

  const context = resolveContext(input, query);
  applyResolutionChecks(results, context);

  const sourceDigestBefore = evaluateSourceIdentity(
    results,
    input.envelope.sourceDigest,
    context,
  );

  const preview = evaluatePreview(results, input, context);

  if (
    preview.sourceLoadAttempted
    && context.resolvedPath
    && sourceDigestBefore
  ) {
    verifySourceUnchangedAfterLoad(
      results,
      context.resolvedPath,
      sourceDigestBefore,
    );
  }

  const checks = input.envelope.authorityRevalidation.map((requirement) => {
    const result = results.get(requirement.check);
    if (!result) {
      throw new Error(
        `Authority adapter failed to produce required check: ${requirement.check}.`,
      );
    }
    return result;
  });

  assertCheckOrder(input.envelope, checks);

  return {
    schemaVersion: AUTHORITY_REVALIDATION_RECEIPT_SCHEMA_VERSION,
    envelopeSchemaVersion: COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION,
    sourceDigest: input.envelope.sourceDigest,
    scope: 'executable-proposal',
    issuer: { ...input.issuer },
    checks,
  };
}

function resolveContext<TChoice extends string>(
  input: ExecutableProposalAuthorityRevalidationInput<TChoice>,
  query: EmbedQuery | null,
): EvaluationContext {
  if (!query) return {};

  try {
    return {
      query,
      resolvedPath: resolveSourcePath({
        markdownFilePath: input.markdownFilePath,
        sourcePath: query.filepath,
        ...(input.workspaceRoot === undefined
          ? {}
          : { workspaceRoot: input.workspaceRoot }),
      }),
    };
  } catch (error) {
    if (error instanceof PathContainmentError) {
      return {
        query,
        containmentFailure: error,
      };
    }
    return {
      query,
      resolveFailure: error instanceof Error
        ? error
        : new Error('Unknown source resolution error.'),
    };
  }
}

function applyResolutionChecks(
  results: Map<AuthorityRevalidationCheck, AuthorityRevalidationCheckResult>,
  context: EvaluationContext,
): void {
  if (context.resolvedPath) {
    setPassed(results, 'resolver', 'SOURCE_PATH_RESOLVED');
    setPassed(results, 'containment', 'WORKSPACE_CONTAINMENT_PASSED');

    try {
      const stat = fs.statSync(context.resolvedPath);
      if (stat.isFile()) {
        setPassed(results, 'source-existence', 'SOURCE_FILE_EXISTS');
      } else {
        setFailed(
          results,
          'source-existence',
          'SOURCE_NOT_REGULAR_FILE',
          'Resolved source path is not a regular file.',
        );
      }
    } catch (error) {
      setFailed(
        results,
        'source-existence',
        'SOURCE_STAT_FAILED',
        errorMessage(error),
      );
    }
    return;
  }

  if (context.containmentFailure) {
    setFailed(
      results,
      'resolver',
      'SOURCE_PATH_REJECTED',
      context.containmentFailure.message,
    );
    setFailed(
      results,
      'containment',
      'WORKSPACE_CONTAINMENT_REJECTED',
      context.containmentFailure.message,
    );
    setFailed(
      results,
      'source-existence',
      'SOURCE_EXISTENCE_NOT_VERIFIED',
      'Source existence is not trusted outside the workspace boundary.',
    );
    return;
  }

  setFailed(
    results,
    'resolver',
    'SOURCE_PATH_UNRESOLVED',
    context.resolveFailure?.message ?? 'Source path was not resolved.',
  );
  setFailed(
    results,
    'containment',
    'WORKSPACE_CONTAINMENT_NOT_VERIFIED',
    'Containment cannot be verified until the source path resolves.',
  );
  setFailed(
    results,
    'source-existence',
    'SOURCE_FILE_NOT_RESOLVED',
    context.resolveFailure?.message ?? 'Source file was not resolved.',
  );
}

function evaluatePreview<TChoice extends string>(
  results: Map<AuthorityRevalidationCheck, AuthorityRevalidationCheckResult>,
  input: ExecutableProposalAuthorityRevalidationInput<TChoice>,
  context: EvaluationContext,
): PreviewEvaluation {
  if (!context.query || !context.resolvedPath) {
    setFailed(
      results,
      'preview',
      'PREVIEW_NOT_VERIFIED',
      'Preview requires a parsed notation and contained resolved source path.',
    );
    return { sourceLoadAttempted: false };
  }

  let sourceLoadAttempted = false;

  try {
    const query = context.query;
    let html: string;

    if (shouldRenderAsCardImmediately(query)) {
      html = renderEmbedFrame(
        query,
        renderEmbedCard(
          query,
          context.resolvedPath,
          input.uriScheme,
        ),
      );
    } else {
      let workbook = input.workbook;
      if (!workbook && input.workbookLoader) {
        sourceLoadAttempted = true;
        try {
          workbook = input.workbookLoader(context.resolvedPath);
        } catch (error) {
          setFailed(
            results,
            'preview',
            'PREVIEW_WORKBOOK_LOAD_FAILED',
            errorMessage(error),
          );
          return { sourceLoadAttempted };
        }
      }

      if (!workbook) {
        setFailed(
          results,
          'preview',
          'PREVIEW_WORKBOOK_UNAVAILABLE',
          'WorkbookData or workbookLoader is required for table or after-load Smart Fallback preview.',
        );
        return { sourceLoadAttempted };
      }

      html = shouldRenderAsCardAfterLoad(query, workbook)
        ? renderEmbedFrame(
            query,
            renderEmbedCard(
              query,
              context.resolvedPath,
              input.uriScheme,
            ),
          )
        : renderEmbedFrame(
            query,
            renderEmbedTable(query, workbook),
          );
    }

    if (html.trim().length === 0) {
      setFailed(
        results,
        'preview',
        'PREVIEW_EMPTY',
        'Read-only renderer returned an empty preview.',
      );
      return { sourceLoadAttempted };
    }

    setPassed(results, 'preview', 'READ_ONLY_PREVIEW_RENDERED');
  } catch (error) {
    setFailed(
      results,
      'preview',
      'READ_ONLY_PREVIEW_FAILED',
      errorMessage(error),
    );
  }

  return { sourceLoadAttempted };
}

function evaluateSourceIdentity(
  results: Map<AuthorityRevalidationCheck, AuthorityRevalidationCheckResult>,
  expectedDigest: string,
  context: EvaluationContext,
): string | undefined {
  if (!context.resolvedPath) {
    setFailed(
      results,
      'source-identity',
      'SOURCE_IDENTITY_NOT_VERIFIED',
      'Source identity requires a contained resolved source file.',
    );
    return;
  }

  try {
    const actualDigest = digestFile(context.resolvedPath);
    if (actualDigest === expectedDigest) {
      setPassed(
        results,
        'source-identity',
        'SOURCE_DIGEST_MATCHED',
      );
    } else {
      setFailed(
        results,
        'source-identity',
        'SOURCE_DIGEST_MISMATCH',
        `Resolved source digest ${actualDigest} does not match Envelope digest.`,
      );
    }
    return actualDigest;
  } catch (error) {
    setFailed(
      results,
      'source-identity',
      'SOURCE_DIGEST_READ_FAILED',
      errorMessage(error),
    );
    return;
  }
}

function verifySourceUnchangedAfterLoad(
  results: Map<AuthorityRevalidationCheck, AuthorityRevalidationCheckResult>,
  resolvedPath: string,
  digestBefore: string,
): void {
  try {
    const digestAfter = digestFile(resolvedPath);
    if (digestAfter !== digestBefore) {
      setFailed(
        results,
        'source-identity',
        'SOURCE_CHANGED_DURING_PREVIEW',
        `Source digest changed during Workbook load/preview: ${digestBefore} -> ${digestAfter}.`,
      );
    }
  } catch (error) {
    setFailed(
      results,
      'source-identity',
      'SOURCE_DIGEST_POST_LOAD_FAILED',
      errorMessage(error),
    );
  }
}

function assertWorkbookInput<TChoice extends string>(
  input: ExecutableProposalAuthorityRevalidationInput<TChoice>,
): void {
  if (input.workbook && input.workbookLoader) {
    throw new Error(
      'Provide either preloaded WorkbookData or workbookLoader, not both.',
    );
  }
}

function profileContractMatches<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
): boolean {
  const payload = envelope.perception.signal.payload;
  const candidates = payload.candidates;
  if (candidates.length !== envelope.profiles.length) return false;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const profile = envelope.profiles[index];
    if (!candidate || !profile) return false;
    if (candidate.prototypeId !== profile.id) return false;
    if (profile.featureVersion !== payload.featureVersion) return false;
    if (profile.sourceProfileId !== payload.sourceProfileId) return false;
    if (
      !sameStrings(
        [...profile.sourceEvidence].sort(),
        [...payload.sourceEvidence].sort(),
      )
    ) {
      return false;
    }
    if (
      profile.approvalReference.trim().length === 0
      || profile.baselineSourceDigest.trim().length === 0
    ) {
      return false;
    }
  }

  const winner = payload.winnerPrototypeId;
  return winner === undefined
    || candidates.some((candidate) => candidate.prototypeId === winner);
}

function digestFile(filePath: string): string {
  const digest = createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
  return `sha256:${digest}`;
}

function assertEnvelopeShape<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
): void {
  if (envelope.schemaVersion !== COGNITIVE_REVIEW_ENVELOPE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Cognitive Review Envelope schema: ${String(envelope.schemaVersion)}.`,
    );
  }
  if (envelope.disposition !== 'review-only') {
    throw new Error('Authority adapter requires review-only disposition.');
  }
  if (envelope.writeAuthority !== 'none') {
    throw new Error('Authority adapter requires writeAuthority=none.');
  }
  if (envelope.sourceDigest.trim().length === 0) {
    throw new Error('Authority adapter requires a non-empty source digest.');
  }
}

function assertCheckOrder<TChoice extends string>(
  envelope: CognitiveReviewEnvelope<TChoice>,
  checks: readonly AuthorityRevalidationCheckResult[],
): void {
  const required = envelope.authorityRevalidation.map(
    (requirement) => requirement.check,
  );
  if (!sameStrings(required, CHECK_ORDER)) {
    throw new Error(
      'Authority adapter does not support the current Envelope check contract.',
    );
  }
  if (!sameStrings(
    checks.map((result) => result.check),
    CHECK_ORDER,
  )) {
    throw new Error('Authority adapter emitted checks in an invalid order.');
  }
}

function setPassed(
  results: Map<AuthorityRevalidationCheck, AuthorityRevalidationCheckResult>,
  check: AuthorityRevalidationCheck,
  evidenceCode: string,
): void {
  results.set(check, {
    check,
    status: 'passed',
    evidenceCode,
  });
}

function setFailed(
  results: Map<AuthorityRevalidationCheck, AuthorityRevalidationCheckResult>,
  check: AuthorityRevalidationCheck,
  evidenceCode: string,
  detail: string,
): void {
  results.set(check, {
    check,
    status: 'failed',
    evidenceCode,
    detail,
  });
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Authority error.';
}
