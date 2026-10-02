/**
 * Materialization (issue-0196, ADR-0019 D3): turn a reference that would be an
 * attachment card into a plain CSV file plus provenance, so the expanded
 * document no longer needs the source workbook.
 *
 * The CSV holds exactly the logical table the reference describes (spec §6),
 * so the same input gives the same bytes. The provenance manifest is a
 * readable JSON file that stays valid without MMI.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MATERIALIZED_SCHEMA = 'mmi.materialized/v1';
export const MATERIALIZED_MANIFEST = 'materialized.json';

export interface MaterializedEntry {
  /** Output CSV, relative to the manifest. */
  output: string;
  outputSha256: string;
  /** Source workbook as written in the reference. */
  source: string;
  sourceSha256: string;
  sheet: string;
  range: string;
  /** The reference's query parameters, so the table can be regenerated. */
  params: string;
  rows: number;
  columns: number;
  /** Document that held the reference, relative to the manifest's folder when possible. */
  document: string;
}

export interface MaterializedManifest {
  schema: typeof MATERIALIZED_SCHEMA;
  entries: MaterializedEntry[];
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function toCsv(table: { headers?: string[]; bodyRows: string[][] }): string {
  const rows = [...(table.headers ? [table.headers] : []), ...table.bodyRows];
  let width = 1;
  for (const row of rows) if (row.length > width) width = row.length; // not Math.max(...rows): the spread overflows the stack on large tables
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => Array.from({ length: width }, (_, index) => cell(row[index] ?? '')).join(',')).join('\r\n') + '\r\n';
}

export function readMaterializedManifest(manifestPath: string): MaterializedManifest {
  if (!fs.existsSync(manifestPath)) return { schema: MATERIALIZED_SCHEMA, entries: [] };
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<MaterializedManifest>;
  if (parsed.schema !== MATERIALIZED_SCHEMA || !Array.isArray(parsed.entries)) {
    throw new Error(`${manifestPath} is not an ${MATERIALIZED_SCHEMA} manifest`);
  }
  return { schema: MATERIALIZED_SCHEMA, entries: parsed.entries };
}

function stem(value: string): string {
  const base = value.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return base.slice(0, 40) || 'table';
}

/**
 * Write one CSV into `dir`, named after the reference and the content digest,
 * so identical content is one file and a different table never overwrites one.
 */
export function writeMaterializedTable(
  dir: string,
  entry: Omit<MaterializedEntry, 'output' | 'outputSha256'>,
  csv: string,
  label: string,
  /** Receives the path of a file this call created, so a failed run can remove it. */
  onCreate?: (file: string) => void,
): MaterializedEntry {
  const digest = sha256(csv);
  const output = `${stem(label)}-${digest.slice(0, 12)}.csv`;
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, output);
  if (!fs.existsSync(target)) { fs.writeFileSync(target, csv); onCreate?.(target); }
  else if (sha256(fs.readFileSync(target)) !== digest) throw new Error(`${target} exists with different content`);
  return { ...entry, output, outputSha256: `sha256:${digest}` };
}

export function recordMaterialized(dir: string, entries: readonly MaterializedEntry[]): MaterializedManifest {
  const manifestPath = path.join(dir, MATERIALIZED_MANIFEST);
  const manifest = readMaterializedManifest(manifestPath);
  const key = (entry: MaterializedEntry) => `${entry.output}\u0000${entry.document}\u0000${entry.params}`;
  const merged = new Map(manifest.entries.map((entry) => [key(entry), entry]));
  for (const entry of entries) merged.set(key(entry), entry);
  const next: MaterializedManifest = { schema: MATERIALIZED_SCHEMA, entries: [...merged.values()].sort((a, b) => key(a).localeCompare(key(b))) };
  fs.mkdirSync(dir, { recursive: true });
  // Write then rename, so a reader never sees a half-written manifest. Concurrent writers can still
  // overwrite each other's entries; run one `render --materialize` per output folder at a time.
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temporary, manifestPath);
  return next;
}
