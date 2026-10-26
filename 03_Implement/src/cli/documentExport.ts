/**
 * Delivery-grade HTML for PDF generators (WeasyPrint verified): the document
 * properties a Japanese SIer deliverable carries — cover page with approval
 * stamps, table of contents with page numbers, running header and footer with
 * document number, version and classification, and PDF metadata.
 *
 * The values come from the Markdown file's YAML front matter. Every value is
 * read as a plain string (YAML failsafe schema) so "1.10" stays "1.10" and
 * dates keep the author's notation (令和8年10月, 2026/10/21, ...).
 */
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { parse as parseYaml } from 'yaml';
import { escapeHtml } from '../core/html.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';
import { CROSS_REFERENCE_CSS, numberCaptions } from './captionNumbers.js';

export interface DocumentProperties {
  title?: string;
  subtitle?: string;
  documentNumber?: string;
  version?: string;
  date?: string;
  customer?: string;
  organization?: string;
  author?: string;
  classification?: string;
  approvals: string[];
  cover: boolean;
  toc: boolean;
  /** Number the captioned tables (表1, 表2, ...) and add page numbers to links to them (#639). */
  captionNumbers: boolean;
  paper: 'A4' | 'A3';
  font?: string;
  margin?: string;
  gutter?: string;
  css: string[];
}

const TEXT_KEYS = ['title', 'subtitle', 'documentNumber', 'version', 'date', 'customer', 'organization', 'author', 'classification'] as const;

export class FrontMatterError extends Error {}

/** Splits a leading `---` YAML block from the Markdown body. Other front matter keys are left to other tools. */
export function readFrontMatter(markdown: string): { properties: DocumentProperties; body: string } {
  const defaults: DocumentProperties = { approvals: [], cover: false, toc: false, captionNumbers: false, paper: 'A4', css: [] };
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!match) return { properties: defaults, body: markdown };
  // Keep line numbers of the body stable for diagnostics: replace the block with blank lines.
  const body = '\n'.repeat(match[0].split('\n').length - 1) + markdown.slice(match[0].length);
  let data: unknown;
  try {
    data = parseYaml(match[1], { schema: 'failsafe' });
  } catch (error) {
    throw new FrontMatterError(`front matter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (data === null || data === undefined || data === '') return { properties: defaults, body };
  if (typeof data !== 'object' || Array.isArray(data)) throw new FrontMatterError('front matter must be a YAML mapping');
  const record = data as Record<string, unknown>;
  const properties = { ...defaults };
  for (const key of TEXT_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new FrontMatterError(`front matter "${key}" must be a single line of text`);
    if (value.trim()) properties[key] = value.trim();
  }
  if (record.approvals !== undefined) {
    const approvals = typeof record.approvals === 'string' ? record.approvals.split(/[,、]/) : record.approvals;
    if (!Array.isArray(approvals) || approvals.some((item) => typeof item !== 'string')) {
      throw new FrontMatterError('front matter "approvals" must be a list of role names such as [承認, 審査, 作成]');
    }
    properties.approvals = approvals.map((item: string) => item.trim()).filter(Boolean);
  }
  if (record.css !== undefined) {
    const css = typeof record.css === 'string' ? [record.css] : record.css;
    if (!Array.isArray(css) || css.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new FrontMatterError('front matter "css" must be a file path or a list of file paths');
    }
    properties.css = css.map((item: string) => item.trim());
  }
  if (record.font !== undefined) properties.font = readFontFamilies(record.font);
  if (record.margin !== undefined) properties.margin = readLengths(record.margin, 'margin', 1, 4);
  if (record.gutter !== undefined) properties.gutter = readLengths(record.gutter, 'gutter', 1, 1);
  properties.cover = readFlag(record, 'cover');
  properties.toc = readFlag(record, 'toc');
  properties.captionNumbers = readFlag(record, 'captionNumbers');
  if (record.paper !== undefined) {
    const paper = typeof record.paper === 'string' ? record.paper.trim().toUpperCase() : '';
    if (paper !== 'A4' && paper !== 'A3') throw new FrontMatterError('front matter "paper" must be A4 or A3');
    properties.paper = paper;
  }
  // Unknown keys belong to other tools (Pandoc, static site generators); they are not an error.
  return { properties, body };
}

const LENGTH = /^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/;

function readLengths(value: unknown, key: string, min: number, max: number): string {
  const parts = typeof value === 'string' ? value.trim().split(/\s+/) : [];
  if (parts.length < min || parts.length > max || parts.some((part) => !LENGTH.test(part))) {
    throw new FrontMatterError(`front matter "${key}" must be ${max === 1 ? 'one length' : `1 to ${max} lengths`} in mm, cm, in or pt, such as 20mm`);
  }
  return parts.join(' ');
}

/** Comma-separated family names; each is emitted as a quoted CSS string, so only plain name characters are accepted. */
function readFontFamilies(value: unknown): string {
  const names = typeof value === 'string' ? value.split(',').map((name) => name.trim()).filter(Boolean) : [];
  if (names.length === 0 || names.length > 6 || names.some((name) => !/^[\p{L}\p{N} _.\-]{1,60}$/u.test(name))) {
    throw new FrontMatterError('front matter "font" must be up to 6 comma-separated font family names, such as BIZ UDPGothic, Yu Gothic');
  }
  return names.join(', ');
}

function readFlag(record: Record<string, unknown>, key: 'cover' | 'toc' | 'captionNumbers'): boolean {
  const value = record[key];
  if (value === undefined) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new FrontMatterError(`front matter "${key}" must be true or false`);
}

interface TocEntry { level: number; id: string; text: string }

/** Gives every h2/h3 an id (keeping author-written ids) and collects them for the table of contents. */
export function collectHeadings(tokens: Token[]): TocEntry[] {
  const entries: TocEntry[] = [];
  const used = new Set(tokens.flatMap((token) => (token.attrGet('id') ? [token.attrGet('id') as string] : [])));
  let counter = 0;
  tokens.forEach((token, index) => {
    if (token.type !== 'heading_open' || (token.tag !== 'h2' && token.tag !== 'h3')) return;
    const text = tokens[index + 1]?.children?.map((child) => (child.type === 'text' || child.type === 'code_inline' ? child.content : '')).join('').trim() ?? '';
    if (!text) return;
    let id = token.attrGet('id');
    if (!id) {
      do id = `mmi-section-${++counter}`; while (used.has(id));
      used.add(id);
      token.attrSet('id', id);
    }
    entries.push({ level: token.tag === 'h2' ? 2 : 3, id, text });
  });
  return entries;
}

/**
 * A heading directly followed by a table that starts a new page (pageBreak=before) or
 * sits on a page of its own orientation would otherwise be stranded at the bottom of the
 * previous page. Carry the break and the orientation onto the heading instead.
 */
export function keepHeadingsWithEmbeds(tokens: Token[]): void {
  tokens.forEach((token, index) => {
    if (token.type !== 'heading_open' || tokens[index + 2]?.type !== 'heading_close') return;
    const next = tokens[index + 3];
    if (next?.type !== 'mmi_embed_block') return;
    const params = extractEmbedQueries(next.content)[0]?.params;
    const pageBreak = params?.get('pageBreak');
    const orientation = params?.get('orientation');
    if (pageBreak === 'before' || pageBreak === 'both') token.attrSet('data-mmi-break', 'before');
    if (orientation === 'landscape' || orientation === 'portrait') token.attrSet('data-mmi-orientation', orientation);
  });
}

export function firstHeading(tokens: Token[]): string | undefined {
  const index = tokens.findIndex((token) => token.type === 'heading_open' && token.tag === 'h1');
  return index >= 0 ? tokens[index + 1]?.content.trim() || undefined : undefined;
}

export function buildDocumentHtml(
  md: MarkdownIt,
  markdown: string,
  env: Record<string, unknown>,
  moduleCss: string,
  loadUserCss: (frontMatterRefs: string[]) => string = () => '',
): string {
  const { properties, body } = readFrontMatter(markdown);
  const tokens = md.parse(body, env);
  keepHeadingsWithEmbeds(tokens);
  const toc = properties.toc ? collectHeadings(tokens) : [];
  const renderedHtml = md.renderer.render(tokens, md.options, env);
  const bodyHtml = properties.captionNumbers ? numberCaptions(renderedHtml).html : renderedHtml;
  const title = properties.title ?? firstHeading(tokens) ?? '';
  const parts = [
    properties.cover ? renderCover(properties, title) : '',
    properties.toc ? renderToc(toc) : '',
    `<main class="mmi-doc-body">${bodyHtml}</main>`,
  ];
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">${renderMeta(properties, title)}<style>
${moduleCss}
${documentCss(properties, title)}${properties.captionNumbers ? `
${CROSS_REFERENCE_CSS}` : ''}
${loadUserCss(properties.css)}
</style></head><body>${parts.join('')}</body></html>`;
}

function renderMeta(properties: DocumentProperties, title: string): string {
  const meta = (name: string, value: string | undefined) => (value ? `<meta name="${name}" content="${escapeHtml(value)}">` : '');
  return [
    `<title>${escapeHtml(title || 'MMI 文書出力')}</title>`,
    meta('author', properties.author ?? properties.organization),
    meta('description', properties.subtitle),
    meta('keywords', [properties.documentNumber, properties.classification].filter(Boolean).join(', ') || undefined),
    meta('generator', 'Markdown Matrix Injector'),
    /^\d{4}-\d{2}-\d{2}$/.test(properties.date ?? '') ? meta('dcterms.created', properties.date) : '',
  ].join('');
}

function renderCover(properties: DocumentProperties, title: string): string {
  const field = (className: string, value: string | undefined) => (value ? `<div class="${className}">${escapeHtml(value)}</div>` : '');
  const approvals = properties.approvals.length
    ? `<table class="mmi-cover__approvals"><tr>${properties.approvals.map((role) => `<th>${escapeHtml(role)}</th>`).join('')}</tr>`
      + `<tr>${properties.approvals.map(() => '<td></td>').join('')}</tr></table>`
    : '';
  return `<section class="mmi-cover">`
    + `<div class="mmi-cover__head">${field('mmi-cover__number', properties.documentNumber)}${field('mmi-cover__classification', properties.classification)}</div>`
    + field('mmi-cover__customer', properties.customer)
    + `<div class="mmi-cover__main">${field('mmi-cover__subtitle', properties.subtitle)}${field('mmi-cover__title', title)}`
    + `${field('mmi-cover__version', properties.version)}${field('mmi-cover__date', properties.date)}</div>`
    + `<div class="mmi-cover__foot">${field('mmi-cover__organization', properties.organization)}${approvals}</div>`
    + `</section>`;
}

function renderToc(entries: TocEntry[]): string {
  const items = entries
    .map((entry) => `<li class="mmi-toc__item mmi-toc__item--h${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`)
    .join('');
  return `<nav class="mmi-toc"><div class="mmi-toc__title">目次</div><ol>${items}</ol></nav>`;
}

/** A CSS string literal; `<` is escaped so no value can close the surrounding <style>. */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3C ')}"`;
}

function documentCss(properties: DocumentProperties, title: string): string {
  const size = properties.paper;
  const [top, right = top, bottom = top, left = right] = (properties.margin ?? '20mm 18mm 18mm').split(' ');
  const gutter = properties.gutter
    ? `
  @page :right { margin-left: calc(${left} + ${properties.gutter}); }
  @page :left { margin-right: calc(${right} + ${properties.gutter}); }`
    : '';
  const fonts = properties.font ? `${properties.font.split(', ').map(cssString).join(', ')}, ` : '';
  const footerLeft = [properties.documentNumber, properties.version].filter(Boolean).join('　');
  const margin = (box: string, value: string | undefined, extra = '') => (value ? `@${box} { content: ${cssString(value)}; ${extra} }` : '');
  const runningBoxes = [
    margin('top-left', title),
    margin('top-right', properties.classification, 'font-weight: 700;'),
    margin('bottom-left', footerLeft || undefined),
    '@bottom-center { content: counter(page) " / " counter(pages); }',
  ].join('\n    ');
  return `
  html { font-family: ${fonts}"Noto Sans CJK JP", "Noto Sans JP", "BIZ UDPGothic", "Yu Gothic", "YuGothic", Meiryo, "Hiragino Sans", "Noto Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
    color: #1a1a1a; }
  body { line-height: 1.65; font-size: 10pt; }
  code, pre, kbd, samp { font-family: "Noto Sans Mono CJK JP", Consolas, "BIZ UDGothic", "MS Gothic", "DejaVu Sans Mono", monospace; }
  h1 { font-size: 20pt; } h2 { font-size: 14pt; margin-top: 1.5em; } h3 { font-size: 12pt; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; break-inside: avoid; }
  a { color: #0b5394; } code { overflow-wrap: anywhere; } pre { white-space: pre-wrap; }
  [data-mmi-break="before"] { break-before: page; page-break-before: always; }
  [data-mmi-orientation="landscape"] { page: landscape; }
  [data-mmi-orientation="portrait"] { page: portrait; }
  [data-mmi-break] + .mmi-embed[data-page-break="before"] { break-before: auto; page-break-before: auto; }
  [data-mmi-break] + .mmi-embed[data-page-break="both"] { break-before: auto; page-break-before: auto; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 0.5em 0; }
  th, td { border: 0.75pt solid #808080; padding: 0.25em 0.5em; vertical-align: top; overflow-wrap: break-word; }
  thead th { background: #e8e8e8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  blockquote { margin: 0.8em 0; padding: 0.2em 0.9em; border-left: 3pt solid #b0b0b0; color: #333; }
  @page { size: ${size}; margin: ${top} ${right} ${bottom} ${left};
    @top-left { font-size: 8pt; color: #555; }
    @top-right { font-size: 8pt; }
    @bottom-left { font-size: 8pt; color: #555; }
    @bottom-center { font-size: 9pt; }
    ${runningBoxes}
  }
  @page landscape { size: ${size} landscape; }${gutter}
  @page portrait { size: ${size} portrait; }
  @page mmi-cover { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-center { content: none; } }
  .mmi-cover { page: mmi-cover; break-after: page; display: flex; flex-direction: column; min-height: 240mm; }
  .mmi-cover__head { text-align: right; font-size: 10pt; }
  .mmi-cover__classification { display: inline-block; margin-top: 0.4em; padding: 0.15em 0.8em; border: 1.5pt solid #000; font-weight: 700; }
  .mmi-cover__customer { margin-top: 18mm; font-size: 14pt; }
  .mmi-cover__main { margin-top: 45mm; text-align: center; }
  .mmi-cover__subtitle { font-size: 14pt; margin-bottom: 0.6em; }
  .mmi-cover__title { font-size: 26pt; font-weight: 700; margin-bottom: 1.2em; }
  .mmi-cover__version, .mmi-cover__date { font-size: 12pt; }
  .mmi-cover__foot { margin-top: auto; padding-top: 30mm; text-align: center; }
  .mmi-cover__organization { font-size: 14pt; margin-bottom: 10mm; }
  .mmi-cover__approvals { margin: 0 0 0 auto; }
  .mmi-cover__approvals th { width: 22mm; font-weight: 400; background: none; text-align: center; }
  .mmi-cover__approvals td { height: 22mm; }
  .mmi-toc { break-after: page; }
  .mmi-toc__title { font-size: 16pt; font-weight: 700; margin-bottom: 0.8em; bookmark-level: 1; bookmark-label: "目次"; }
  .mmi-toc ol { list-style: none; padding: 0; margin: 0; }
  .mmi-toc__item { margin: 0.25em 0; }
  .mmi-toc__item--h3 { padding-left: 1.5em; font-size: 0.95em; }
  .mmi-toc a { color: inherit; text-decoration: none; }
  .mmi-toc a::after { content: leader(".") target-counter(attr(href url), page); }
  @media screen { body { max-width: 1100px; margin: 32px auto; padding: 0 24px; } .mmi-cover { min-height: auto; border-bottom: 1px solid #ccc; padding-bottom: 24px; } }`;
}
