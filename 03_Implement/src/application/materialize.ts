import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { WorkbookCache } from '../cache/workbookCache.js';
import { toGfmTable, escapeMarkdownTableCell } from '../core/markdownTable.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { buildLogicalTable } from '../core/renderTable.js';
import { MAX_CELLS_HARD_LIMIT } from '../core/smartFallback.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { measureRegion } from '../core/tableGeometry.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { extractEmbedQueries, type EmbedQuery } from '../parser/embedSyntax.js';

export interface MaterializedFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface MaterializeProblem {
  line: number;
  code: 'MMI_DETACH_UNMATERIALIZED_REFERENCE' | 'MMI_DETACH_TABLE_TOO_LARGE';
  reference: string;
  message: string;
}

export interface MaterializeResult {
  markdown: string;
  files: MaterializedFile[];
  problems: MaterializeProblem[];
}

export interface MaterializeOptions {
  markdownFilePath: string;
  workspaceRoot: string;
  outputDocumentPath: string;
  attachmentsDirectory?: string;
  cache?: WorkbookCache<WorkbookData>;
}

/**
 * Build a source-independent Markdown projection without changing the source.
 * Ordinary table references stay inline. References that Smart Fallback would
 * present as cards are materialized as separate Markdown tables when their
 * target is explicit and within the hard materialization ceiling.
 */
export function materializeDocument(options: MaterializeOptions): MaterializeResult {
  const cache = options.cache ?? new WorkbookCache<WorkbookData>();
  const attachmentsDirectory = path.resolve(
    options.attachmentsDirectory ?? path.join(path.dirname(options.outputDocumentPath), 'mmi-materialized'),
  );
  const outputDirectory = path.dirname(path.resolve(options.outputDocumentPath));
  const filesByPath = new Map<string, MaterializedFile>();
  const problems: MaterializeProblem[] = [];
  let inFence = false;
  const lines = fs.readFileSync(options.markdownFilePath, 'utf8').split(/\r?\n/);

  const output = lines.map((line, index) => {
    if (/^\s*(```|~~~)/u.test(line)) inFence = !inFence;
    if (inFence) return line;
    let result = line;
    for (const embed of extractEmbedQueries(line)) {
      try {
        const expanded = materializeEmbed(embed, options, cache, attachmentsDirectory, outputDirectory);
        if (expanded.file) filesByPath.set(expanded.file.absolutePath, expanded.file);
        result = result.replace(embed.raw, () => `\n\n${expanded.markdown}\n\n`);
      } catch (error) {
        const code = error instanceof MaterializeLimitError
          ? 'MMI_DETACH_TABLE_TOO_LARGE'
          : 'MMI_DETACH_UNMATERIALIZED_REFERENCE';
        const message = error instanceof Error ? error.message : String(error);
        problems.push({ line: index + 1, code, reference: embed.raw, message });
        result = result.replace(
          embed.raw,
          () => `<!-- mmi:unmaterialized reference=${JSON.stringify(embed.raw)} reason=${JSON.stringify(message)} -->`,
        );
      }
    }
    return result;
  });

  return {
    markdown: output.join('\n').replace(/\n{3,}/gu, '\n\n'),
    files: [...filesByPath.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    problems,
  };
}

class MaterializeLimitError extends Error {}

function materializeEmbed(
  embed: EmbedQuery,
  options: MaterializeOptions,
  cache: WorkbookCache<WorkbookData>,
  attachmentsDirectory: string,
  outputDirectory: string,
): { markdown: string; file?: MaterializedFile } {
  const absoluteSource = resolveSourcePath({
    markdownFilePath: options.markdownFilePath,
    sourcePath: embed.filepath,
    workspaceRoot: options.workspaceRoot,
  });
  const workbook = loadWorkbook({ absolutePath: absoluteSource, cache });
  const sheetName = embed.target ?? Object.keys(workbook.sheets)[0];
  const sheet = workbook.sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const dimensions = measureRegion(sheet, embed.range);
  if (dimensions.cellCount > MAX_CELLS_HARD_LIMIT) {
    throw new MaterializeLimitError(
      `reference has ${dimensions.cellCount} cells, above the ${MAX_CELLS_HARD_LIMIT}-cell detach materialization limit`,
    );
  }

  const logical = buildLogicalTable(embed, workbook);
  const caption = embed.params.get('caption')?.trim();
  const captionLine = caption ? `**${escapeMarkdownTableCell(caption)}**\n\n` : '';
  const shouldExternalize = !embed.target
    || embed.params.get('mode')?.trim().toLowerCase() === 'card'
    || dimensions.columnCount > 10
    || dimensions.cellCount > 500;

  if (!shouldExternalize) {
    return { markdown: captionLine + toGfmTable(logical) };
  }
  if (!embed.target) {
    throw new Error('card-like reference has no explicit sheet target; choose a sheet before detaching');
  }

  const sourceIdentity = readSourceFileIdentity(absoluteSource);
  const digestInput = JSON.stringify({
    source: sourceIdentity.digest,
    sheet: embed.target,
    range: embed.range ?? '',
    params: [...embed.params.entries()].sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv)),
  });
  const digest = createHash('sha256').update(digestInput, 'utf8').digest('hex').slice(0, 12);
  const filename = `table-${digest}.md`;
  const absoluteAttachment = path.join(attachmentsDirectory, filename);
  const relativePath = path.relative(outputDirectory, absoluteAttachment).split(path.sep).join('/');
  const safeRelative = relativePath.replace(/ /gu, '%20');
  const sourceLabel = path.relative(path.dirname(options.markdownFilePath), absoluteSource).split(path.sep).join('/');
  const location = [embed.target, embed.range].filter(Boolean).join('!');

  const provenance = `<!-- mmi:materialized source=${JSON.stringify(sourceLabel)} location=${JSON.stringify(location)} sha256=${JSON.stringify(sourceIdentity.digest.slice(7))} -->`;
  const title = caption || `別紙: ${path.basename(embed.filepath)}${location ? ` / ${location}` : ''}`;
  const content = `# ${title}\n\n${provenance}\n\n${toGfmTable(logical)}\n`;

  return {
    markdown: `[${title}](${safeRelative})`,
    file: { absolutePath: absoluteAttachment, relativePath, content },
  };
}
