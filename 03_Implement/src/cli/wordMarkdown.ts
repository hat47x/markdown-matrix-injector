/**
 * The document as Pandoc-flavoured Markdown for Word (#636): MMI references expanded to tables, plus the raw OOXML
 * that carries what Markdown cannot say — cover, table of contents, captions with bookmarks, page breaks, landscape
 * sections.
 *
 * `renderDocumentMarkdown` (`mmi render --to md`) stays as it is for AI agents and other tools; this is the Word
 * delivery's own rendering and follows the same rules as the HTML export: table numbers (`captionNumbers`) are
 * written into the caption, a link to a captioned table by its `id` gets the number and the page, and a heading that
 * stands right before a table on its own page goes with it.
 */
import fs from 'node:fs';
import { WorkbookCache } from '../cache/workbookCache.js';
import { extractEmbedQueries, type EmbedQuery } from '../parser/embedSyntax.js';
import { HAND_NUMBERED } from './captionNumbers.js';
import { readFrontMatter, type DocumentProperties } from './documentExport.js';
import { cliErrorText } from './messageLanguage.js';
import { expandEmbedParts, RenderError, type EmbedParts, type RenderOptions } from './render.js';
import type { WorkbookData } from '../core/workbookLoader.js';
import {
  PAGE_BREAK, bookmarkName, captionParagraph, coverBlock, pageReference, rawBlock, rawInline, sectionBreak, tocBlock,
  type SectionKind, type TocEntry,
} from './wordOoxml.js';

export interface WordMarkdown {
  markdown: string;
  properties: DocumentProperties;
  title: string;
  /** Whether Word has fields (table of contents, page references) to update when the document is opened. */
  hasFields: boolean;
}

type Block =
  | { type: 'text'; text: string; fenced: boolean }
  | { type: 'embed'; embed: EmbedQuery; parts: EmbedParts; label?: string; bookmark?: string; id?: string };

const HEADING = /^#{1,6}\s/u;

function collectBlocks(lines: string[], options: RenderOptions, cache: WorkbookCache<WorkbookData>, errors: string[]): Block[] {
  const blocks: Block[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence || /^\s*(```|~~~)/.test(line)) {
      blocks.push({ type: 'text', text: line, fenced: true });
      return;
    }
    let cursor = 0;
    for (const embed of extractEmbedQueries(line)) {
      const at = line.indexOf(embed.raw, cursor);
      if (at < 0) continue;
      const before = line.slice(cursor, at);
      if (before.trim()) blocks.push({ type: 'text', text: before, fenced: false });
      try {
        blocks.push({ type: 'embed', embed, parts: expandEmbedParts(embed, options, cache) });
      } catch (error) {
        errors.push(`${index + 1}: ${embed.raw}: ${cliErrorText(error)}`);
      }
      cursor = at + embed.raw.length;
    }
    const rest = line.slice(cursor);
    if (cursor === 0 || rest.trim()) blocks.push({ type: 'text', text: rest, fenced: false });
  });
  return blocks;
}

const unescapeFragment = (fragment: string): string => {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
};

const plainHeading = (text: string): string => text.replace(/[*_`]/g, '').replace(/\s+#+\s*$/, '').trim();

export function renderWordMarkdown(options: RenderOptions): WordMarkdown {
  const { properties, body } = readFrontMatter(fs.readFileSync(options.markdownFilePath, 'utf8'));
  const cache = options.cache ?? new WorkbookCache<WorkbookData>();
  const errors: string[] = [];
  const blocks = collectBlocks(body.split(/\r?\n/), options, cache, errors);
  if (errors.length > 0) throw new RenderError(`MMI reference errors must be resolved before export. Run \`mmi check\`.\n${errors.join('\n')}`);

  // Numbers and bookmarks first: links may point forward to a table.
  const targets = new Map<string, { label?: string; bookmark: string; caption: string }>();
  let tableNumber = 0;
  blocks.forEach((block) => {
    if (block.type !== 'embed') return;
    const id = block.embed.params.get('id')?.trim() || undefined;
    if (block.parts.kind === 'table' && block.parts.caption && properties.captionNumbers && !HAND_NUMBERED.test(block.parts.caption)) {
      tableNumber += 1;
      block.label = `表${tableNumber}`;
    }
    if (id && block.parts.caption) {
      block.id = id;
      block.bookmark = bookmarkName(id);
      targets.set(id, { label: block.label, bookmark: block.bookmark, caption: block.parts.caption });
    }
  });
  let hasPageReferences = false;
  const rewriteLinks = (text: string): string => text.replace(/\[([^\]]*)\]\(#([^)\s]*)\)/g, (whole, label: string, fragment: string) => {
    const target = targets.get(unescapeFragment(fragment));
    if (!target) return whole;
    const shown = label.trim() || target.label || target.caption;
    if (!properties.captionNumbers) return `[${shown}](#${target.bookmark})`;
    hasPageReferences = true;
    return `[${shown}](#${target.bookmark})（p.${rawInline(pageReference(target.bookmark))}）`;
  });

  const out: string[] = [];
  let section: SectionKind = 'portrait';
  let bookmarkId = 0;
  const pushRaw = (xml: string): void => { out.push('', rawBlock(xml).trimEnd(), ''); };
  /** Puts a break before the heading that directly precedes this block, so the heading is not left on the old page. */
  const pushBreakBefore = (xml: string): void => {
    let index = out.length - 1;
    while (index >= 0 && !out[index].trim()) index -= 1;
    const at = index >= 0 && HEADING.test(out[index]) ? index : out.length;
    out.splice(at, 0, '', rawBlock(xml).trimEnd(), '');
  };

  for (const block of blocks) {
    if (block.type === 'text') {
      if (section === 'landscape' && !block.fenced && block.text.trim()) {
        pushRaw(sectionBreak('landscape', true));
        section = 'portrait';
      }
      out.push(block.fenced ? block.text : rewriteLinks(block.text));
      continue;
    }
    const wanted: SectionKind = block.embed.params.get('orientation') === 'landscape' ? 'landscape' : 'portrait';
    const pageBreak = block.embed.params.get('pageBreak');
    let sectionStarted = false;
    if (wanted !== section) {
      pushBreakBefore(sectionBreak(section, true));
      section = wanted;
      sectionStarted = true;
    }
    if ((pageBreak === 'before' || pageBreak === 'both') && !sectionStarted) pushBreakBefore(PAGE_BREAK);
    const caption = block.parts.caption ? (block.label ? `${block.label}　${block.parts.caption}` : block.parts.caption) : undefined;
    bookmarkId += 1;
    if (caption) pushRaw(captionParagraph(caption, block.bookmark, bookmarkId));
    out.push('', block.parts.body, '');
    if (pageBreak === 'after' || pageBreak === 'both') pushRaw(PAGE_BREAK);
  }
  if (section === 'landscape') pushRaw(sectionBreak('landscape', true));

  const title = properties.title ?? firstH1(blocks) ?? '';
  const headings = tocEntries(blocks);
  const front: string[] = [];
  if (properties.cover) front.push(rawBlock(coverBlock(properties, title)).trimEnd(), '');
  if (properties.toc) front.push(rawBlock(tocBlock(headings)).trimEnd(), '');
  const markdown = `---\nlang: ja-JP\n---\n\n${[...front, ...out].join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  return { markdown, properties, title, hasFields: properties.toc || hasPageReferences };
}

function textBlocks(blocks: Block[]): string[] {
  return blocks.flatMap((block) => (block.type === 'text' && !block.fenced ? [block.text] : []));
}

function firstH1(blocks: Block[]): string | undefined {
  const line = textBlocks(blocks).find((text) => /^#\s+\S/.test(text));
  return line ? plainHeading(line.replace(/^#\s+/, '')) : undefined;
}

function tocEntries(blocks: Block[]): TocEntry[] {
  return textBlocks(blocks).flatMap((text) => {
    const match = /^(#{2,3})\s+(.+)$/.exec(text);
    return match ? [{ level: match[1].length, text: plainHeading(match[2]) }] : [];
  });
}
