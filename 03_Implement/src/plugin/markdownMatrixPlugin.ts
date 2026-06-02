import type MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../cache/workbookCache.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { renderEmbedCard } from '../core/renderCard.js';
import { renderEmbedFrame } from '../core/renderEmbedFrame.js';
import { renderEmbedTable } from '../core/renderTable.js';
import { shouldRenderAsCardAfterLoad, shouldRenderAsCardImmediately } from '../core/smartFallback.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';

export interface MarkdownMatrixPluginOptions {
  /**
   * Fallback Markdown file path used when the markdown-it render `env` does not
   * carry a document (e.g. the `renderEmbedForTest` command and unit tests).
   * In the VS Code preview the path is taken from `env.currentDocument` instead.
   */
  markdownFilePath?: string;
  workspaceRoot?: string;
  cache?: WorkbookCache<WorkbookData>;
  /**
   * Resolves the workspace root for a given Markdown file path at render time.
   * Injected by the VS Code integration layer so the plugin stays free of any
   * `vscode` dependency and remains unit-testable.
   */
  resolveWorkspaceRoot?: (markdownFilePath: string) => string | undefined;
}

interface EmbedRenderContext {
  markdownFilePath: string;
  workspaceRoot?: string;
  cache?: WorkbookCache<WorkbookData>;
}

export function markdownMatrixPlugin(md: MarkdownIt, options: MarkdownMatrixPluginOptions): void {
  md.core.ruler.push('markdown-matrix-injector', (state) => {
    // VS Code's Markdown preview passes the active document via `env.currentDocument`
    // (a vscode.Uri). Fall back to the statically configured path for the test
    // command and unit tests, which render without an env document.
    const markdownFilePath = getDocumentPathFromEnv(state.env) ?? options.markdownFilePath;
    if (markdownFilePath === undefined) {
      // No document context: relative embed paths cannot be resolved safely, so
      // leave the source text untouched rather than emitting misleading errors.
      return;
    }

    const workspaceRoot = options.resolveWorkspaceRoot?.(markdownFilePath) ?? options.workspaceRoot;
    const context: EmbedRenderContext = { markdownFilePath, workspaceRoot, cache: options.cache };

    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.type !== 'inline' || !token.children) {
        continue;
      }

      const embeds = extractEmbedQueries(token.content);
      if (embeds.length === 0) {
        continue;
      }

      // A paragraph whose entire content is embed(s) must render as block-level
      // HTML. The rendered output (<figure>/<table>/<pre>) is block content, so
      // emitting it as inline HTML inside the surrounding paragraph would produce
      // `<p><figure>...</figure></p>` — invalid nesting that the browser splits
      // into an empty <p> plus a sibling figure, breaking layout and scroll sync.
      const isStandaloneEmbedParagraph =
        tokens[index - 1]?.type === 'paragraph_open' &&
        tokens[index + 1]?.type === 'paragraph_close' &&
        stripEmbeds(token.content, embeds).trim() === '';

      if (isStandaloneEmbedParagraph) {
        const htmlBlock = new state.Token('html_block', '', 0);
        htmlBlock.block = true;
        htmlBlock.map = tokens[index - 1].map ?? token.map;
        htmlBlock.content = embeds.map((embed) => renderEmbed(embed, context)).join('\n');
        // Replace the paragraph_open / inline / paragraph_close triplet with the
        // single block token so no <p> wrapper is emitted.
        tokens.splice(index - 1, 3, htmlBlock);
        index -= 1;
        continue;
      }

      // Embed mixed with other inline content (e.g. "see ![[...]] here"): keep it
      // inline within the paragraph so the surrounding prose is preserved.
      for (const child of token.children) {
        if (child.type !== 'text') {
          continue;
        }

        const childEmbeds = extractEmbedQueries(child.content);
        if (childEmbeds.length === 0) {
          continue;
        }

        child.type = 'html_inline';
        child.tag = '';
        child.content = childEmbeds.reduce((html, embed) => {
          const rendered = renderEmbed(embed, context);
          return html.replace(embed.raw, rendered);
        }, child.content);
      }
    }
  });
}

/**
 * Reads the current document's filesystem path from the markdown-it render env.
 * Mirrors the VS Code `RenderEnv` contract (`currentDocument: vscode.Uri`) without
 * importing `vscode`, so the field is accessed via structural typing.
 */
function getDocumentPathFromEnv(env: unknown): string | undefined {
  if (!env || typeof env !== 'object') {
    return undefined;
  }
  const currentDocument = (env as { currentDocument?: unknown }).currentDocument;
  if (!currentDocument || typeof currentDocument !== 'object') {
    return undefined;
  }
  const fsPath = (currentDocument as { fsPath?: unknown }).fsPath;
  return typeof fsPath === 'string' && fsPath.length > 0 ? fsPath : undefined;
}

/**
 * Removes every embed's raw `![[...]]` token from the paragraph content so the
 * caller can test whether anything other than embeds (and whitespace) remains.
 */
function stripEmbeds(content: string, embeds: ReturnType<typeof extractEmbedQueries>): string {
  return embeds.reduce((remaining, embed) => remaining.split(embed.raw).join(''), content);
}

function renderEmbed(embed: ReturnType<typeof extractEmbedQueries>[number], context: EmbedRenderContext): string {
  try {
    const absolutePath = resolveSourcePath({
      markdownFilePath: context.markdownFilePath,
      sourcePath: embed.filepath,
      workspaceRoot: context.workspaceRoot,
    });
    if (shouldRenderAsCardImmediately(embed)) {
      return renderEmbedFrame(embed, renderEmbedCard(embed, absolutePath));
    }

    const workbook = loadWorkbook({ absolutePath, cache: context.cache });
    if (shouldRenderAsCardAfterLoad(embed, workbook)) {
      return renderEmbedFrame(embed, renderEmbedCard(embed, absolutePath));
    }

    return renderEmbedFrame(embed, renderEmbedTable(embed, workbook));
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
