import path from 'node:path';

import {
  isPathWithinBoundary,
  PathVerificationError,
  resolveSourcePath,
  verifiedRealPath,
} from '../core/pathResolver.js';

/**
 * Candidate listing must use a path-segment boundary, not string-prefix
 * matching. In a multi-root workspace, e.g. /work/app and /work/app-old,
 * startsWith('/work/app') would otherwise admit a sibling root.
 *
 * Existing paths are realpath-resolved on both sides so a symlink located
 * inside the workspace cannot expose a source outside the workspace.
 * An unresolvable candidate fails the listing instead of being treated as
 * verified or silently omitted.
 */
export function isWorkspaceFileCandidate(
  candidatePath: string,
  workspaceRoot: string,
): boolean {
  const boundary = path.resolve(workspaceRoot);
  const candidate = path.resolve(candidatePath);
  if (!isPathWithinBoundary(candidate, boundary)) return false;
  return isPathWithinBoundary(verifiedRealPath(candidate), verifiedRealPath(boundary));
}


/**
 * Resolves a source for guided authoring with the same precedence and
 * containment rules as the renderer/diagnostics Authority path.
 *
 * - document-relative existing source first;
 * - then workspace-root-relative existing source;
 * - reject sources outside the workspace (including symlink escapes);
 * - return undefined for an untrusted/unavailable source;
 * - propagate an unverified real path instead of treating it as absent.
 */
export function resolveAuthoringSourcePath(
  sourcePath: string,
  markdownFilePath: string,
  workspaceRoot?: string,
): string | undefined {
  try {
    return resolveSourcePath({
      markdownFilePath,
      sourcePath,
      workspaceRoot,
    });
  } catch (error) {
    if (error instanceof PathVerificationError) throw error;
    return undefined;
  }
}
