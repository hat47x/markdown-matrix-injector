/**
 * Book-level region catalog with diff updates keyed on (mtime, size)
 * (input-assistance-cpu-search.md §2.2). A book is re-read only when its
 * file stat changed, never per keystroke. Indexing is cooperative: it yields
 * between books, honours an `AbortSignal`, reports progress, and stops at a
 * region cap instead of growing without bound.
 *
 * The catalog holds content-derived data (titles, headers, a bounded value
 * sample) -- design §2.1 requires it to stay local, cover only explicitly
 * listed files, and be deletable; `clear()` / `removeBook()` do the latter
 * and nothing here writes to disk.
 */
import type { WorkbookData } from '../core/workbookLoader.js';
import { detectTableRegions } from '../importAssist/tableRegions.js';
import type { DetectOptions, DetectedRegion } from './regionDetector.js';
import { addTextFeatures, DEFAULT_ROLE_WEIGHTS, type FeatureBag } from './textFeatures.js';

export interface RegionRecord extends DetectedRegion {
  /** Stable id: `${bookPath}#${sheet}!${a1}`. */
  id: string;
  bookPath: string;
  /** File name without directory or extension, used as a book-role feature. */
  bookStem: string;
}

export interface BookStat {
  mtimeMs: number;
  size: number;
}

interface BookEntry {
  stat: BookStat;
  regions: RegionRecord[];
  /** False when the book was intentionally truncated by the retained-region cap. */
  complete: boolean;
}

export class RegionCatalog {
  private readonly books = new Map<string, BookEntry>();
  private version = 0;

  /** True when `path` is unknown or its stat differs from the indexed one. */
  needsUpdate(path: string, stat: BookStat): boolean {
    const entry = this.books.get(path);
    return !entry || entry.stat.mtimeMs !== stat.mtimeMs || entry.stat.size !== stat.size;
  }

  /** False only when the retained-region cap truncated this book. */
  isBookComplete(path: string): boolean {
    return this.books.get(path)?.complete ?? false;
  }

  setBook(
    path: string,
    stat: BookStat,
    workbook: WorkbookData,
    options: DetectOptions = {},
    maxRegions = Number.POSITIVE_INFINITY,
  ): RegionRecord[] {
    const stem = bookStemOf(path);
    const regions: RegionRecord[] = [];
    const limit = Number.isFinite(maxRegions) ? Math.max(0, Math.floor(maxRegions)) : Number.POSITIVE_INFINITY;
    let complete = true;

    outer:
    for (const [sheetName, sheet] of Object.entries(workbook.sheets)) {
      for (const region of detectTableRegions(sheetName, sheet, options)) {
        if (regions.length >= limit) {
          complete = false;
          break outer;
        }
        regions.push({ ...region, id: `${path}#${sheetName}!${region.a1}`, bookPath: path, bookStem: stem });
      }
    }
    this.books.set(path, { stat, regions, complete });
    this.version += 1;
    return regions;
  }

  removeBook(path: string): boolean {
    const removed = this.books.delete(path);
    if (removed) this.version += 1;
    return removed;
  }

  clear(): void {
    this.books.clear();
    this.version += 1;
  }

  regionsOf(path: string): readonly RegionRecord[] {
    return this.books.get(path)?.regions ?? [];
  }

  regions(): RegionRecord[] {
    return [...this.books.values()].flatMap((entry) => entry.regions);
  }

  bookPaths(): string[] {
    return [...this.books.keys()];
  }

  /** Increments on every change; retrievers use it to detect staleness. */
  get changeVersion(): number {
    return this.version;
  }

  get regionCount(): number {
    let count = 0;
    for (const entry of this.books.values()) count += entry.regions.length;
    return count;
  }
}

export interface IndexFilesOptions {
  statFile(path: string): BookStat;
  loadWorkbook(path: string): WorkbookData;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, path: string) => void;
  /** Hard upper bound on regions retained by the catalog across all books. */
  maxRegions?: number;
  detect?: DetectOptions;
}

export interface IndexFilesResult {
  updated: string[];
  unchanged: string[];
  failed: { path: string; message: string }[];
  cancelled: boolean;
  capped: boolean;
}

/**
 * Brings the catalog up to date for `paths`. Books no longer listed are
 * removed (the index covers only what the caller explicitly named). Unreadable
 * books are reported, not fatal. Cancellation leaves every already-indexed
 * book intact and consistent.
 */
export async function indexWorkbookFiles(
  catalog: RegionCatalog,
  paths: readonly string[],
  options: IndexFilesOptions,
): Promise<IndexFilesResult> {
  const result: IndexFilesResult = { updated: [], unchanged: [], failed: [], cancelled: false, capped: false };
  const wanted = new Set(paths);
  for (const known of catalog.bookPaths()) if (!wanted.has(known)) catalog.removeBook(known);

  let done = 0;
  for (const path of paths) {
    if (options.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    try {
      const stat = options.statFile(path);
      const changed = catalog.needsUpdate(path, stat);
      const complete = catalog.isBookComplete(path);

      if (!changed && complete) {
        result.unchanged.push(path);
      } else {
        const currentCount = catalog.regionsOf(path).length;
        const retainedWithoutCurrent = catalog.regionCount - currentCount;
        const roomForBook =
          options.maxRegions === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(0, options.maxRegions - retainedWithoutCurrent);

        // An unchanged, already-truncated book cannot grow until another book
        // is removed (or the configured cap increases). Avoid re-reading it on
        // every refresh while still reporting that the catalog is capped.
        if (roomForBook <= 0 || (!changed && !complete && roomForBook <= currentCount)) {
          result.capped = true;
          break;
        }

        catalog.setBook(path, stat, options.loadWorkbook(path), options.detect, roomForBook);
        result.updated.push(path);
        if (!catalog.isBookComplete(path)) result.capped = true;
      }
    } catch (error) {
      catalog.removeBook(path);
      result.failed.push({ path, message: error instanceof Error ? error.message : String(error) });
    }
    done += 1;
    options.onProgress?.(done, paths.length, path);
    if (result.capped) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return result;
}

/**
 * The weighted feature bag for one region -- the single definition of "what
 * a region looks like" to every retriever (design §4.1).
 */
export function regionFeatureBag(region: RegionRecord, weights = DEFAULT_ROLE_WEIGHTS): FeatureBag {
  const bag: FeatureBag = new Map();
  addTextFeatures(bag, region.bookStem, weights.book);
  addTextFeatures(bag, region.sheet, weights.sheet);
  if (region.title) addTextFeatures(bag, region.title, weights.title);
  for (const header of region.headers ?? []) if (header) addTextFeatures(bag, header, weights.header);
  for (const value of region.valueSample) addTextFeatures(bag, value, weights.value);
  return bag;
}

/** Exact-match names of a region: book stem, sheet, title, headers. */
export function regionNames(region: RegionRecord): { role: 'book' | 'sheet' | 'title' | 'header'; text: string }[] {
  const names: { role: 'book' | 'sheet' | 'title' | 'header'; text: string }[] = [
    { role: 'book', text: region.bookStem },
    { role: 'sheet', text: region.sheet },
  ];
  if (region.title) names.push({ role: 'title', text: region.title });
  for (const header of region.headers ?? []) if (header) names.push({ role: 'header', text: header });
  return names;
}

function bookStemOf(path: string): string {
  const base = path.split(/[\\/]/u).pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
