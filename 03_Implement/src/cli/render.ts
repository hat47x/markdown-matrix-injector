/**
 * Expanded output of a Markdown document: every MMI reference replaced by its
 * table. HTML uses the same markdown-it plugin as the VS Code preview; Markdown
 * emits GFM tables built from the same logical table (spec §6), so AI agents,
 * Pandoc and other tools read exactly what the preview shows.
 */
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../cache/workbookCache.js';
import { toGfmTable, escapeMarkdownTableCell } from '../core/markdownTable.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { buildLogicalTable } from '../core/renderTable.js';
import { getImmediateSmartFallbackDecision, getSmartFallbackDecisionAfterLoad } from '../core/smartFallback.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries, type EmbedQuery } from '../parser/embedSyntax.js';
import { markdownMatrixPlugin } from '../plugin/markdownMatrixPlugin.js';
import { buildDocumentHtml, FrontMatterError } from './documentExport.js';
import { cliErrorText } from './messageLanguage.js';

export interface RenderOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  cache?: WorkbookCache<WorkbookData>;
}

export class RenderError extends Error {}

export function renderDocumentHtml(options: RenderOptions): string {
  const md = new MarkdownIt({ html: true }).use(markdownMatrixPlugin, {
    markdownFilePath: options.markdownFilePath,
    workspaceRoot: options.workspaceRoot,
    cache: options.cache ?? new WorkbookCache(),
    forExport: true,
  });
  // src/cli (tsx), dist/src/cli (compiled), or the standalone package where mmi.mjs sits beside media/.
  const cssUrl = ['../../media/markdown-matrix.css', '../../../media/markdown-matrix.css', './media/markdown-matrix.css']
    .map((relative) => new URL(relative, import.meta.url))
    .find((url) => fs.existsSync(url));
  if (!cssUrl) console.error('mmi: media/markdown-matrix.css not found next to the CLI; the HTML will be unstyled.');
  const css = cssUrl ? fs.readFileSync(cssUrl, 'utf8') : '';
  let html: string;
  try {
    html = buildDocumentHtml(md, fs.readFileSync(options.markdownFilePath, 'utf8'), {}, css);
  } catch (error) {
    if (error instanceof FrontMatterError) throw new RenderError(error.message);
    throw error;
  }
  if (html.includes('class="mmi-error"')) throw new RenderError('MMI reference errors must be resolved before export. Run `mmi check`.');
  return html;
}

export function renderDocumentMarkdown(options: RenderOptions): string {
  const cache = options.cache ?? new WorkbookCache<WorkbookData>();
  const errors: string[] = [];
  let inFence = false;
  const lines = fs.readFileSync(options.markdownFilePath, 'utf8').split(/\r?\n/);
  const out = lines.map((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return line;
    let result = line;
    for (const embed of extractEmbedQueries(line)) {
      try {
        result = result.replace(embed.raw, () => `\n\n${expandEmbed(embed, options, cache)}\n\n`);
      } catch (error) {
        errors.push(`${index + 1}: ${embed.raw}: ${cliErrorText(error)}`);
      }
    }
    return result;
  });
  if (errors.length > 0) throw new RenderError(`MMI reference errors must be resolved before export. Run \`mmi check\`.\n${errors.join('\n')}`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function expandEmbed(embed: EmbedQuery, options: RenderOptions, cache: WorkbookCache<WorkbookData>): string {
  const absolutePath = resolveSourcePath({
    markdownFilePath: options.markdownFilePath,
    sourcePath: embed.filepath,
    workspaceRoot: options.workspaceRoot,
  });
  const caption = embed.params.get('caption')?.trim();
  const captionLine = caption ? `**${escapeMarkdownTableCell(caption)}**\n\n` : '';
  let decision = getImmediateSmartFallbackDecision(embed);
  let workbook: WorkbookData | undefined;
  if (decision.renderMode !== 'card') {
    workbook = loadWorkbook({ absolutePath, cache });
    decision = getSmartFallbackDecisionAfterLoad(embed, workbook);
  }
  if (decision.renderMode === 'card' || !workbook) {
    const location = [embed.target, embed.range].filter(Boolean).join('!');
    return `${captionLine}> 別紙: ${embed.filepath}${location ? ` (${location})` : ''}`;
  }
  return captionLine + toGfmTable(buildLogicalTable(embed, workbook));
}

export function defaultWorkspaceRoot(markdownFilePath: string): string {
  return path.dirname(path.resolve(markdownFilePath));
}
