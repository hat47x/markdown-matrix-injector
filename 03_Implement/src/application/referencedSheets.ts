/**
 * The sheets a Markdown document references, resolved exactly as the renderer
 * resolves them (workspace containment included). Unreadable references are
 * skipped: the reference diagnostics already report them.
 */
import type { WorkbookCache } from '../cache/workbookCache.js';
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

export function unknownIdMessage(finding: { id: string; example: string; sources: readonly string[] }): string {
  return `本文の「${finding.id}」は、参照している表（${finding.sources.join('、')}）のどのセルにもありません（同じ形式の例: ${finding.example}）。正本の変更で消えた・変わったIDか、書き間違いの可能性があります。`;
}
