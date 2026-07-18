export interface FileSnapshot {
  mtimeMs: number;
}

export interface CachedWorkbook<T> {
  snapshot: FileSnapshot;
  workbook: T;
}

export class WorkbookCache<T> {
  private readonly cache = new Map<string, CachedWorkbook<T>>();

  get(path: string, snapshot: FileSnapshot): T | undefined {
    const cached = this.cache.get(path);
    if (!cached) {
      return undefined;
    }

    if (cached.snapshot.mtimeMs !== snapshot.mtimeMs) {
      this.cache.delete(path);
      return undefined;
    }

    return cached.workbook;
  }

  set(path: string, snapshot: FileSnapshot, workbook: T): void {
    this.cache.set(path, { snapshot, workbook });
  }

  getOrCreate(path: string, snapshot: FileSnapshot, loader: () => T): T {
    const cached = this.get(path, snapshot);
    if (cached) {
      return cached;
    }

    const workbook = loader();
    this.set(path, snapshot, workbook);
    return workbook;
  }

  clear(): void {
    this.cache.clear();
  }
}
