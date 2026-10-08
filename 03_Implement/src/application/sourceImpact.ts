import fs from 'node:fs';
import path from 'node:path';

import { isPathWithinBoundary } from '../core/pathResolver.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';
import {
  extractedProvenance,
  type ExtractedProvenance,
} from './detachFreshness.js';
import { markdownLinkTargets } from './detachCheck.js';

export const SOURCE_IMPACT_SCHEMA = 'mmi.source-impact/v1' as const;

export type SourceImpactRelation =
  | 'linked'
  | 'extracted'
  | 'local-link';

export type SourceImpactResolution =
  | 'resolved'
  | 'path-only';

export interface SourceImpactRecord {
  document: string;
  line: number;
  relation: SourceImpactRelation;
  resolution: SourceImpactResolution;
  sourceReference: string;
  kind?: string;
  sheet?: string;
  place?: string;
}

export interface SourceImpactReport {
  schema: typeof SOURCE_IMPACT_SCHEMA;
  source: {
    path: string;
    exists: boolean;
    digest?: string;
  };
  documentsScanned: number;
  counts: {
    linked: number;
    extracted: number;
    localLink: number;
    total: number;
  };
  impacts: SourceImpactRecord[];
}

export interface AnalyzeSourceImpactOptions {
  sourcePath: string;
  workspaceRoot: string;
}

/**
 * Read-only workspace impact analysis for one source file.
 *
 * This intentionally scans current Markdown instead of maintaining a second
 * persistent index. It reports live MMI embeds, adopted extracted provenance,
 * and ordinary local Markdown links to the same source.
 *
 * A missing source can still be queried by its old path. In that case path
 * matches are marked path-only and no source content is needed.
 */
export function analyzeSourceImpact(
  options: AnalyzeSourceImpactOptions,
): SourceImpactReport {
  const workspaceRoot = canonicalPotentialPath(
    path.resolve(options.workspaceRoot),
  );
  const requestedSource = path.resolve(options.sourcePath);
  const canonicalSource = canonicalPotentialPath(requestedSource);

  if (!isPathWithinBoundary(canonicalSource, workspaceRoot)) {
    throw new Error(
      'Impact source is outside workspace boundary: ' + options.sourcePath,
    );
  }

  const exists = fs.existsSync(requestedSource);
  if (exists && !fs.statSync(requestedSource).isFile()) {
    throw new Error(
      'Impact source must be a file when it exists: ' + options.sourcePath,
    );
  }

  const sourceDigest = exists
    ? readSourceFileIdentity(requestedSource).digest
    : undefined;
  const markdownFiles = collectMarkdownFiles(path.resolve(options.workspaceRoot));
  const impacts: SourceImpactRecord[] = [];

  for (const markdownFilePath of markdownFiles) {
    const markdown = fs.readFileSync(markdownFilePath, 'utf8');
    collectLinkedImpacts(
      markdown,
      markdownFilePath,
      workspaceRoot,
      canonicalSource,
      impacts,
    );
    collectExtractedImpacts(
      markdown,
      markdownFilePath,
      workspaceRoot,
      canonicalSource,
      impacts,
    );
    collectLocalLinkImpacts(
      markdown,
      markdownFilePath,
      workspaceRoot,
      canonicalSource,
      impacts,
    );
  }

  impacts.sort((left, right) =>
    left.document.localeCompare(right.document)
    || left.line - right.line
    || left.relation.localeCompare(right.relation)
    || left.sourceReference.localeCompare(right.sourceReference));

  const linked = impacts.filter((item) => item.relation === 'linked').length;
  const extracted = impacts.filter((item) => item.relation === 'extracted').length;
  const localLink = impacts.filter((item) => item.relation === 'local-link').length;

  return {
    schema: SOURCE_IMACT_SCHEMA,
    source: {
      path: portableRelativePath(
        path.resolve(options.workspaceRoot),
        requestedSource,
      ),
      exists,
      ...(sourceDigest ? { digest: sourceDigest } : {}),
    },
    documentsScanned: markdownFiles.length,
    counts: {
      linked,
      extracted,
      localLink,
      total: impacts.length,
    },
    impacts,
  };
}

function collectLinkedImpacts(
  markdown: string,
  markdownFilePath: string,
  workspaceRoot: string,
  canonicalSource: string,
  impacts: SourceImpactRecord[],
): void {
  forEachMarkdownLineOutsideFence(markdown, (line, lineNumber) => {
    for (const embed of extractEmbedQueries(line)) {
      const match = matchMmiSourceReference(
        markdownFilePath,
        workspaceRoot,
        embed.filepath,
        canonicalSource,
      );
      if (!match) continue;
      impacts.push({
        document: portableRelativePath(workspaceRoot, markdownFilePath),
        line: lineNumber,
        relation: 'linked',
        resolution: match,
        sourceReference: embed.filepath,
        kind: 'mmi-embed',
        ...(embed.target ? { sheet: embed.target } : {}),
        ...(embed.range ? { place: embed.range } : {}),
      });
    }
  });
}

function collectExtractedImpacts(
  markdown: string,
  markdownFilePath: string,
  workspaceRoot: string,
  canonicalSource: string,
  impacts: SourceImpactRecord[],
): void {
  for (const record of extractedProvenance(markdown)) {
    const match = matchDocumentRelativeReference(
      markdownFilePath,
      workspaceRoot,
      record.source,
      canonicalSource,
    );
    if (!match) continue;
    impacts.push(extractedImpact(
      record,
      portableRelativePath(workspaceRoot, markdownFilePath),
      match,
    ));
  }
}

function extractedImpact(
  record: ExtractedProvenance,
  document: string,
  resolution: SourceImpactResolution,
): SourceImpactRecord {
  return {
    document,
    line: record.line,
    relation: 'extracted',
    resolution,
    sourceReference: record.source,
    kind: record.kind,
    ...(record.sheet ? { sheet: record.sheet } : {}),
    ...(record.place ? { place: record.place } : {}),
  };
}

function collectLocalLinkImpacts(
  markdown: string,
  markdownFilePath: string,
  workspaceRoot: string,
  canonicalSource: string,
  impacts: SourceImpactRecord[],
): void {
  forEachMarkdownLineOutsideFence(markdown, (line, lineNumber) => {
    for (const target of markdownLinkTargets(line)) {
      const match = matchDocumentRelativeReference(
        markdownFilePath,
        workspaceRoot,
        target,
        canonicalSource,
      );
      if (!match) continue;
      impacts.push({
        document: portableRelativePath(workspaceRoot, markdownFilePath),
        line: lineNumber,
        relation: 'local-link',
        resolution: match,
        sourceReference: target,
      });
    }
  });
}

function matchMmiSourceReference(
  markdownFilePath: string,
  workspaceRoot: string,
  sourceReference: string,
  canonicalSource: string,
): SourceImpactResolution | undefined {
  if (isExternalOrFragmentReference(sourceReference)) return undefined;

  const decoded = decodedLocalPath(sourceReference);
  const candidates = [
    path.resolve(path.dirname(markdownFilePath), decoded),
    path.resolve(workspaceRoot, decoded),
  ].filter((candidate, index, all) =>
    all.findIndex((item) => item === candidate) === index);

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (existing) {
    const canonical = canonicalPotentialPath(existing);
    if (!isPathWithinBoundary(
      canonical,
      canonicalPotentialPath(path.resolve(workspaceRoot)),
    )) {
      return undefined;
    }
    return canonical === canonicalSource ? 'resolved' : undefined;
  }

  return candidates.some((candidate) =>
    canonicalPotentialPath(candidate) === canonicalSource)
    ? 'path-only'
    : undefined;
}

function matchDocumentRelativeReference(
  markdownFilePath: string,
  workspaceRoot: string,
  sourceReference: string,
  canonicalSource: string,
): SourceImpactResolution | undefined {
  if (isExternalOrFragmentReference(sourceReference)) return undefined;
  const candidate = path.resolve(
    path.dirname(markdownFilePath),
    decodedLocalPath(sourceReference),
  );
  const canonical = canonicalPotentialPath(candidate);
  if (!isPathWithinBoundary(
    canonical,
    canonicalPotentialPath(path.resolve(workspaceRoot)),
  )) {
    return undefined;
  }
  if (canonical !== canonicalSource) return undefined;
  return fs.existsSync(candidate) ? 'resolved' : 'path-only';
}

function isExternalOrFragmentReference(value: string): boolean {
  return (
    !value
    || value.startsWith('#')
    || /^[a-z][a-z0-9+.-]*:/iu.test(value)
  );
}

function decodedLocalPath(value: string): string {
  let raw = value.split('#', 1)[0];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Invalid encoding is treated literally and will normally not match.
  }
  return raw;
}

function forEachMarkdownLineOutsideFence(
  markdown: string,
  visit: (line: string, lineNumber: number) => void,
): void {
  let inFence = false;
  const lines = markdown.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:\x60{3}|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) visit(line, index + 1);
  }
}

function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  const excludedDirectories = new Set([
    '.git',
    'node_modules',
    'dist',
    'artifacts',
  ]);

  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (excludedDirectories.has(entry.name) && entry.isDirectory()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (
        entry.isFile()
        && /\.(?:md|markdown)$/iu.test(entry.name)
      ) {
        files.push(absolute);
      }
    }
  };

  visit(root);
  return files.sort();
}

function portableRelativePath(root: string, target: string): string {
  return (
    path.relative(path.resolve(root), path.resolve(target))
      .split(path.sep)
      .join('/')
    || path.basename(target)
  );
}

/**
 * Canonicalize existing path prefixes even when the final target has already
 * been deleted. This keeps symlink containment checks meaningful for impact
 * analysis of missing sources.
 */
function canonicalPotentialPath(target: string): string {
  let cursor = path.resolve(target);
  const suffix: string[] = [];

  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }

  let canonicalPrefix = cursor;
  try {
    canonicalPrefix = fs.realpathSync(cursor);
  } catch {
    canonicalPrefix = path.resolve(cursor);
  }
  return path.resolve(canonicalPrefix, ...suffix);
}
