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

export function appendSearchObservation(
  filePath: string,
  record: SearchObservationRecord,
  limit = MAX_SEARCH_OBSERVATIONS,
): SearchObservationStoreV1 {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('search observation limit must be >= 1');
  }
  const store = readSearchObservationStore(filePath);
  const records = [...store.records, record].slice(-limit);
  const next = { schema: SEARCH_OBSERVATION_STORE_SCHEMA, records } as const;
  writeAtomic(filePath, next);
  return next;
}

export function clearSearchObservations(filePath: string): void {
  fs.rmSync(filePath, { force: true });
}

function writeAtomic(filePath: string, value: SearchObservationStoreV1): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, filePath);
}
