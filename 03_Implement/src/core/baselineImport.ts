/**
 * Baseline bulk-import orchestration (issue-0200).
 *
 * External converters may create Markdown/assets, but they never decide import
 * identity. MMI-owned Candidates are reconciled explicitly and only matched
 * decisions are written to the issue-0195 import ledger.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { candidateProblem, type Candidate, type Evidence } from './candidate.js';
import {
  entryFor,
  readLedger,
  recordEntries,
  type Ledger,
  type LedgerEntry,
} from './importLedger.js';
import { readSourceFileIdentity } from './sourceIdentity.js';

export interface BaselineConverterDescriptor {
  id: string;
  version: string;
}

export interface BaselineConversionArtifact {
  /** Converter-run-local identifier used by reconciliation decisions. */
  id: string;
  kind: 'markdown' | 'asset';
  /** Path relative to outputRoot. Absolute/traversing paths are rejected. */
  relativePath: string;
  /** Digest of the bytes actually written by the converter. */
  contentDigest: string;
  mediaType?: string;
}

export interface BaselineConversionOutput {
  artifacts: readonly BaselineConversionArtifact[];
}

export interface BaselineConverterInput {
  sourcePath: string;
  outputRoot: string;
  options: Readonly<Record<string, string | number | boolean>>;
}

export interface BaselineConverter {
  descriptor: BaselineConverterDescriptor;
  convert(input: BaselineConverterInput): Promise<BaselineConversionOutput>;
}

export type CandidateReconciliationStatus = 'matched' | 'unmatched' | 'ambiguous';

export interface CandidateReconciliationDecision {
  candidateIndex: number;
  status: CandidateReconciliationStatus;
  /**
   * Required only for matched decisions. Unmatched/ambiguous Candidates must
   * remain outside the ledger even if the converter happened to emit files.
   */
  artifactId?: string;
  /** Explicit reason/evidence from the reconciler; never inferred by the orchestrator. */
  evidence: readonly Evidence[];
}

export interface CandidateReconcilerInput {
  sourcePath: string;
  sourceDigest: string;
  candidates: readonly Candidate[];
  conversion: BaselineConversionOutput;
  converter: BaselineConverterDescriptor;
}

export interface CandidateReconciler {
  reconcile(input: CandidateReconcilerInput): Promise<readonly CandidateReconciliationDecision[]>;
}

export interface BaselineImportOptions {
  sourcePath: string;
  outputRoot: string;
  ledgerPath: string;
  candidates: readonly Candidate[];
  converter: BaselineConverter;
  reconciler: CandidateReconciler;
  conversionOptions?: Readonly<Record<string, string | number | boolean>>;
}

export interface BaselineImportResult {
  converter: BaselineConverterDescriptor;
  sourceDigest: string;
  conversion: BaselineConversionOutput;
  decisions: readonly CandidateReconciliationDecision[];
  ledgerEntries: readonly LedgerEntry[];
  ledger: Ledger;
}

/**
 * Execute the four explicit phases:
 *   source -> baseline converter -> Candidate reconciliation -> import ledger.
 *
 * Fail closed:
 * - every Candidate must receive exactly one explicit reconciliation decision;
 * - only matched decisions may name an artifact;
 * - every artifact must stay under outputRoot and its digest must match bytes;
 * - unmatched/ambiguous Candidates are never recorded as imported.
 */
export async function runBaselineImport(
  options: BaselineImportOptions,
): Promise<BaselineImportResult> {
  assertText('converter.id', options.converter.descriptor.id);
  assertText('converter.version', options.converter.descriptor.version);

  const sourcePath = path.resolve(options.sourcePath);
  const outputRoot = path.resolve(options.outputRoot);
  const ledgerPath = path.resolve(options.ledgerPath);
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;

  for (const [index, candidate] of options.candidates.entries()) {
    const problem = candidateProblem(candidate);
    if (problem) throw new Error(`candidate ${index}: ${problem}`);
    if (candidate.locator.sourceDigest !== sourceDigest) {
      throw new Error(`candidate ${index}: sourceDigest does not match current source bytes`);
    }
  }

  const conversionOptions = options.conversionOptions ?? {};
  const conversion = await options.converter.convert({
    sourcePath,
    outputRoot,
    options: conversionOptions,
  });
  const artifacts = validateArtifacts(conversion.artifacts, outputRoot);
  const decisions = await options.reconciler.reconcile({
    sourcePath,
    sourceDigest,
    candidates: options.candidates,
    conversion,
    converter: options.converter.descriptor,
  });
  validateDecisions(decisions, options.candidates.length, artifacts);

  const ledgerEntries = decisions
    .filter((decision) => decision.status === 'matched')
    .map((decision) => {
      const candidate = options.candidates[decision.candidateIndex];
      const artifact = artifacts.get(decision.artifactId!);
      if (!artifact) throw new Error('internal error: validated artifact disappeared');
      const outputFile = resolveOutputPath(outputRoot, artifact.relativePath);
      return entryFor(
        ledgerPath,
        sourcePath,
        candidate,
        outputFile,
        `baseline converter reconciliation: ${options.converter.descriptor.id}@${options.converter.descriptor.version}`,
        {
          mode: 'baseline-converter-v1',
          converterId: options.converter.descriptor.id,
          converterVersion: options.converter.descriptor.version,
          artifactId: artifact.id,
          artifactDigest: artifact.contentDigest,
          ...conversionOptions,
        },
      );
    });

  const ledger = ledgerEntries.length > 0
    ? recordEntries(ledgerPath, ledgerEntries)
    : readLedger(ledgerPath);

  return {
    converter: { ...options.converter.descriptor },
    sourceDigest,
    conversion,
    decisions: [...decisions],
    ledgerEntries,
    ledger,
  };
}

function validateArtifacts(
  artifacts: readonly BaselineConversionArtifact[],
  outputRoot: string,
): Map<string, BaselineConversionArtifact> {
  const byId = new Map<string, BaselineConversionArtifact>();
  for (const [index, artifact] of artifacts.entries()) {
    assertText(`artifact ${index}.id`, artifact.id);
    if (byId.has(artifact.id)) throw new Error(`duplicate artifact id: ${artifact.id}`);
    if (artifact.kind !== 'markdown' && artifact.kind !== 'asset') {
      throw new Error(`artifact ${artifact.id}: unsupported kind`);
    }
    assertText(`artifact ${artifact.id}.relativePath`, artifact.relativePath);
    assertSha256(`artifact ${artifact.id}.contentDigest`, artifact.contentDigest);
    if (artifact.mediaType !== undefined) assertText(`artifact ${artifact.id}.mediaType`, artifact.mediaType);

    const outputFile = resolveOutputPath(outputRoot, artifact.relativePath);
    if (!fs.existsSync(outputFile) || !fs.statSync(outputFile).isFile()) {
      throw new Error(`artifact ${artifact.id}: output file does not exist`);
    }
    const actualDigest = `sha256:${createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex')}`;
    if (actualDigest !== artifact.contentDigest) {
      throw new Error(`artifact ${artifact.id}: contentDigest does not match output bytes`);
    }
    byId.set(artifact.id, artifact);
  }
  return byId;
}

function validateDecisions(
  decisions: readonly CandidateReconciliationDecision[],
  candidateCount: number,
  artifacts: ReadonlyMap<string, BaselineConversionArtifact>,
): void {
  if (decisions.length !== candidateCount) {
    throw new Error(`reconciler must decide every Candidate exactly once: expected ${candidateCount}, got ${decisions.length}`);
  }

  const seen = new Set<number>();
  for (const decision of decisions) {
    if (!Number.isInteger(decision.candidateIndex)
      || decision.candidateIndex < 0
      || decision.candidateIndex >= candidateCount) {
      throw new Error(`invalid candidateIndex: ${decision.candidateIndex}`);
    }
    if (seen.has(decision.candidateIndex)) {
      throw new Error(`duplicate reconciliation decision for candidate ${decision.candidateIndex}`);
    }
    seen.add(decision.candidateIndex);

    if (!['matched', 'unmatched', 'ambiguous'].includes(decision.status)) {
      throw new Error(`candidate ${decision.candidateIndex}: unsupported reconciliation status`);
    }
    if (decision.evidence.length === 0) {
      throw new Error(`candidate ${decision.candidateIndex}: reconciliation evidence is required`);
    }
    for (const [evidenceIndex, evidence] of decision.evidence.entries()) {
      assertText(
        `candidate ${decision.candidateIndex}.evidence ${evidenceIndex}.code`,
        evidence.code,
      );
      if (evidence.detail !== undefined) {
        assertText(
          `candidate ${decision.candidateIndex}.evidence ${evidenceIndex}.detail`,
          evidence.detail,
        );
      }
    }

    if (decision.status === 'matched') {
      assertText(`candidate ${decision.candidateIndex}.artifactId`, decision.artifactId);
      if (!artifacts.has(decision.artifactId)) {
        throw new Error(`candidate ${decision.candidateIndex}: matched artifact does not exist`);
      }
    } else if (decision.artifactId !== undefined) {
      throw new Error(
        `candidate ${decision.candidateIndex}: ${decision.status} decision must not name an artifact`,
      );
    }
  }
}

function resolveOutputPath(outputRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('artifact relativePath must be relative');
  const resolved = path.resolve(outputRoot, relativePath);
  const relative = path.relative(outputRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('artifact relativePath escapes outputRoot');
  }
  return resolved;
}

function assertText(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertSha256(name: string, value: string): void {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${name} must be a sha256: digest`);
  }
}
