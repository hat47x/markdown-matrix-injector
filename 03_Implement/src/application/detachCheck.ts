import fs from 'node:fs';
import path from 'node:path';

import { extractEmbedQueries } from '../parser/embedSyntax.js';
import { isPathWithinBoundary } from '../core/pathResolver.js';

export interface DetachProblem {
  /** Markdown artifact containing the problem, relative to workspaceRoot. */
  file?: string;
  line: number;
  code:
    | 'MMI_DETACH_REFERENCE_REMAINS'
    | 'MMI_DETACH_UNMATERIALIZED'
    | 'MMI_DETACH_LEGACY_CARD'
    | 'MMI_DETACH_BROKEN_LINK'
    | 'MMI_DETACH_LINK_OUTSIDE_ROOT';
  message: string;
  target?: string;
}

export interface DetachCheckResult {
  errors: number;
  problems: DetachProblem[];
}

export interface DetachCheckOptions {
  markdownFilePath: string;
  workspaceRoot: string;
}

/**
 * Verify the artifact graph being handed off is no longer dependent on MMI or
 * source references.
 *
 * Local Markdown links are traversed recursively so a clean root document
 * cannot hide an unresolved dependency in a detached attachment. Cycles are
 * safe: each Markdown artifact is inspected at most once.
 *
 * This checks artifact closure, not business correctness.
 */
export function checkDetachedDocument(
  options: DetachCheckOptions,
): DetachCheckResult {
  const problems: DetachProblem[] = [];
  const visited = new Set<string>();
  inspectMarkdownArtifact(
    path.resolve(options.markdownFilePath),
    path.resolve(options.workspaceRoot),
    visited,
    problems,
  );
  return { errors: problems.length, problems };
}

function inspectMarkdownArtifact(
  markdownFilePath: string,
  workspaceRoot: string,
  visited: Set<string>,
  problems: DetachProblem[],
): void {
  const resolvedFile = path.resolve(markdownFilePath);
  const visitKey = canonicalExistingPath(resolvedFile);
  if (visited.has(visitKey)) return;
  visited.add(visitKey);

  const text = fs.readFileSync(resolvedFile, 'utf8');
  const lines = text.split(/\r?\n/);
  const file = relativeArtifactPath(workspaceRoot, resolvedFile);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/u.test(line)) inFence = !inFence;
    if (inFence) continue;

    for (const embed of extractEmbedQueries(line)) {
      problems.push({
        file,
        line: index + 1,
        code: 'MMI_DETACH_REFERENCE_REMAINS',
        message:
          'MMI reference remains; materialize it before removing the source',
        target: embed.raw,
      });
    }

    if (line.includes('<!-- mmi:unmaterialized')) {
      problems.push({
        file,
        line: index + 1,
        code: 'MMI_DETACH_UNMATERIALIZED',
        message:
          'materialization left an unresolved source-dependent reference',
      });
    }

    if (/^\s*>\s*別紙:/u.test(line)) {
      problems.push({
        file,
        line: index + 1,
        code: 'MMI_DETACH_LEGACY_CARD',
        message: 'legacy 別紙 card contains no detached artifact',
      });
    }

    for (const target of markdownLinkTargets(line)) {
      const resolved = resolveLocalLink(
        resolvedFile,
        workspaceRoot,
        target,
      );
      if (!resolved) continue;

      if (resolved.outsideRoot) {
        problems.push({
          file,
          line: index + 1,
          code: 'MMI_DETACH_LINK_OUTSIDE_ROOT',
          message:
            `local link leaves the detach workspace boundary: ${target}`,
          target,
        });
        continue;
      }

      if (!fs.existsSync(resolved.absolutePath)) {
        problems.push({
          file,
          line: index + 1,
          code: 'MMI_DETACH_BROKEN_LINK',
          message: `local link target does not exist: ${target}`,
          target,
        });
        continue;
      }

      if (
        fs.statSync(resolved.absolutePath).isFile()
        && isMarkdownArtifact(resolved.absolutePath)
      ) {
        inspectMarkdownArtifact(
          resolved.absolutePath,
          workspaceRoot,
          visited,
          problems,
        );
      }
    }
  }
}

function relativeArtifactPath(
  workspaceRoot: string,
  markdownFilePath: string,
): string {
  return (
    path.relative(workspaceRoot, markdownFilePath)
      .split(path.sep)
      .join('/')
    || path.basename(markdownFilePath)
  );
}

function isMarkdownArtifact(filePath: string): boolean {
  return /\.(?:md|markdown)$/iu.test(filePath);
}

export function markdownLinkTargets(line: string): string[] {
  const targets: string[] = [];
  const pattern = /!?\[[^\]]*\]\((?<target>[^)]+)\)/gu;
  for (const match of line.matchAll(pattern)) {
    const raw = match.groups?.target?.trim();
    if (!raw) continue;
    // A destination may be followed by a Markdown title. Paths containing
    // spaces should normally be percent encoded; preserve <...> destinations.
    const target = raw.startsWith('<') && raw.includes('>')
      ? raw.slice(1, raw.indexOf('>'))
      : raw.split(/\s+["']/u, 1)[0];
    targets.push(target);
  }
  return targets;
}

function resolveLocalLink(
  markdownFilePath: string,
  workspaceRoot: string,
  rawTarget: string,
): { absolutePath: string; outsideRoot: boolean } | undefined {
  if (
    !rawTarget
    || rawTarget.startsWith('#')
    || /^[a-z][a-z0-9+.-]*:/iu.test(rawTarget)
  ) {
    return undefined;
  }
  let decoded = rawTarget.split('#', 1)[0];
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Invalid percent encoding is treated as a literal path and will fail
    // visibly if absent.
  }
  const absolutePath = path.resolve(
    path.dirname(markdownFilePath),
    decoded,
  );
  const checkedRoot = canonicalExistingPath(path.resolve(workspaceRoot));
  const checkedTarget = canonicalExistingPath(absolutePath);
  return {
    absolutePath,
    outsideRoot: !isPathWithinBoundary(checkedTarget, checkedRoot),
  };
}

function canonicalExistingPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}
