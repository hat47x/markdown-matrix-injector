import fs from 'node:fs';
import path from 'node:path';
import {
  SEARCH_OBSERVATION_SCHEMA,
  SEARCH_OBSERVATION_STORE_SCHEMA,
  type SearchObservationRecord,
  type SearchObservationStoreV1,
} from './types.js';

export const MAX_SEARCH_OBSERVATIONS = 1_000;

export function readSearchObservationStore(
  filePath: string,
): SearchObservationStoreV1 {
  if (!fs.existsSync(filePath)) {
    return { schema: SEARCH_OBSERVATION_STORE_SCHEMA, records: [] };
  }
  // A read error (for example a lock held by another program) throws here, so the
  // caller cannot mistake it for an empty store and overwrite the records.
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<SearchObservationStoreV1>;
  if (
    value.schema !== SEARCH_OBSERVATION_STORE_SCHEMA
    || !Array.isArray(value.records)
    || value.records.some((record) => record?.schema !== SEARCH_OBSERVATION_SCHEMA)
  ) {
    throw new Error(`unsupported search observation store: ${filePath}`);
  }
  return {
    schema: SEARCH_OBSERVATION_STORE_SCHEMA,
    records: value.records,
  };
}

/**
 * Appends one record, keeping the newest `limit`. With `keepText` false, request text kept by
 * earlier records (written while includeText was on) is removed as well, so turning the setting
 * off also stops the stored text from being carried forward.
 */
export function appendSearchObservation(
  filePath: string,
  record: SearchObservationRecord,
  limit = MAX_SEARCH_OBSERVATIONS,
  options: { keepText?: boolean } = {},
): SearchObservationStoreV1 {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('search observation limit must be >= 1');
  }
  const keepText = options.keepText !== false;
  const store = readSearchObservationStore(filePath);
  const kept = store.records.map((item) => (keepText ? item : withoutText(item)));
  const records = [...kept, keepText ? record : withoutText(record)].slice(-limit);
  const next = { schema: SEARCH_OBSERVATION_STORE_SCHEMA, records } as const;
  writeAtomic(filePath, next);
  return next;
}

/** Removes the record file and any staging file an interrupted write left behind. */
export function clearSearchObservations(filePath: string): void {
  fs.rmSync(filePath, { force: true });
  const dir = path.dirname(filePath);
  const staging = `${path.basename(filePath)}.tmp-`;
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(staging)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

function withoutText(record: SearchObservationRecord): SearchObservationRecord {
  if (record.final.text === undefined) return record;
  const { text: _text, ...final } = record.final;
  return { ...record, final };
}

function writeAtomic(filePath: string, value: SearchObservationStoreV1): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}`;
  try {
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, filePath);
  } catch (error) {
    // Do not leave a copy of the records behind in a staging file.
    fs.rmSync(temp, { force: true });
    throw error;
  }
}
