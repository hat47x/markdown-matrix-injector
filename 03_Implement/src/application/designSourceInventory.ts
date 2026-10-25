import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readBoundedSourceBytes } from '../core/readBoundedSourceBytes.js';
import { isPathWithinBoundary } from '../core/pathResolver.js';
import { createSourceIdentityFromBytes, type SourceIdentityV1 } from '../core/sourceIdentity.js';

export const INVENTORY_CONTRACT = 'mmi.source-inventory/v0' as const;
export const DEFAULT_INVENTORY_MAX_BYTES = 16 * 1024 * 1024;
const EXCLUDED_DIRECTORIES = ['.git', '.claude', 'node_modules', 'dist', 'artifacts'];
const INSPECT_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xls', '.csv', '.tsv', '.xml', '.json', '.yaml', '.yml', '.txt', '.text', '.log', '.html', '.htm', '.docx']);
export interface InspectionSummary {
  candidateCounts: Record<string, number>;
  diagnosticCodes: string[];
}
export type InventoryState = 'identified' | 'inspected' | 'unsupported' | 'excluded' | 'failed' | 'changed';
export interface InventoryEntry {
  path: string;
  state: InventoryState;
  identity?: SourceIdentityV1;
  reason?: string;
  inspection?: InspectionSummary;
}
export interface InventoryOptions {
  workspaceRoot: string;
  directory: string;
  exclude?: readonly string[];
  maxBytes?: number;
  inspect?: (absolutePath: string) => InspectionSummary;
}
export interface SourceInventory {
  contract: typeof INVENTORY_CONTRACT;
  scope: string;
  consistency: 'per-file-observation';
  inspectionRequested: boolean;
  status: 'complete' | 'partial';
  policy: { maxBytes: number; excludedDirectories: string[]; excludedPaths: string[] };
  entries: InventoryEntry[];
  collectionDigest: string;
  summary: Record<InventoryState, number>;
}
const slash = (value: string) => value.split(path.sep).join('/');
const sorted = (values: string[]) => values.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

/** Host-side inventory. Reuses Source Identity and an existing inspection capability. */
export function inventoryDesignSources(options: InventoryOptions): SourceInventory {
  const boundary = fs.realpathSync(path.resolve(options.workspaceRoot));
  const directory = path.resolve(options.directory);
  if (!isPathWithinBoundary(directory, path.resolve(options.workspaceRoot))
      || !isPathWithinBoundary(fs.realpathSync(directory), boundary)) throw new Error('inventory directory is outside --root');
  let component = path.resolve(options.workspaceRoot);
  for (const part of path.relative(component, directory).split(path.sep).filter(Boolean)) {
    component = path.join(component, part);
    if (fs.lstatSync(component).isSymbolicLink()) throw new Error('inventory scope must not traverse symlinks');
  }
  if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw new Error('inventory needs a non-symlink directory');
  const maxBytes = options.maxBytes ?? DEFAULT_INVENTORY_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 256 * 1024 * 1024) throw new Error('max-bytes must be an integer between 1 and 268435456');
  const excludedPaths = sorted([...new Set((options.exclude ?? []).map((item) => {
    if (!item || path.isAbsolute(item) || item.split(/[\\/]/u).includes('..')) throw new Error('exclude paths must be relative paths inside the selected directory');
    return item.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/$/u, '');
  }))]);
  const entries: InventoryEntry[] = [];
  const label = (file: string) => slash(path.relative(directory, file)) || '.';
  const visit = (file: string): void => {
    const name = label(file);
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) { entries.push({ path: name, state: 'excluded', reason: 'symlink' }); return; }
      if (!isPathWithinBoundary(fs.realpathSync(file), boundary)) { entries.push({ path: name, state: 'excluded', reason: 'outside-boundary' }); return; }
      if (excludedPaths.some((item) => name === item || name.startsWith(`${item}/`))
          || (stat.isDirectory() && EXCLUDED_DIRECTORIES.includes(path.basename(file)))) {
        entries.push({ path: name, state: 'excluded', reason: 'configured-exclusion' }); return;
      }
      if (stat.isDirectory()) {
        for (const child of sorted(fs.readdirSync(file))) visit(path.join(file, child));
        return;
      }
      if (!stat.isFile()) { entries.push({ path: name, state: 'excluded', reason: 'not-regular-file' }); return; }
      if (stat.size > maxBytes) { entries.push({ path: name, state: 'excluded', reason: 'size-limit' }); return; }
      const identity = createSourceIdentityFromBytes(readBoundedSourceBytes(file, maxBytes));
      const entry: InventoryEntry = { path: name, state: 'identified', identity };
      entries.push(entry);
      if (!options.inspect) return;
      if (!INSPECT_EXTENSIONS.has(path.extname(file).toLowerCase())) { entry.state = 'unsupported'; entry.reason = 'unsupported-inspection-format'; return; }
      try {
        const inspection = options.inspect(file);
        const after = createSourceIdentityFromBytes(readBoundedSourceBytes(file, maxBytes));
        if (identity.digest !== after.digest) { entry.state = 'changed'; entry.reason = 'source-changed'; return; }
        entry.state = 'inspected';
        entry.inspection = inspection;
      } catch (error) {
        entry.state = 'failed';
        entry.reason = error instanceof Error && error.message === 'source-changed' ? 'source-changed' : 'inspection-failed';
        if (entry.reason === 'source-changed') entry.state = 'changed';
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      entries.push({ path: name, state: reason === 'source-changed' ? 'changed' : 'failed', reason: reason === 'source-changed' ? reason : 'read-failed' });
    }
  };
  visit(directory);
  const policy = { maxBytes, excludedDirectories: EXCLUDED_DIRECTORIES, excludedPaths };
  // Collection identity covers scope, policy, observed paths and source identities, not derived parser results.
  const collectionDigest = `sha256:${createHash('sha256').update(JSON.stringify({
    contract: INVENTORY_CONTRACT, scope: slash(path.relative(path.resolve(options.workspaceRoot), directory)) || '.', policy,
    sources: entries.map(({ path: source, identity, reason, state }) => ({ path: source, identity, unavailable: identity ? undefined : { reason, state } })),
  })).digest('hex')}`;
  const summary: Record<InventoryState, number> = { identified: 0, inspected: 0, unsupported: 0, excluded: 0, failed: 0, changed: 0 };
  for (const entry of entries) summary[entry.state] += 1;
  return {
    contract: INVENTORY_CONTRACT, scope: slash(path.relative(path.resolve(options.workspaceRoot), directory)) || '.',
    consistency: 'per-file-observation', inspectionRequested: Boolean(options.inspect),
    status: entries.some((entry) => !['identified', 'inspected'].includes(entry.state) || Boolean(entry.inspection?.diagnosticCodes.length)) ? 'partial' : 'complete',
    policy, entries, collectionDigest, summary,
  };
}
