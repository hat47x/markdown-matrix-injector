import fs from 'node:fs';
import path from 'node:path';

import { isPathWithinBoundary } from '../core/pathResolver.js';

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
