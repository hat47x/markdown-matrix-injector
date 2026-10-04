import fs from 'node:fs';
import path from 'node:path';

import { isPathWithinBoundary } from '../core/pathResolver.js';

export interface WorkbookFileCandidate {
  readonly fsPath: string;
}

export interface ContainedWorkbookSelection<T extends WorkbookFileCandidate> {
  readonly files: readonly T[];
  /** True only after observing at least one additional contained file beyond limit. */
  readonly truncated: boolean;
  readonly limit: number;
}

/**
 * Orders workspace workbook files for bounded content matching.
 *
 * A workspace cap must not depend on the host's file-enumeration order.
 * Prefer files structurally close to the Markdown document, then use a
 * normalized lexical path as a deterministic tie-breaker.
 */
export function prioritizeWorkbookFiles<T extends WorkbookFileCandidate>(
  markdownFilePath: string,
  candidates: readonly T[],
): T[] {
  const markdownDirectory = path.dirname(path.resolve(markdownFilePath));
  return [...candidates].sort((left, right) => {
    const leftRank = pathDistance(markdownDirectory, left.fsPath);
    const rightRank = pathDistance(markdownDirectory, right.fsPath);
    return (
      leftRank.up - rightRank.up ||
      leftRank.down - rightRank.down ||
      leftRank.total - rightRank.total ||
      compareNormalizedPaths(left.fsPath, right.fsPath)
    );
  });
}

/**
 * Selects at most `limit` workbook files from the active Markdown document's
 * workspace boundary.
 *
 * VS Code `workspace.findFiles()` searches every folder in a multi-root
 * workspace. A string-prefix check is not a containment check
 * (`C:\\work` vs `C:\\work-old`) and does not stop symlink escapes.
 * Reuse the notation P4 containment rule and real paths before any workbook is
 * loaded, then apply locality ordering and the existing file-count budget.
 */
export function selectContainedWorkbookFiles<T extends WorkbookFileCandidate>(
  markdownFilePath: string,
  workspaceRoot: string,
  candidates: readonly T[],
  limit: number,
): T[] {
  return [...selectContainedWorkbookFilesDetailed(markdownFilePath, workspaceRoot, candidates, limit).files];
}

export function selectContainedWorkbookFilesDetailed<T extends WorkbookFileCandidate>(
  markdownFilePath: string,
  workspaceRoot: string,
  candidates: readonly T[],
  limit: number,
): ContainedWorkbookSelection<T> {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('limit must be a non-negative integer.');
  }

  let boundary: string;
  try {
    boundary = fs.realpathSync(path.resolve(workspaceRoot));
  } catch {
    return { files: [], truncated: false, limit };
  }

  const lexicallyContained = candidates.filter((candidate) =>
    isPathWithinBoundary(path.resolve(candidate.fsPath), path.resolve(workspaceRoot)),
  );

  const selected: T[] = [];
  for (const candidate of prioritizeWorkbookFiles(markdownFilePath, lexicallyContained)) {
    try {
      const realCandidate = fs.realpathSync(path.resolve(candidate.fsPath));
      if (!isPathWithinBoundary(realCandidate, boundary)) {
        continue;
      }
      if (selected.length < limit) {
        selected.push(candidate);
        continue;
      }
      // One additional contained file is enough to prove that the bounded
      // search set is incomplete. Do not traverse the rest merely to count it.
      return { files: selected, truncated: true, limit };
    } catch {
      // Missing/unreadable path: do not spend search budget on it.
    }
  }
  return { files: selected, truncated: false, limit };
}

function pathDistance(fromDirectory: string, candidatePath: string): { up: number; down: number; total: number } {
  const relative = path.relative(fromDirectory, path.resolve(candidatePath));
  const segments = relative.split(path.sep).filter(Boolean);
  const up = segments.filter((segment) => segment === '..').length;
  // The final segment is the workbook filename. Directory distance is what
  // expresses locality; every candidate contributes one filename equally.
  const down = Math.max(0, segments.length - up - 1);
  return { up, down, total: up + down };
}

function compareNormalizedPaths(left: string, right: string): number {
  const normalizedLeft = normalizePath(left);
  const normalizedRight = normalizePath(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase();
}
