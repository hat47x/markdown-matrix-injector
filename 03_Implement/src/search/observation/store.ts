/**
 * Local storage of observation records: one JSON object per line in a single file under the
 * workspace's storage folder (never in the repository). Bounded to the newest `max` records,
 * deletable, and silent on failure: a write that cannot happen must never disturb a search.
 *
 * Reading is strict: only a missing file counts as empty. Any other read error propagates, so a
 * transient failure can never make an append overwrite the stored records with a single new one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OBSERVATION_SCHEMA, type ObservationRecord } from './types.js';

export const DEFAULT_MAX_RECORDS = 1000;

export function isObservationRecord(value: unknown): value is ObservationRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ObservationRecord>;
  return record.schema === OBSERVATION_SCHEMA
    && typeof record.at === 'string'
    && typeof record.queries === 'number'
    && typeof record.outcome === 'string'
    && typeof record.final === 'object' && record.final !== null
    && typeof record.final.class === 'string';
}

export class ObservationStore {
  /** Writes are queued so two sessions finishing together cannot read the same old file and drop one record. */
  private queue: Promise<unknown> = Promise.resolve();
  private writes = 0;

  constructor(
    readonly filePath: string,
    private readonly max = DEFAULT_MAX_RECORDS,
  ) {}

  /**
   * Appends one record, keeping only the newest `max`. With `keepText` false, any request text
   * kept by earlier records (written while the setting was on) is removed as well.
   * Returns false, and leaves the stored file as it was, when the write cannot be completed.
   */
  append(record: ObservationRecord, keepText: boolean): Promise<boolean> {
    const run = this.queue.then(() => this.appendNow(record, keepText), () => this.appendNow(record, keepText));
    this.queue = run.catch(() => undefined);
    return run.then(() => true, () => false);
  }

  /** Every readable record, oldest first. Lines that are not valid records are skipped. */
  async readAll(): Promise<ObservationRecord[]> {
    const records: ObservationRecord[] = [];
    for (const line of await this.readLines()) {
      try {
        const value: unknown = JSON.parse(line);
        if (isObservationRecord(value)) records.push(value);
      } catch {
        // a damaged line is dropped, not repaired
      }
    }
    return records;
  }

  /** Whether the record file exists (even if none of its lines is a valid record). */
  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Deletes the record file and any staging file left by an interrupted write. False when there was no record file. */
  async clear(): Promise<boolean> {
    await this.queue.catch(() => undefined);
    await fs.promises.rm(`${this.filePath}.tmp`, { force: true }).catch(() => undefined);
    try {
      await fs.promises.rm(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async appendNow(record: ObservationRecord, keepText: boolean): Promise<void> {
    const lines = await this.readLines();
    const retained = this.max > 1 ? lines.slice(-(this.max - 1)) : [];
    const kept = keepText ? retained : retained.map(withoutText);
    const line = JSON.stringify(record);
    kept.push(keepText ? line : withoutText(line));
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    this.writes += 1;
    const temp = `${this.filePath}.${process.pid}.${this.writes}.tmp`;
    try {
      const handle = await fs.promises.open(temp, 'w');
      try {
        await handle.writeFile(`${kept.join('\n')}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.promises.rename(temp, this.filePath);
    } catch (error) {
      await fs.promises.rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  /** Lines of the record file. A missing file is empty; any other error is thrown. */
  private async readLines(): Promise<string[]> {
    let text: string;
    try {
      text = await fs.promises.readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return text.split('\n').filter((line) => line.trim() !== '');
  }
}

/** The line without its request text. A line that is not valid JSON is returned unchanged (readAll drops it later). */
function withoutText(line: string): string {
  try {
    const value = JSON.parse(line) as { final?: { text?: unknown } };
    if (value && typeof value === 'object' && value.final && typeof value.final === 'object' && 'text' in value.final) {
      delete value.final.text;
      return JSON.stringify(value);
    }
    return line;
  } catch {
    return line;
  }
}
