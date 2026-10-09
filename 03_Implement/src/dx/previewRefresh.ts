import path from 'node:path';

import { extractEmbedQueries } from '../parser/embedSyntax.js';

function decodedLocalReference(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizedFilesystemPath(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32'
    ? normalized.toLocaleLowerCase('en-US')
    : normalized;
}

function localReferenceCandidates(
  sourceReference: string,
  markdownFilePath: string,
  workspaceRoot?: string,
): string[] {
  const decoded = decodedLocalReference(sourceReference);
  if (path.isAbsolute(decoded)) {
    return [normalizedFilesystemPath(decoded)];
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(decoded)) {
    return [];
  }
  const candidates = [
    path.resolve(path.dirname(markdownFilePath), decoded),
    ...(workspaceRoot ? [path.resolve(workspaceRoot, decoded)] : []),
  ];
  return [...new Set(candidates.map(normalizedFilesystemPath))];
}

/**
 * Returns true only when the Markdown text contains an MMI embed that can
 * resolve to the changed workbook. This is intentionally source-specific:
 * unrelated workbook saves must not force preview work.
 *
 * Both document-relative and workspace-root-relative MMI references are
 * considered because diagnostics and authoring support both forms.
 */
export function markdownReferencesWorkbook(
  markdownText: string,
  markdownFilePath: string,
  sourcePath: string,
  workspaceRoot?: string,
): boolean {
  const source = normalizedFilesystemPath(sourcePath);
  return extractEmbedQueries(markdownText).some((embed) =>
    localReferenceCandidates(
      embed.filepath,
      markdownFilePath,
      workspaceRoot,
    ).includes(source),
  );
}


export interface WorkbookRefreshBatchScheduler {
  schedule(sourcePath: string): void;
  dispose(): void;
}

export interface WorkbookRefreshClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WorkbookRefreshBatchDependencies {
  flush(sourcePaths: readonly string[]): void | Promise<unknown>;
  onError?(error: unknown): void;
  clock?: WorkbookRefreshClock;
}

const SYSTEM_REFRESH_CLOCK: WorkbookRefreshClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Coalesces filesystem watcher bursts while retaining every changed source.
 * Excel saves may emit several change/create/delete events and may touch more
 * than one workbook before the debounce window closes.
 */
export function createWorkbookRefreshBatchScheduler(
  dependencies: WorkbookRefreshBatchDependencies,
  delayMs = 150,
): WorkbookRefreshBatchScheduler {
  const clock = dependencies.clock ?? SYSTEM_REFRESH_CLOCK;
  const pending = new Set<string>();
  let timer: unknown;
  let disposed = false;

  const run = (): void => {
    timer = undefined;
    if (disposed || pending.size === 0) return;
    const batch = [...pending];
    pending.clear();
    try {
      void Promise.resolve(dependencies.flush(batch)).catch((error) => {
        dependencies.onError?.(error);
      });
    } catch (error) {
      dependencies.onError?.(error);
    }
  };

  return {
    schedule(sourcePath: string): void {
      if (disposed) return;
      pending.add(normalizedFilesystemPath(sourcePath));
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = clock.setTimeout(run, delayMs);
    },
    dispose(): void {
      disposed = true;
      pending.clear();
      if (timer !== undefined) {
        clock.clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
