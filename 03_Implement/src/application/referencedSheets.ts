/**
 * The sheets a Markdown document references, resolved exactly as the renderer
 * resolves them (workspace containment included). Unreadable references are
 * skipped: the reference diagnostics already report them.
 */
import type { WorkbookCache } from '../cache/workbookCache.js';
import { formatMessage } from '../core/messages/index.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';
import type { ProseIdSource } from './proseIdCheck.js';

export function referencedSheets(text: string, markdownFilePath: string, workspaceRoot: string | undefined, cache?: WorkbookCache<WorkbookData>): ProseIdSource[] {
  const seen = new Set<string>();
  const out: ProseIdSource[] = [];
  for (const embed of extractEmbedQueries(text)) {
    try {
      const absolutePath = resolveSourcePath({ markdownFilePath, sourcePath: embed.filepath, workspaceRoot });
      const workbook = loadWorkbook({ absolutePath, cache });
      const sheetName = embed.target ?? Object.keys(workbook.sheets)[0];
      const key = `${absolutePath}#${sheetName}`;
      if (seen.has(key) || !workbook.sheets[sheetName]) continue;
      seen.add(key);
      out.push({ label: `${embed.filepath}#${sheetName}`, sheet: workbook.sheets[sheetName] });
    } catch {
      // missing file, outside the boundary, unsupported format: reported by the reference diagnostics
    }
  }
  return out;
}

/** The sentence for a prose ID that no referenced table has, in `language` (default English). */
export function unknownIdMessage(
  finding: { id: string; example: string; sources: readonly string[] },
  language?: string,
): string {
  return formatMessage('unknownProseId', { id: finding.id, sources: finding.sources, example: finding.example }, language);
}
