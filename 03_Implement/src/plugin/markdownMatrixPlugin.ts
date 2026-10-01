import type MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../cache/workbookCache.js';
import { CooperativeTimeBudgetExceededError, type CooperativeTimeBudget } from '../core/cooperativeTimeBudget.js';
import { evaluateEmbed } from '../core/evaluateEmbed.js';
import { escapeHtml } from '../core/html.js';
import { renderEmbedCard } from '../core/renderCard.js';
import { renderEmbedFrame } from '../core/renderEmbedFrame.js';
import { renderLogicalTable } from '../core/renderTable.js';
import type { WorkbookData } from '../core/workbookLoader.js';
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
  uriScheme?: string;
  /** Optional per-embed cooperative budget factory; no production default is enabled yet. */
  createTimeBudget?: () => CooperativeTimeBudget;
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
  uriScheme?: string;
  createTimeBudget?: () => CooperativeTimeBudget;
}

export function markdownMatrixPlugin(md: MarkdownIt, options: MarkdownMatrixPluginOptions): void {
  const resolveContext = (env: unknown): EmbedRenderContext | undefined => {
    const markdownFilePath = getDocumentPathFromEnv(env) ?? options.markdownFilePath;
    if (markdownFilePath === undefined) {
      return;
    }
    const workspaceRoot = options.resolveWorkspaceRoot?.(markdownFilePath) ?? options.workspaceRoot;
    return {
      markdownFilePath,
      workspaceRoot,
      cache: options.cache,
      uriScheme: options.uriScheme,
      createTimeBudget: options.createTimeBudget,
    };
  };

  // VS Code caches parsed tokens without a document URI, then supplies the URI
  // only to renderer.render. Keep references as tokens until that render step.
  md.renderer.rules.mmi_embed_block = (tokens, index, _settings, env) => {
    const context = resolveContext(env);
    const content = tokens[index].content;
    return context
      ? extractEmbedQueries(content).map((embed) => renderEmbed(embed, context)).join('\n')
      : `<p>${escapeHtml(content)}</p>\n`;
  };
  md.renderer.rules.mmi_embed_inline = (tokens, index, _settings, env) => {
    const content = tokens[index].content;
    const context = resolveContext(env);
    if (!context) return escapeHtml(content);
    let remaining = content;
    let html = '';
    for (const embed of extractEmbedQueries(content)) {
      const offset = remaining.indexOf(embed.raw);
      html += escapeHtml(remaining.slice(0, offset)) + renderEmbed(embed, context);
      remaining = remaining.slice(offset + embed.raw.length);
    }
    return html + escapeHtml(remaining);
  };

  md.core.ruler.push('markdown-matrix-injector', (state) => {
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
        const htmlBlock = new state.Token('mmi_embed_block', '', 0);
        htmlBlock.block = true;
        htmlBlock.map = tokens[index - 1].map ?? token.map;
        htmlBlock.content = token.content;
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

        child.type = 'mmi_embed_inline';
        child.tag = '';
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
  // One decision path shared with the command-line interface (core/evaluateEmbed.ts).
  const budget = context.createTimeBudget?.();
  const outcome = evaluateEmbed(embed, {
    markdownFilePath: context.markdownFilePath,
    workspaceRoot: context.workspaceRoot,
    cache: context.cache,
    budget,
  });
  try {
    if (outcome.kind === 'card') return renderEmbedFrame(embed, renderEmbedCard(embed, outcome.absolutePath, context.uriScheme));
    if (outcome.kind === 'table') return renderEmbedFrame(embed, renderLogicalTable(embed, outcome.logical, budget));
    const code = outcome.code ? ` data-code="${escapeHtml(outcome.code)}"` : '';
    return `<div class="mmi-error"${code}>${escapeHtml(outcome.message)}</div>`;
  } catch (error) {
    if (error instanceof CooperativeTimeBudgetExceededError) {
      return `<div class="mmi-error" data-code="${escapeHtml(error.code)}">${escapeHtml(error.message)}</div>`;
    }
    return `<div class="mmi-error">${escapeHtml(getErrorMessage(error))}</div>`;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown embed error';
}
