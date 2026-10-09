/**
 * One mtime-keyed workbook cache for extension-host interactive features
 * (completion and guided authoring), so a book is parsed once per change
 * rather than once per feature. Table search owns a separate worker-local
 * cache; the preview renderer keeps its own cache.
 */
import { WorkbookCache } from '../cache/workbookCache.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';

const cache = new WorkbookCache<WorkbookData>();

/** Throws when the file is missing or unreadable. */
export function readWorkbookCached(absolutePath: string): WorkbookData {
  return loadWorkbook({ absolutePath, cache });
}

export function tryReadWorkbookCached(absolutePath: string): WorkbookData | undefined {
  try {
    return readWorkbookCached(absolutePath);
  } catch {
    return undefined;
  }
}


/**
 * External workbook saves invalidate completion and guided-authoring reads.
 * Callers use this explicitly because filesystem mtime granularity is not a
 * sufficient freshness signal on every host/filesystem.
 */
export function clearSharedWorkbookCache(): void {
  cache.clear();
}
