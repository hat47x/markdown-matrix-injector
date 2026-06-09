import { WorkbookCache } from '../cache/workbookCache.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import {
  getImmediateSmartFallbackDecision,
  getSmartFallbackDecisionAfterLoad,
  type SmartFallbackReason,
} from '../core/smartFallback.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries, type EmbedQuery } from '../parser/embedSyntax.js';
import { generateDeliveryManifest, type DeliveryManifestRecord } from './generateDeliveryManifest.js';

/**
 * Human-readable explanation for why an embed was treated as a delivery
 * attachment (i.e. rendered as a card / 別紙参照 instead of an inline table).
 */
const REASON_LABELS: Record<SmartFallbackReason, string> = {
  'explicit-card-mode': 'mode=card 指定',
  'explicit-table-mode': 'mode=table 指定',
  'missing-sheet-target': 'シート未指定（ファイル全体参照）',
  'column-threshold-exceeded': '列数が閾値(10)超過',
  'cell-threshold-exceeded': 'セル数が閾値(500)超過',
  'within-table-threshold': '閾値内',
};

export interface CollectDeliveryManifestOptions {
  markdownText: string;
  markdownFilePath: string;
  workspaceRoot?: string;
  cache?: WorkbookCache<WorkbookData>;
}

/**
 * Scans a Markdown document for embeds that fall back to a card (i.e. become a
 * delivery "別紙" attachment) and builds the manifest rows for them. Embeds that
 * render as inline tables are excluded; broken links (load failure / missing
 * sheet) are diagnostics errors rather than attachments, so they are skipped.
 */
export function collectDeliveryManifestRecords(
  options: CollectDeliveryManifestOptions,
): DeliveryManifestRecord[] {
  const records: DeliveryManifestRecord[] = [];

  for (const embed of extractEmbedQueries(options.markdownText)) {
    const reasons = resolveAttachmentReasons(embed, options);
    if (!reasons) {
      continue;
    }

    records.push({
      sourcePath: embed.filepath,
      sheet: embed.target ?? '',
      range: embed.range ?? '',
      reason: reasons.map((reason) => REASON_LABELS[reason]).join(' / '),
      caption: embed.params.get('caption')?.trim() ?? '',
      id: embed.params.get('id')?.trim() ?? '',
    });
  }

  return records;
}

export function buildDeliveryManifestCsv(options: CollectDeliveryManifestOptions): {
  records: DeliveryManifestRecord[];
  csvText: string;
} {
  const records = collectDeliveryManifestRecords(options);
  return { records, csvText: generateDeliveryManifest(records) };
}

function resolveAttachmentReasons(
  embed: EmbedQuery,
  options: CollectDeliveryManifestOptions,
): SmartFallbackReason[] | null {
  const immediate = getImmediateSmartFallbackDecision(embed);
  if (immediate.renderMode === 'card') {
    return immediate.reasons;
  }

  let workbook: WorkbookData;
  try {
    const absolutePath = resolveSourcePath({
      markdownFilePath: options.markdownFilePath,
      sourcePath: embed.filepath,
      workspaceRoot: options.workspaceRoot,
    });
    workbook = loadWorkbook({ absolutePath, cache: options.cache });
  } catch {
    return null;
  }

  let decision;
  try {
    decision = getSmartFallbackDecisionAfterLoad(embed, workbook);
  } catch {
    return null;
  }

  return decision.renderMode === 'card' ? decision.reasons : null;
}
