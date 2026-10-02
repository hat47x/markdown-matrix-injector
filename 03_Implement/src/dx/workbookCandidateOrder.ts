import path from 'node:path';

export interface WorkbookFileCandidate {
  readonly fsPath: string;
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
      normalizePath(left.fsPath).localeCompare(normalizePath(right.fsPath))
    );
  });
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

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll('\\', '/').toLocaleLowerCase();
}
