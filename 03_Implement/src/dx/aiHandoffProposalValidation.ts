import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { evaluateEmbed } from '../core/evaluateEmbed.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import { createDiagnosticsForDocument } from './vscodeAdapters.js';
import {
  isKnownEmbedQueryParameter,
  validateKnownEmbedQueryParameters,
} from '../parser/parameterContract.js';
import { parseEmbedSyntax } from '../parser/embedSyntax.js';
import {
  AI_HANDOFF_SCHEMA,
  assertAiHandoffPackage,
  type AiHandoffPackageV1,
} from './aiHandoff.js';

export const AI_HANDOFF_PROPOSAL_VALIDATION_SCHEMA =
  'mmi.ai-handoff-proposal-validation/v1' as const;

export type AiHandoffProposalCheckName =
  | 'package'
  | 'parser'
  | 'parameter-schema'
  | 'source-allowlist'
  | 'diagnostics'
  | 'preview'
  | 'source-identity';

export interface AiHandoffProposalCheck {
  check: AiHandoffProposalCheckName;
  status: 'passed' | 'failed' | 'not-run';
  code: string;
  detail?: string;
}

export interface AiHandoffProposalValidationV1 {
  schema: typeof AI_HANDOFF_PROPOSAL_VALIDATION_SCHEMA;
  handoffSchema: typeof AI_HANDOFF_SCHEMA;
  proposal: {
    algorithm: 'sha256';
    representation: 'mmi-notation-trimmed-utf8-v1';
    digest: string;
  };
  status: 'accepted' | 'blocked';
  checks: readonly AiHandoffProposalCheck[];
}

export interface ValidateAiHandoffNotationProposalInput {
  handoff: AiHandoffPackageV1;
  rawNotation: string;
  markdownFilePath: string;
  workspaceRoot: string;
}

const CHECK_ORDER: readonly AiHandoffProposalCheckName[] = [
  'package',
  'parser',
  'parameter-schema',
  'source-allowlist',
  'diagnostics',
  'source-identity',
  'preview',
];

export async function validateAiHandoffNotationProposal(
  input: ValidateAiHandoffNotationProposalInput,
): Promise<AiHandoffProposalValidationV1> {
  assertAiHandoffPackage(input.handoff);
  const checks = new Map<AiHandoffProposalCheckName, AiHandoffProposalCheck>();
  pass(checks, 'package', 'HANDOFF_PACKAGE_ACCEPTED');

  const query = parseEmbedSyntax(input.rawNotation);
  if (!query) {
    fail(
      checks,
      'parser',
      'PROPOSAL_NOT_SINGLE_MMI_EMBED',
      'Returned proposal must be exactly one MMI embed notation.',
    );
    return finish(input.rawNotation, checks);
  }
  pass(checks, 'parser', 'MMI_EMBED_PARSED');

  const unknownParameters = [...new Set(
    [...query.params.keys()].filter((key) => !isKnownEmbedQueryParameter(key)),
  )];
  const invalidParameters = validateKnownEmbedQueryParameters(query.params);
  if (unknownParameters.length > 0) {
    fail(
      checks,
      'parameter-schema',
      'PROPOSAL_UNSUPPORTED_PARAMETER',
      `Unsupported parameter(s): ${unknownParameters.join(', ')}`,
    );
    return finish(input.rawNotation, checks);
  }
  if (invalidParameters.length > 0) {
    fail(
      checks,
      'parameter-schema',
      'PROPOSAL_INVALID_PARAMETER_VALUE',
      invalidParameters.map((issue) => issue.message).join('; '),
    );
    return finish(input.rawNotation, checks);
  }
  pass(checks, 'parameter-schema', 'PROPOSAL_PARAMETERS_ACCEPTED');

  const source = input.handoff.sources.find((item) =>
    normalizedSourceLabel(item.source) === normalizedSourceLabel(query.filepath));
  if (!source) {
    fail(
      checks,
      'source-allowlist',
      'PROPOSAL_SOURCE_NOT_IN_HANDOFF',
      'Proposal source was not present in the locally generated handoff package.',
    );
    return finish(input.rawNotation, checks);
  }
  pass(checks, 'source-allowlist', 'PROPOSAL_SOURCE_IN_HANDOFF');

  const documentDiagnostics = await createDiagnosticsForDocument(
    input.rawNotation,
    input.markdownFilePath,
    input.workspaceRoot,
    {
      fileExists: async (filepath) =>
        fs.existsSync(filepath) && fs.statSync(filepath).isFile(),
      readFile: async (filepath) => fs.readFileSync(filepath),
      readWorkbookSheetNames: async (filepath) =>
        Object.keys(loadWorkbook({ absolutePath: filepath }).sheets),
    },
  );
  if (documentDiagnostics.length > 0) {
    fail(
      checks,
      'diagnostics',
      'PROPOSAL_DIAGNOSTICS_BLOCKED',
      documentDiagnostics
        .map(({ diagnostic }) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('; '),
    );
    return finish(input.rawNotation, checks);
  }
  pass(checks, 'diagnostics', 'PROPOSAL_DIAGNOSTICS_CLEAR');

  let resolvedPath: string;
  let digestBefore: string;
  try {
    resolvedPath = resolveSourcePath({
      markdownFilePath: input.markdownFilePath,
      sourcePath: query.filepath,
      workspaceRoot: input.workspaceRoot,
    });
    digestBefore = readSourceFileIdentity(resolvedPath).digest;
    if (digestBefore !== source.sourceDigest) {
      fail(
        checks,
        'source-identity',
        'PROPOSAL_SOURCE_DIGEST_MISMATCH',
        `Current source digest ${digestBefore} does not match handoff digest ${source.sourceDigest}.`,
      );
      return finish(input.rawNotation, checks);
    }
  } catch (error) {
    fail(
      checks,
      'source-identity',
      'PROPOSAL_SOURCE_DIGEST_UNAVAILABLE',
      error instanceof Error ? error.message : String(error),
    );
    return finish(input.rawNotation, checks);
  }
  pass(checks, 'source-identity', 'PROPOSAL_SOURCE_DIGEST_MATCHED');

  const outcome = evaluateEmbed(query, {
    markdownFilePath: input.markdownFilePath,
    workspaceRoot: input.workspaceRoot,
  });
  if (outcome.kind === 'error') {
    fail(
      checks,
      'preview',
      'PROPOSAL_PREVIEW_BLOCKED',
      outcome.message,
    );
    return finish(input.rawNotation, checks);
  }

  try {
    const digestAfter = readSourceFileIdentity(resolvedPath).digest;
    if (digestAfter !== digestBefore) {
      fail(
        checks,
        'source-identity',
        'PROPOSAL_SOURCE_CHANGED_DURING_PREVIEW',
        `Source digest changed during preview: ${digestBefore} -> ${digestAfter}.`,
      );
      return finish(input.rawNotation, checks);
    }
  } catch (error) {
    fail(
      checks,
      'source-identity',
      'PROPOSAL_SOURCE_DIGEST_POST_PREVIEW_UNAVAILABLE',
      error instanceof Error ? error.message : String(error),
    );
    return finish(input.rawNotation, checks);
  }

  pass(
    checks,
    'preview',
    outcome.kind === 'table'
      ? 'READ_ONLY_TABLE_PREVIEW_ACCEPTED'
      : 'READ_ONLY_CARD_PREVIEW_ACCEPTED',
  );

  return finish(input.rawNotation, checks);
}

function finish(
  rawNotation: string,
  checks: Map<AiHandoffProposalCheckName, AiHandoffProposalCheck>,
): AiHandoffProposalValidationV1 {
  const ordered = CHECK_ORDER.map((check) =>
    checks.get(check) ?? {
      check,
      status: 'not-run' as const,
      code: 'CHECK_NOT_RUN',
    });
  return {
    schema: AI_HANDOFF_PROPOSAL_VALIDATION_SCHEMA,
    handoffSchema: AI_HANDOFF_SCHEMA,
    proposal: proposalIdentity(rawNotation),
    status: ordered.every((item) => item.status === 'passed')
      ? 'accepted'
      : 'blocked',
    checks: ordered,
  };
}

function proposalIdentity(rawNotation: string): AiHandoffProposalValidationV1['proposal'] {
  return {
    algorithm: 'sha256',
    representation: 'mmi-notation-trimmed-utf8-v1',
    digest: `sha256:${createHash('sha256')
      .update(rawNotation.trim(), 'utf8')
      .digest('hex')}`,
  };
}

function normalizedSourceLabel(source: string): string {
  return path.posix.normalize(source.replaceAll('\\', '/'));
}

function pass(
  checks: Map<AiHandoffProposalCheckName, AiHandoffProposalCheck>,
  check: AiHandoffProposalCheckName,
  code: string,
): void {
  checks.set(check, { check, status: 'passed', code });
}

function fail(
  checks: Map<AiHandoffProposalCheckName, AiHandoffProposalCheck>,
  check: AiHandoffProposalCheckName,
  code: string,
  detail: string,
): void {
  checks.set(check, { check, status: 'failed', code, detail });
}
