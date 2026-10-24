import path from 'node:path';

import {
  DELIVERY_FILE_OBSERVATION_SCHEMA,
  type DeliveryFileObservation,
} from './deliveryFileObservation.js';

/**
 * Structural projection of the experimental mmi.source-inventory/v0 result
 * proposed in #620 / PR #621. It deliberately performs no directory scan.
 * Align with the actual imported SourceInventory type after #621 is merged.
 */
export interface SourceInventoryProjectionV0 {
  contract: 'mmi.source-inventory/v0';
  scope: string;
  status: 'complete' | 'partial';
  entries: readonly {
    path: string;
    state: 'identified' | 'inspected' | 'unsupported' | 'excluded' | 'failed' | 'changed';
    identity?: { digest: string };
  }[];
}

export const DELIVERY_INVENTORY_COMPARISON_SCHEMA =
  'mmi.delivery-inventory-comparison/v0' as const;

export type DeliveryInventoryRelation =
  | 'matched'
  | 'reference-missing'
  | 'reference-blocked'
  | 'reference-unreadable'
  | 'reference-outside-inventory-scope'
  | 'reference-not-in-inventory'
  | 'inventory-unverifiable'
  | 'digest-mismatch'
  | 'inventory-unreferenced';

export interface DeliveryInventoryFinding {
  relation: DeliveryInventoryRelation;
  /** For resolved references and inventory entries, this is workspace-relative. */
  path: string;
  line?: number;
  reference?: string;
  inventoryState?: SourceInventoryProjectionV0['entries'][number]['state'];
}

export interface DeliveryInventoryComparison {
  schema: typeof DELIVERY_INVENTORY_COMPARISON_SCHEMA;
  /** Two separately observed states; this is not an atomic filesystem snapshot. */
  consistency: 'independent-observations';
  scope: string;
  inventoryStatus: SourceInventoryProjectionV0['status'];
  /** Absence of differences is not contractual completeness. */
  alignment: 'aligned' | 'differences' | 'indeterminate';
  counts: Record<DeliveryInventoryRelation, number>;
  findings: DeliveryInventoryFinding[];
}

const EXCEL_EXTENSION = /\.(?:xlsx|xlsm|xls)$/iu;
const RELATIONS: DeliveryInventoryRelation[] = [
  'matched',
  'reference-missing',
  'reference-blocked',
  'reference-unreadable',
  'reference-outside-inventory-scope',
  'reference-not-in-inventory',
  'inventory-unverifiable',
  'digest-mismatch',
  'inventory-unreferenced',
];

/** Compare #658's declared whole-file Excel references to #620's physical source inventory. */
export function compareDeliveryFileInventory(
  delivery: DeliveryFileObservation,
  inventory: SourceInventoryProjectionV0,
): DeliveryInventoryComparison {
  if (delivery.schema !== DELIVERY_FILE_OBSERVATION_SCHEMA
    || delivery.scope !== 'file-only-excel-mmi-embeds'
    || inventory.contract !== 'mmi.source-inventory/v0') {
    throw new Error('Incompatible delivery observation or inventory contract');
  }

  const scope = checkedRelative(inventory.scope, true);
  const byPath = new Map<string, SourceInventoryProjectionV0['entries'][number]>();
  for (const entry of inventory.entries) {
    const relative = checkedRelative(entry.path);
    const full = scope === '.' ? relative : `${scope}/${relative}`;
    if (byPath.has(full)) throw new Error('Inventory has duplicate paths');
    if (EXCEL_EXTENSION.test(relative)) byPath.set(full, entry);
  }

  const findings: DeliveryInventoryFinding[] = [];
  const referenced = new Set<string>();
  const push = (relation: DeliveryInventoryRelation, value: Omit<DeliveryInventoryFinding, 'relation'>) =>
    findings.push({ relation, ...value });

  for (const ref of delivery.references) {
    const value = { line: ref.line, reference: ref.sourcePath };
    if (ref.status === 'missing') {
      push('reference-missing', { ...value, path: ref.sourcePath });
      continue;
    }
    if (ref.status === 'outside-workspace' || ref.status === 'not-file') {
      push('reference-blocked', { ...value, path: ref.sourcePath });
      continue;
    }
    if (ref.status !== 'resolved' || !ref.resolvedPath || !ref.digest) {
      push('reference-unreadable', { ...value, path: ref.sourcePath });
      continue;
    }

    const full = checkedRelative(ref.resolvedPath);
    if (!(scope === '.' || full.startsWith(`${scope}/`))) {
      push('reference-outside-inventory-scope', { ...value, path: full });
      continue;
    }
    referenced.add(full);
    const entry = byPath.get(full);
    if (!entry) {
      push('reference-not-in-inventory', { ...value, path: full });
    } else if (!['identified', 'inspected'].includes(entry.state)
      || !entry.identity?.digest) {
      push('inventory-unverifiable', { ...value, path: full, inventoryState: entry.state });
    } else if (ref.digest !== entry.identity.digest) {
      push('digest-mismatch', { ...value, path: full, inventoryState: entry.state });
    } else {
      push('matched', { ...value, path: full, inventoryState: entry.state });
    }
  }

  for (const [full, entry] of [...byPath.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (referenced.has(full)) continue;
    if (['identified', 'inspected'].includes(entry.state) && entry.identity?.digest) {
      push('inventory-unreferenced', { path: full, inventoryState: entry.state });
    } else {
      push('inventory-unverifiable', { path: full, inventoryState: entry.state });
    }
  }

  const counts = Object.fromEntries(RELATIONS.map(relation => [
    relation, findings.filter(item => item.relation === relation).length,
  ])) as Record<DeliveryInventoryRelation, number>;

  const knownDifference: DeliveryInventoryRelation[] = [
    'reference-missing', 'reference-blocked', 'reference-not-in-inventory',
    'digest-mismatch', 'inventory-unreferenced',
  ];
  const uncertain: DeliveryInventoryRelation[] = [
    'reference-unreadable', 'reference-outside-inventory-scope', 'inventory-unverifiable',
  ];
  const alignment = knownDifference.some(relation => counts[relation] > 0)
    ? 'differences'
    : inventory.status === 'partial'
      || delivery.referentialCompleteness !== 'complete'
      || uncertain.some(relation => counts[relation] > 0)
      ? 'indeterminate'
      : 'aligned';

  return {
    schema: DELIVERY_INVENTORY_COMPARISON_SCHEMA,
    consistency: 'independent-observations',
    scope,
    inventoryStatus: inventory.status,
    alignment,
    counts,
    findings,
  };
}

function checkedRelative(value: string, allowDot = false): string {
  if (!value || value.includes('\\') || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value) || value.split('/').includes('..')
    || value.startsWith('./') || value.endsWith('/') || value.includes('//')
    || (value === '.' && !allowDot) || path.posix.normalize(value) !== value) {
    throw new Error('Inventory or referenced path is not a normalized relative path');
  }
  return value;
}
