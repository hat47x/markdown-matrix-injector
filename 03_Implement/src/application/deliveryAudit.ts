import fs from 'node:fs';
import path from 'node:path';

import { isPathWithinBoundary } from '../core/pathResolver.js';
import { observeDeliveryFiles } from './deliveryFileObservation.js';
import { inventoryDesignSources } from './designSourceInventory.js';
import { compareDeliveryFileInventory } from './compareDeliveryFileInventory.js';

/** Exploratory, read-only composition of three existing Application capabilities. */
export const DELIVERY_AUDIT_SCHEMA = 'mmi.delivery-audit/v0' as const;

export interface DeliveryAuditOptions {
  markdownFilePath: string;
  inventoryDirectory: string;
  workspaceRoot: string;
  maxBytes?: number;
}

/**
 * Observe one root Markdown and one source directory.
 *
 * Each file is observed independently, not on a common filesystem snapshot.
 * "aligned" describes ONLY the two observed sets, not contractual deliverable
 * completeness, source authenticity, accepted meaning or a reviewed release.
 */
export function auditDeliveryReferences(options: DeliveryAuditOptions) {
  const root = path.resolve(options.workspaceRoot);
  const markdownPath = path.resolve(options.markdownFilePath);
  const realRoot = fs.realpathSync(root);
  if (!isPathWithinBoundary(markdownPath, root)
    || !isPathWithinBoundary(fs.realpathSync(markdownPath), realRoot)) {
    throw new Error('Delivery Markdown must be inside the workspace');
  }
  if (!/\.(?:md|markdown)$/iu.test(markdownPath) || !fs.statSync(markdownPath).isFile()) {
    throw new Error('Delivery input must be a Markdown file');
  }

  // The inventory implementation handles directory realpath and symlink policy.
  // The source observation validates every workbook before reading its bytes.
  const markdownText = fs.readFileSync(markdownPath, 'utf8');
  const delivery = observeDeliveryFiles({
    markdownText,
    markdownFilePath: markdownPath,
    workspaceRoot: root,
  });
  const inventory = inventoryDesignSources({
    workspaceRoot: root,
    directory: options.inventoryDirectory,
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
  });
  const comparison = compareDeliveryFileInventory(delivery, inventory);
  return {
    schema: DELIVERY_AUDIT_SCHEMA,
    scope: 'file-only-excel-mmi-embeds',
    document: path.relative(root, markdownPath).split(path.sep).join('/'),
    inventoryScope: inventory.scope,
    consistency: 'independent-observations' as const,
    delivery,
    inventory,
    comparison,
  };
}
