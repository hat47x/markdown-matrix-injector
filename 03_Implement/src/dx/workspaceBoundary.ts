import fs from 'node:fs';
import path from 'node:path';

import {
  isPathWithinBoundary,
  resolveSourcePath,
} from '../core/pathResolver.js';

/**
 * Candidate listing must use a path-segment boundary, not string-prefix
 * matching. In a multi-root workspace, e.g. /work/app and /work/app-old,
 * startsWith('/work/app') would otherwise admit a sibling root.
 *
 * Existing paths are realpath-resolved on both sides so a symlink located
 * inside the workspace cannot expose a source outside the workspace.
 * Missing paths fall back to lexical containment and will fail later during
 * normal source loading.
 */
export function isWorkspaceFileCandidate(
  candidatePath: string,
  workspaceRoot: string,
): boolean {
  let boundary = path.resolve(workspaceRoot);
  let candidate = path.resolve(candidatePath);

  try {
    boundary = fs.realpathSync(boundary);
  } catch {
    // Best effort; workspace existence is owned by the host.
  }
  try {
    candidate = fs.realpathSync(candidate);
  } catch {
    // A disappearing file is still checked lexically and rejected later.
  }

  return isPathWithinBoundary(candidate, boundary);
}


/**
 * Resolves a source for guided authoring with the same precedence and
 * containment rules as the renderer/diagnostics Authority path.
 *
 * - document-relative existing source first;
 * - then workspace-root-relative existing source;
 * - reject sources outside the workspace (including symlink escapes);
 * - return undefined instead of reading an untrusted/unavailable source.
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
  } catch {
    return undefined;
  }
}
