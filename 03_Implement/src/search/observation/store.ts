/**
 * Local storage of observation records: one JSON object per line in a single file under the
 * workspace's storage folder (never in the repository). Bounded to the newest `max` records,
 * deletable, and silent on failure: a write that cannot happen must never disturb a search.
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
  constructor(
    readonly filePath: string,
    private readonly max = DEFAULT_MAX_RECORDS,
  ) {}

  /** Appends one record, keeping only the newest `max`. Returns false (and changes nothing) on failure. */
  async append(record: ObservationRecord): Promise<boolean> {
    try {
      const kept = [...(await this.readLines())].slice(-(this.max - 1));
      kept.push(JSON.stringify(record));
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.tmp`;
      await fs.promises.writeFile(temp, `${kept.join('\n')}\n`, 'utf8');
      await fs.promises.rename(temp, this.filePath);
      return true;
    } catch {
      return false;
    }
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

  /** Deletes the file. Resolves false when there was nothing to delete or it could not be removed. */
  async clear(): Promise<boolean> {
    try {
      await fs.promises.rm(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readLines(): Promise<string[]> {
    try {
      const text = await fs.promises.readFile(this.filePath, 'utf8');
      return text.split('\n').filter((line) => line.trim() !== '');
    } catch {
      return [];
    }
  }
}
