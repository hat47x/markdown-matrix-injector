/**
 * Evidence-oriented evaluation for a baseline XLSX converter (issue-0200).
 *
 * The report deliberately records what the converter emitted and what MMI
 * observed from the source. It does not infer Candidate reconciliation from
 * Markdown text.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { BaselineConverter } from '../core/baselineImport.js';
import { inspectSource } from '../cli/mmi.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';

export interface MarkItDownSheetEvidence {
  sheet: string;
  markdownHeadingPresent: boolean;
}

export interface MarkItDownSourceImageEvidence {
  sheet: string;
  range?: string;
  name?: string;
  digest: string;
}

export interface MarkItDownBaselineEvaluation {
  schema: 'mmi.baseline-converter-evaluation/v1';
  converter: { id: string; version: string };
  source: {
    /** Stable report label, not a machine-local absolute path. */
    label: string;
    digest: string;
    sheetCount: number;
    candidateCounts: Readonly<Record<string, number>>;
    images: MarkItDownSourceImageEvidence[];
  };
  markdown: {
    artifact: string;
    digest: string;
    bytes: number;
    sheetEvidence: MarkItDownSheetEvidence[];
    tableSeparatorLineCount: number;
    imageReferenceCount: number;
  };
  reconciliation: {
    /** A whole-document Markdown file has no Candidate locator mapping by itself. */
    candidateAddressability: 'not-provided-by-baseline-artifact';
    automaticImportDecision: 'none';
  };
}

export async function evaluateMarkItDownBaseline(options: {
  sourcePath: string;
  outputRoot: string;
  converter: BaselineConverter;
  sourceLabel?: string;
}): Promise<MarkItDownBaselineEvaluation> {
  const sourcePath = path.resolve(options.sourcePath);
  const outputRoot = path.resolve(options.outputRoot);
  const sourceLabel = options.sourceLabel ?? path.basename(sourcePath);
  if (!sourceLabel.trim()) throw new Error('baseline evaluation sourceLabel must not be empty');
  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const inspected = inspectSource(sourcePath, 0);

  const conversion = await options.converter.convert({
    sourcePath,
    outputRoot,
    options: {},
  });
  const markdownArtifacts = conversion.artifacts.filter(
    (artifact) => artifact.kind === 'markdown',
  );
  if (markdownArtifacts.length !== 1) {
    throw new Error(
      `baseline evaluation requires exactly one Markdown artifact; got ${markdownArtifacts.length}`,
    );
  }

  const artifact = markdownArtifacts[0];
  const artifactPath = resolveContainedArtifact(outputRoot, artifact.relativePath);
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error('baseline evaluation Markdown artifact does not exist');
  }
  const artifactBytes = fs.readFileSync(artifactPath);
  const actualDigest = `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`;
  if (actualDigest !== artifact.contentDigest) {
    throw new Error('baseline evaluation Markdown artifact digest mismatch');
  }
  const markdown = artifactBytes.toString('utf8');
  const lines = markdown.split(/\r?\n/u);
  const normalizedLines = new Set(lines.map((line) => line.trim()));

  const candidateCounts: Record<string, number> = {};
  for (const candidate of inspected.candidates) {
    candidateCounts[candidate.kind] = (candidateCounts[candidate.kind] ?? 0) + 1;
  }

  return {
    schema: 'mmi.baseline-converter-evaluation/v1',
    converter: { ...options.converter.descriptor },
    source: {
      label: sourceLabel,
      digest: sourceDigest,
      sheetCount: inspected.sheets.length,
      candidateCounts,
      images: inspected.images.map((image) => ({
        sheet: image.sheet,
        ...(image.range ? { range: image.range } : {}),
        ...(image.name ? { name: image.name } : {}),
        digest: image.digest,
      })),
    },
    markdown: {
      artifact: artifact.relativePath,
      digest: artifact.contentDigest,
      bytes: artifactBytes.byteLength,
      sheetEvidence: inspected.sheets.map((sheet) => ({
        sheet: sheet.name,
        markdownHeadingPresent: normalizedLines.has(`## ${sheet.name}`),
      })),
      tableSeparatorLineCount: lines.filter((line) => isMarkdownTableSeparator(line)).length,
      imageReferenceCount: countImageReferences(markdown),
    },
    reconciliation: {
      candidateAddressability: 'not-provided-by-baseline-artifact',
      automaticImportDecision: 'none',
    },
  };
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function countImageReferences(markdown: string): number {
  const markdownImages = markdown.match(/!\[[^\]]*\]\([^\n)]*\)/gu)?.length ?? 0;
  const htmlImages = markdown.match(/<img\b/giu)?.length ?? 0;
  return markdownImages + htmlImages;
}


function resolveContainedArtifact(outputRoot: string, relativePath: string): string {
  if (
    path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
  ) {
    throw new Error('baseline evaluation artifact path must be relative');
  }
  const portable = relativePath.replace(/\\/gu, '/');
  const normalized = path.posix.normalize(portable);
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('\0')
  ) {
    throw new Error('baseline evaluation artifact path escapes outputRoot');
  }
  const resolved = path.resolve(outputRoot, ...normalized.split('/'));
  const relative = path.relative(outputRoot, resolved);
  if (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error('baseline evaluation artifact path escapes outputRoot');
  }
  return resolved;
}


export function parseMarkItDownBaselineEvaluation(
  text: string,
): MarkItDownBaselineEvaluation {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error('baseline evaluation report is not valid JSON', { cause: error });
  }
  assertEvaluationReport(value);
  return value;
}

export function verifyMarkItDownBaselineEvaluationArtifact(
  report: MarkItDownBaselineEvaluation,
  outputRoot: string,
): void {
  assertEvaluationReport(report);
  const artifactPath = resolveContainedArtifact(
    path.resolve(outputRoot),
    report.markdown.artifact,
  );
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error('baseline evaluation Markdown artifact does not exist');
  }
  const bytes = fs.readFileSync(artifactPath);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== report.markdown.digest) {
    throw new Error('baseline evaluation Markdown artifact digest mismatch');
  }
  if (bytes.byteLength !== report.markdown.bytes) {
    throw new Error('baseline evaluation Markdown artifact byte size mismatch');
  }
}

function assertEvaluationReport(value: unknown): asserts value is MarkItDownBaselineEvaluation {
  const report = asRecord('report', value);
  assertExactKeys('report', report, ['schema', 'converter', 'source', 'markdown', 'reconciliation']);
  if (report.schema !== 'mmi.baseline-converter-evaluation/v1') {
    throw new Error('unsupported baseline evaluation report schema');
  }

  const converter = asRecord('converter', report.converter);
  assertExactKeys('converter', converter, ['id', 'version']);
  assertNonEmpty('converter.id', converter.id);
  assertNonEmpty('converter.version', converter.version);

  const source = asRecord('source', report.source);
  assertExactKeys('source', source, ['label', 'digest', 'sheetCount', 'candidateCounts', 'images']);
  assertNonEmpty('source.label', source.label);
  assertSha256('source.digest', source.digest);
  assertNonNegativeInteger('source.sheetCount', source.sheetCount);

  const candidateCounts = asRecord('source.candidateCounts', source.candidateCounts);
  for (const [kind, count] of Object.entries(candidateCounts)) {
    assertNonEmpty('source.candidateCounts kind', kind);
    assertNonNegativeInteger(`source.candidateCounts.${kind}`, count);
  }

  if (!Array.isArray(source.images)) throw new Error('source.images must be an array');
  for (const [index, image] of source.images.entries()) {
    const record = asRecord(`source.images[${index}]`, image);
    assertAllowedKeys(
      `source.images[${index}]`,
      record,
      ['sheet', 'range', 'name', 'digest'],
      ['sheet', 'digest'],
    );
    assertNonEmpty(`source.images[${index}].sheet`, record.sheet);
    if (record.range !== undefined) assertNonEmpty(`source.images[${index}].range`, record.range);
    if (record.name !== undefined) assertNonEmpty(`source.images[${index}].name`, record.name);
    assertSha256(`source.images[${index}].digest`, record.digest);
  }
  const imageCandidateCount = candidateCounts.image ?? 0;
  if (imageCandidateCount !== source.images.length) {
    throw new Error('source image Candidate count does not match source.images');
  }

  const markdown = asRecord('markdown', report.markdown);
  assertExactKeys(
    'markdown',
    markdown,
    ['artifact', 'digest', 'bytes', 'sheetEvidence', 'tableSeparatorLineCount', 'imageReferenceCount'],
  );
  assertPortableRelativePath('markdown.artifact', markdown.artifact);
  assertSha256('markdown.digest', markdown.digest);
  assertNonNegativeInteger('markdown.bytes', markdown.bytes);
  assertNonNegativeInteger('markdown.tableSeparatorLineCount', markdown.tableSeparatorLineCount);
  assertNonNegativeInteger('markdown.imageReferenceCount', markdown.imageReferenceCount);
  if (!Array.isArray(markdown.sheetEvidence)) {
    throw new Error('markdown.sheetEvidence must be an array');
  }
  if (markdown.sheetEvidence.length !== source.sheetCount) {
    throw new Error('markdown.sheetEvidence length must equal source.sheetCount');
  }
  for (const [index, item] of markdown.sheetEvidence.entries()) {
    const record = asRecord(`markdown.sheetEvidence[${index}]`, item);
    assertExactKeys(`markdown.sheetEvidence[${index}]`, record, ['sheet', 'markdownHeadingPresent']);
    assertNonEmpty(`markdown.sheetEvidence[${index}].sheet`, record.sheet);
    if (typeof record.markdownHeadingPresent !== 'boolean') {
      throw new Error(`markdown.sheetEvidence[${index}].markdownHeadingPresent must be boolean`);
    }
  }

  const reconciliation = asRecord('reconciliation', report.reconciliation);
  assertExactKeys(
    'reconciliation',
    reconciliation,
    ['candidateAddressability', 'automaticImportDecision'],
  );
  if (reconciliation.candidateAddressability !== 'not-provided-by-baseline-artifact') {
    throw new Error('unsupported reconciliation.candidateAddressability');
  }
  if (reconciliation.automaticImportDecision !== 'none') {
    throw new Error('baseline evaluation must not carry an automatic import decision');
  }
}

function asRecord(name: string, value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  name: string,
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  assertAllowedKeys(name, value, keys, keys);
}

function assertAllowedKeys(
  name: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${name} has unexpected field: ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`${name} is missing field: ${key}`);
  }
}

function assertNonEmpty(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertSha256(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${name} must be a sha256: digest`);
  }
}

function assertNonNegativeInteger(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertPortableRelativePath(name: string, value: unknown): asserts value is string {
  assertNonEmpty(name, value);
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error(`${name} must be relative`);
  }
  const portable = value.replace(/\\/gu, '/');
  const normalized = path.posix.normalize(portable);
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('\0')
  ) {
    throw new Error(`${name} must stay within its artifact root`);
  }
}
