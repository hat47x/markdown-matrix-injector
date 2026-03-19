import type MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../cache/workbookCache.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { renderEmbedCard } from '../core/renderCard.js';
import { renderEmbedTable } from '../core/renderTable.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';

export interface MarkdownMatrixPluginOptions {
  markdownFilePath: string;
  workspaceRoot?: string;
  cache?: WorkbookCache<WorkbookData>;
}

export function markdownMatrixPlugin(md: MarkdownIt, options: MarkdownMatrixPluginOptions): void {
  md.core.ruler.push('markdown-matrix-injector', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) {
        continue;
      }

      for (const child of token.children) {
        if (child.type !== 'text') {
          continue;
        }

        const embeds = extractEmbedQueries(child.content);
        if (embeds.length === 0) {
          continue;
        }

        child.type = 'html_inline';
        child.tag = '';
        child.content = embeds.reduce((html, embed) => {
          const rendered = renderEmbed(embed, options);
          return html.replace(embed.raw, rendered);
        }, child.content);
      }
    }
  });
}

function renderEmbed(embed: ReturnType<typeof extractEmbedQueries>[number], options: MarkdownMatrixPluginOptions): string {
  try {
    const absolutePath = resolveSourcePath({
      markdownFilePath: options.markdownFilePath,
      sourcePath: embed.filepath,
      workspaceRoot: options.workspaceRoot,
    });
    if (embed.params.get('mode') === 'card') {
      return renderEmbedCard(embed, absolutePath);
    }

    const workbook = loadWorkbook({ absolutePath, cache: options.cache });
    return renderEmbedTable(embed, workbook);
  } catch (error) {
    return `<div class="mmi-error">${escapeHtml(getErrorMessage(error))}</div>`;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown embed error';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
