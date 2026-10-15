import path from 'node:path';
import fs from 'node:fs';
import { LocalizedError } from './messages/index.js';

export interface ResolveSourcePathOptions {
  markdownFilePath: string;
  sourcePath: string;
  workspaceRoot?: string;
}

/**
 * Returns true if `candidate` is within (or at) `boundary`.
 * Neither argument needs to be a realpath — path.resolve is sufficient
 * for the workspace-boundary threat model (spec P4 Containment MUST).
 *
 * Exported so diagnostics can reuse the check without duplicating logic.
 */
export function isPathWithinBoundary(candidate: string, boundary: string): boolean {
  const rel = path.relative(boundary, candidate);
  // Allow: non-empty relative path that does NOT escape the boundary
  // (no ".." segments, not absolute — different-drive paths on Windows
  // come back as absolute).
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export class PathContainmentError extends LocalizedError<'outsideBoundary'> {
  constructor(sourcePath: string, candidate: string, boundary: string) {
    super('outsideBoundary', { path: sourcePath, boundary });
    this.name = 'PathContainmentError';
    void candidate; // reserved for future diagnostics
  }
}

export function resolveSourcePath(options: ResolveSourcePathOptions): string {
  const candidates = [
    path.resolve(path.dirname(options.markdownFilePath), options.sourcePath),
    options.workspaceRoot ? path.resolve(options.workspaceRoot, options.sourcePath) : undefined,
  ].filter((value): value is string => Boolean(value));

  // Determine containment boundary (spec P4 Containment MUST).
  // workspaceRoot is the authoritative boundary when available (trust domain).
  // When absent (standalone file), conservatively use the Markdown file's directory.
  const boundary = options.workspaceRoot
    ? path.resolve(options.workspaceRoot)
    : path.resolve(path.dirname(options.markdownFilePath));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      // Defeat symlink bypass: resolve to real path before containment check
      let checkPath = candidate;
      try {
        checkPath = fs.realpathSync(candidate);
      } catch {
        // realpathSync can fail on broken symlinks etc. — best-effort.
      }
      if (!isPathWithinBoundary(checkPath, boundary)) {
        throw new PathContainmentError(options.sourcePath, checkPath, boundary);
      }
      return candidate; // Return the original (non-realpath) path for file access
    }
  }

  throw new LocalizedError('sourceNotResolved', { path: options.sourcePath });
}
