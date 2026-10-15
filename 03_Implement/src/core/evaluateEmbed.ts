/**
 * What one reference resolves to, decided exactly as the renderer decides it:
 * path resolution within the workspace boundary (spec P4), Smart Fallback
 * before and after loading (§7), then the logical table (§6). The Markdown
 * preview turns the result into HTML; the command-line interface turns it
 * into Markdown tables and diagnostics. Both call this one function.
 */
import type { WorkbookCache } from '../cache/workbookCache.js';
import { CooperativeTimeBudgetExceededError, type CooperativeTimeBudget } from './cooperativeTimeBudget.js';
import type { EmbedQuery } from '../parser/embedSyntax.js';
import { LocalizedError } from './messages/index.js';
import { resolveSourcePath } from './pathResolver.js';
import { buildLogicalTable, type LogicalTable } from './renderTable.js';
import { shouldRenderAsCardAfterLoad, shouldRenderAsCardImmediately, SmartFallbackLimitError } from './smartFallback.js';
import { loadWorkbook, type WorkbookData } from './workbookLoader.js';

export interface EmbedContext {
  markdownFilePath: string;
  workspaceRoot?: string;
  cache?: WorkbookCache<WorkbookData>;
  budget?: CooperativeTimeBudget;
}

export type EmbedOutcome =
  | { kind: 'card'; absolutePath: string }
  | { kind: 'table'; absolutePath: string; workbook: WorkbookData; logical: LogicalTable }
  | {
      kind: 'error';
      message: string;
      code?: 'MMI_TABLE_TOO_LARGE' | 'MMI_TABLE_TIME_BUDGET_EXCEEDED';
      /** Set when the failure has a message id, so a host can phrase it in the reader's language (`localizeError`). */
      localizable?: LocalizedError;
    };

export function evaluateEmbed(embed: EmbedQuery, context: EmbedContext): EmbedOutcome {
  try {
    const absolutePath = resolveSourcePath({
      markdownFilePath: context.markdownFilePath,
      sourcePath: embed.filepath,
      workspaceRoot: context.workspaceRoot,
    });
    if (shouldRenderAsCardImmediately(embed)) return { kind: 'card', absolutePath };
    const workbook = loadWorkbook({ absolutePath, cache: context.cache });
    if (shouldRenderAsCardAfterLoad(embed, workbook)) return { kind: 'card', absolutePath };
    return { kind: 'table', absolutePath, workbook, logical: buildLogicalTable(embed, workbook, { budget: context.budget }) };
  } catch (error) {
    if (error instanceof SmartFallbackLimitError || error instanceof CooperativeTimeBudgetExceededError) {
      return { kind: 'error', message: error.message, code: error.code, localizable: error };
    }
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Unknown embed error',
      ...(error instanceof LocalizedError ? { localizable: error } : {}),
    };
  }
}
