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
import { resolveSourcePath } from '../core/pathResolver.js';
import { buildLogicalTable } from '../core/renderTable.js';
import { getImmediateSmartFallbackDecision, getSmartFallbackDecisionAfterLoad } from '../core/smartFallback.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries, type EmbedQuery } from '../parser/embedSyntax.js';
import { markdownMatrixPlugin } from '../plugin/markdownMatrixPlugin.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { recordMaterialized, toCsv, writeMaterializedTable, type MaterializedEntry } from './materialize.js';

export interface RenderOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  cache?: WorkbookCache<WorkbookData>;
  /**
   * Turn attachment cards into CSV files in `dir` (issue-0196) instead of a bare
   * "別紙:" line. `linkBase` is the folder the output document will live in; links
   * are written relative to it. Without this option the output is unchanged.
   */
  materialize?: { dir: string; linkBase: string };
}

export class RenderError extends Error {}

export function renderDocumentHtml(options: RenderOptions): string {
  const md = new MarkdownIt({ html: true }).use(markdownMatrixPlugin, {
    markdownFilePath: options.markdownFilePath,
    workspaceRoot: options.workspaceRoot,
    cache: options.cache ?? new WorkbookCache(),
  });
  // Run from src/cli (tsx) or dist/src/cli (compiled): media/ sits beside package.json.
  const cssUrl = ['../../media/markdown-matrix.css', '../../../media/markdown-matrix.css']
    .map((relative) => new URL(relative, import.meta.url))
    .find((url) => fs.existsSync(url));
  const css = cssUrl ? fs.readFileSync(cssUrl, 'utf8') : '';
  const body = md.render(fs.readFileSync(options.markdownFilePath, 'utf8'));
  if (body.includes('class="mmi-error"')) throw new RenderError('MMI reference errors must be resolved before export. Run `mmi check`.');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>MMI 文書出力</title><style>
  body { font-family: "Noto Sans CJK JP", "Yu Gothic", sans-serif; color: #182c40; line-height: 1.65; font-size: 10pt; }
  h1 { font-size: 21pt; } h2 { font-size: 14pt; margin-top: 1.5em; }
  a { color: #176989; } code { overflow-wrap: anywhere; } pre { white-space: pre-wrap; }
  ${css}
  @page { size: A4; margin: 18mm; @bottom-center { content: counter(page); font-size: 9pt; } }
  @page landscape { size: A4 landscape; }
  @page portrait { size: A4 portrait; }
  @media screen { body { max-width: 1100px; margin: 32px auto; padding: 0 24px; } }
  </style></head><body>${body}</body></html>`;
}

export function renderDocumentMarkdown(options: RenderOptions): string {
  return renderDocumentMarkdownDetailed(options).markdown;
}

export function renderDocumentMarkdownDetailed(options: RenderOptions): { markdown: string; materialized: MaterializedEntry[] } {
  const cache = options.cache ?? new WorkbookCache<WorkbookData>();
  const errors: string[] = [];
  const materialized: MaterializedEntry[] = [];
  const created: string[] = [];
  let inFence = false;
  const lines = fs.readFileSync(options.markdownFilePath, 'utf8').split(/\r?\n/);
  const out = lines.map((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return line;
    let result = line;
    for (const embed of extractEmbedQueries(line)) {
      try {
        result = result.replace(embed.raw, () => `\n\n${expandEmbed(embed, options, cache, materialized, created)}\n\n`);
      } catch (error) {
        errors.push(`${index + 1}: ${embed.raw}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  });
  if (errors.length > 0) {
    for (const file of created) fs.rmSync(file, { force: true }); // a failed run leaves no orphan tables behind
    throw new RenderError(`MMI reference errors must be resolved before export. Run \`mmi check\`.\n${errors.join('\n')}`);
  }
  if (options.materialize && materialized.length > 0) recordMaterialized(options.materialize.dir, materialized);
  return { markdown: out.join('\n').replace(/\n{3,}/g, '\n\n'), materialized };
}

function expandEmbed(embed: EmbedQuery, options: RenderOptions, cache: WorkbookCache<WorkbookData>, materialized: MaterializedEntry[], created: string[]): string {
  const absolutePath = resolveSourcePath({
    markdownFilePath: options.markdownFilePath,
    sourcePath: embed.filepath,
    workspaceRoot: options.workspaceRoot,
  });
  const caption = embed.params.get('caption')?.trim();
  const captionLine = caption ? `**${escapeCell(caption)}**\n\n` : '';
  let decision = getImmediateSmartFallbackDecision(embed);
  let workbook: WorkbookData | undefined;
  if (decision.renderMode !== 'card') {
    workbook = loadWorkbook({ absolutePath, cache });
    decision = getSmartFallbackDecisionAfterLoad(embed, workbook);
  }
  if (decision.renderMode === 'card' || !workbook) {
    const location = [embed.target, embed.range].filter(Boolean).join('!');
    if (options.materialize) {
      workbook ??= loadWorkbook({ absolutePath, cache });
      const table = buildLogicalTable(embed, workbook);
      const entry = writeMaterializedTable(options.materialize.dir, {
        source: embed.filepath,
        sourceSha256: readSourceFileIdentity(absolutePath).digest,
        sheet: embed.target ?? Object.keys(workbook.sheets)[0],
        range: embed.range ?? '',
        params: embed.params.toString(),
        rows: table.bodyRows.length,
        columns: table.bodyRows.reduce((width, row) => Math.max(width, row.length), table.headers?.length ?? 0),
        document: path.relative(options.workspaceRoot, options.markdownFilePath).split(path.sep).join('/'),
      }, toCsv(table), embed.params.get('id') || path.basename(embed.filepath), (file) => created.push(file));
      materialized.push(entry);
      const link = path.relative(options.materialize.linkBase, path.join(options.materialize.dir, entry.output)).split(path.sep).join('/');
      return `${captionLine}> 別紙: [${entry.output}](${encodeURI(link).replace(/\(/g, '%28').replace(/\)/g, '%29')})（出典: ${embed.filepath}${location ? ` ${location}` : ''}）`;
    }
    return `${captionLine}> 別紙: ${embed.filepath}${location ? ` (${location})` : ''}`;
  }
  return captionLine + toGfmTable(buildLogicalTable(embed, workbook));
}

function toGfmTable(table: { headers?: string[]; bodyRows: string[][] }): string {
  const width = Math.max(table.headers?.length ?? 0, ...table.bodyRows.map((row) => row.length), 1);
  const pad = (row: string[]) => Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? ''));
  const header = table.headers ? pad(table.headers) : Array.from({ length: width }, () => '');
  const rows = [header, Array.from({ length: width }, () => '---'), ...table.bodyRows.map(pad)];
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function defaultWorkspaceRoot(markdownFilePath: string): string {
  return path.dirname(path.resolve(markdownFilePath));
}
