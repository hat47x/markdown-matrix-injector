/**
 * Evidence-oriented evaluation for a baseline XLSX converter (issue-0200).
 *
 * The report deliberately records what the converter emitted and what MMI
 * observed from the source. It does not infer Candidate reconciliation from
 * Markdown text.
 */
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
  const artifactPath = path.resolve(outputRoot, ...artifact.relativePath.split('/'));
  const markdown = fs.readFileSync(artifactPath, 'utf8');
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
      bytes: Buffer.byteLength(markdown, 'utf8'),
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
