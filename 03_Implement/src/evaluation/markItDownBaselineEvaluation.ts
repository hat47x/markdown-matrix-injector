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
    path: string;
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
}): Promise<MarkItDownBaselineEvaluation> {
  const sourcePath = path.resolve(options.sourcePath);
  const outputRoot = path.resolve(options.outputRoot);
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
      path: sourcePath,
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
