/**
 * Word (OOXML) pieces for `mmi docx` (#636): the raw blocks MMI hands to Pandoc, the reference document that gives the
 * result its styles, headers and footers, and the finishing pass over Pandoc's output.
 *
 * Pandoc turns Markdown into Word, but it has no notion of a delivery document: tables come without borders or a
 * repeating header row, there is no cover, no per-page orientation, no running header or footer. These are added
 * here, and each was checked by opening the result in Microsoft Word (see 02_Architecture/delivery-pdf-output.md).
 *
 * Section breaks are written as sentinels (`@@MMI_SECT:…@@`) and resolved after Pandoc ran, from the section
 * properties Pandoc ended up with: Pandoc renumbers the header and footer relationships, so a reference to them can
 * only be written once the final numbers are known.
 */
import { readZip } from '../core/zipReader.js';
import { writeZip, type ZipFile } from '../core/zipWriter.js';
import type { DocumentProperties } from './documentExport.js';

export const escapeXml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DEFAULT_FONT = 'Yu Gothic';

/** A raw OOXML block for Pandoc's `raw_attribute` extension. */
export const rawBlock = (xml: string): string => `\`\`\`{=openxml}\n${xml}\n\`\`\`\n`;
export const rawInline = (xml: string): string => `\`${xml}\`{=openxml}`;

export const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

export type SectionKind = 'portrait' | 'landscape';

/** Closes the section that ends here. `refs: false` leaves out the running header and footer (the cover). */
export function sectionBreak(kind: SectionKind, refs: boolean): string {
  return `<w:p><w:pPr><w:sectPr>@@MMI_SECT:${kind}:${refs ? 'refs' : 'norefs'}@@</w:sectPr></w:pPr></w:p>`;
}

function fieldRuns(instruction: string, shown: string, runProperties = ''): string {
  const rpr = runProperties ? `<w:rPr>${runProperties}</w:rPr>` : '';
  return `<w:r>${rpr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr}<w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>`
    + `<w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr}<w:t xml:space="preserve">${escapeXml(shown)}</w:t></w:r><w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>`;
}

/** The page number of a bookmark, for "表3（p.12）". Word fills it in when the fields are updated on opening. */
export const pageReference = (bookmark: string): string => fieldRuns(`PAGEREF ${bookmark} \\h`, '?');

/** A bookmark name Word accepts: letters, digits and underscores, starting with a letter. */
export function bookmarkName(id: string): string {
  const cleaned = id.replace(/[^\p{L}\p{N}_]/gu, '_');
  return `mmi_${cleaned}`.slice(0, 40);
}

export function captionParagraph(text: string, bookmark: string | undefined, bookmarkId: number): string {
  const start = bookmark ? `<w:bookmarkStart w:id="${bookmarkId}" w:name="${bookmark}"/>` : '';
  const end = bookmark ? `<w:bookmarkEnd w:id="${bookmarkId}"/>` : '';
  return `<w:p><w:pPr><w:pStyle w:val="TableCaption"/><w:keepNext/></w:pPr>${start}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>${end}</w:p>`;
}

export interface TocEntry {
  level: number;
  text: string;
}

/** The table of contents field. Its shown result lists the headings; Word replaces it with page numbers on update. */
export function tocBlock(entries: TocEntry[]): string {
  const title = '<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>目次</w:t></w:r></w:p>';
  const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "2-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const lines = entries.length > 0 ? entries : [{ level: 2, text: '目次を更新してください' }];
  const paragraphs = lines.map((entry, index) => {
    const indent = entry.level >= 3 ? '<w:pPr><w:spacing w:after="60"/><w:ind w:left="420"/></w:pPr>' : '<w:pPr><w:spacing w:after="60"/></w:pPr>';
    return `<w:p>${indent}${index === 0 ? begin : ''}<w:r><w:t xml:space="preserve">${escapeXml(entry.text)}</w:t></w:r>${index === lines.length - 1 ? end : ''}</w:p>`;
  });
  return title + paragraphs.join('') + PAGE_BREAK;
}

function coverParagraph(text: string, options: { size: number; bold?: boolean; align?: 'center' | 'right' | 'left'; before?: number; after?: number; border?: boolean; indentLeft?: number }): string {
  const border = options.border ? '<w:pBdr><w:top w:val="single" w:sz="12" w:space="2" w:color="000000"/><w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/><w:bottom w:val="single" w:sz="12" w:space="2" w:color="000000"/><w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/></w:pBdr>' : '';
  const indent = options.indentLeft ? `<w:ind w:left="${options.indentLeft}"/>` : '';
  const ppr = `<w:pPr>${border}<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 120}"/>${indent}<w:jc w:val="${options.align ?? 'center'}"/></w:pPr>`;
  const rpr = `<w:rPr>${options.bold ? '<w:b/>' : ''}<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/></w:rPr>`;
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function approvalTable(roles: string[]): string {
  const width = 1500;
  const cell = (content: string): string => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>${content}</w:p></w:tc>`;
  const head = roles.map((role) => cell(`<w:r><w:t>${escapeXml(role)}</w:t></w:r>`)).join('');
  const blank = roles.map(() => cell('')).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Table"/><w:tblW w:w="${width * roles.length}" w:type="dxa"/><w:jc w:val="right"/><w:tblLook w:val="04A0" w:firstRow="1"/></w:tblPr>`
    + `<w:tblGrid>${roles.map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:cantSplit/></w:trPr>${head}</w:tr><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="1100" w:hRule="atLeast"/></w:trPr>${blank}</w:tr></w:tbl>`;
}

/** The cover page, built from front matter. It is the first section and has no running header or footer. */
export function coverBlock(properties: DocumentProperties, title: string): string {
  const parts: string[] = [];
  if (properties.documentNumber) parts.push(coverParagraph(properties.documentNumber, { size: 20, align: 'right', after: 60 }));
  // A bordered paragraph spans the full text width; the indent leaves a box as wide as the label.
  const geometry = pageGeometry(properties);
  const boxWidth = 400 + [...(properties.classification ?? '')].length * 220;
  if (properties.classification) parts.push(coverParagraph(properties.classification, { size: 20, bold: true, align: 'center', border: true, indentLeft: Math.max(0, geometry.width - geometry.left - geometry.right - boxWidth) }));
  if (properties.customer) parts.push(coverParagraph(properties.customer, { size: 28, align: 'left', before: 600 }));
  if (properties.subtitle) parts.push(coverParagraph(properties.subtitle, { size: 28, before: 3000, after: 240 }));
  parts.push(coverParagraph(title, { size: 52, bold: true, before: properties.subtitle ? 0 : 3400, after: 480 }));
  if (properties.version) parts.push(coverParagraph(properties.version, { size: 24 }));
  if (properties.date) parts.push(coverParagraph(properties.date, { size: 24 }));
  if (properties.organization) parts.push(coverParagraph(properties.organization, { size: 28, before: 1600, after: 480 }));
  if (properties.approvals.length > 0) parts.push(approvalTable(properties.approvals));
  parts.push(sectionBreak('portrait', false));
  return parts.join('');
}

// --- page geometry ---------------------------------------------------------------------------------------------

const TWIPS_PER: Record<string, number> = { mm: 1440 / 25.4, cm: 1440 / 2.54, in: 1440, pt: 20 };
const lengthToTwips = (value: string): number => Math.round(parseFloat(value) * TWIPS_PER[value.replace(/^[\d.]+/, '')]);

export interface PageGeometry {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  gutter: number;
}

export function pageGeometry(properties: DocumentProperties): PageGeometry {
  const [top, right = top, bottom = top, left = right] = (properties.margin ?? '20mm 18mm 18mm').split(' ').map(lengthToTwips);
  const a3 = properties.paper === 'A3';
  return { width: a3 ? 16838 : 11906, height: a3 ? 23811 : 16838, top, right, bottom, left, gutter: properties.gutter ? lengthToTwips(properties.gutter) : 0 };
}

const pgMar = (g: PageGeometry): string => `<w:pgMar w:top="${g.top}" w:right="${g.right}" w:bottom="${g.bottom}" w:left="${g.left}" w:header="567" w:footer="567" w:gutter="${g.gutter}"/>`;

// --- the reference document ------------------------------------------------------------------------------------

function restyle(styles: string, styleId: string, paragraph: string, run: string): string {
  const match = new RegExp(`<w:style [^>]*w:styleId="${styleId}"[\\s\\S]*?</w:style>`).exec(styles);
  if (!match) return styles;
  const stripped = match[0].replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
  return styles.replace(match[0], stripped.replace('</w:style>', `<w:pPr>${paragraph}</w:pPr><w:rPr>${run}</w:rPr></w:style>`));
}

function patchStyles(styles: string, font: string): string {
  let result = styles;
  const family = escapeXml(font);
  result = result.replace(/<w:rFonts [^>]*w:asciiTheme="minorHAnsi"[^>]*\/>/, `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>`);
  result = result.replace(/(<w:rPrDefault>[\s\S]*?)<w:sz w:val="\d+"\s*\/>\s*<w:szCs w:val="\d+"\s*\/>/, '$1<w:sz w:val="20"/><w:szCs w:val="20"/>');
  result = result.replace(/<w:lang w:val="[^"]*" w:eastAsia="[^"]*"/, '<w:lang w:val="ja-JP" w:eastAsia="ja-JP"');
  const border = (side: string): string => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const tableStyle = '<w:style w:type="table" w:default="1" w:styleId="Table"><w:name w:val="Table"/><w:basedOn w:val="TableNormal"/><w:qFormat/>'
    + `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + '<w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E8E8E8"/></w:tcPr></w:tblStylePr></w:style>';
  result = result.replace(/<w:style w:type="table" w:default="1" w:styleId="Table">[\s\S]*?<\/w:style>/, () => tableStyle);
  const heading = (size: number, before: number): [string, string] => [`<w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="120"/>`, `<w:b/><w:color w:val="000000"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`];
  result = restyle(result, 'Heading1', ...heading(32, 360));
  result = restyle(result, 'Heading2', ...heading(28, 300));
  result = restyle(result, 'Heading3', ...heading(24, 240));
  const caption: [string, string] = ['<w:keepNext/><w:spacing w:before="120" w:after="60"/>', '<w:b/><w:sz w:val="18"/><w:szCs w:val="18"/>'];
  result = restyle(result, 'Caption', ...caption);
  result = restyle(result, 'TableCaption', ...caption);
  return result;
}

const REL_HEADER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const REL_FOOTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

/** Pandoc's own reference document, given MMI's fonts, table style, headings, running header/footer and page. */
export function buildReferenceDocx(defaultReference: Buffer, properties: DocumentProperties): Buffer {
  const entries = readZip(defaultReference);
  const files: ZipFile[] = [...entries.values()].map((entry) => ({ name: entry.name, data: entry.read() }));
  const get = (name: string): string => {
    const file = files.find((candidate) => candidate.name === name);
    if (!file) throw new Error(`the reference document has no ${name}`);
    return file.data.toString('utf8');
  };
  const set = (name: string, text: string): void => {
    const file = files.find((candidate) => candidate.name === name);
    if (file) file.data = Buffer.from(text, 'utf8');
    else files.push({ name, data: Buffer.from(text, 'utf8') });
  };
  const geometry = pageGeometry(properties);
  const textWidth = geometry.width - geometry.left - geometry.right;
  const size = '<w:sz w:val="16"/><w:szCs w:val="16"/>';
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W_NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${textWidth}"/></w:tabs><w:spacing w:after="0"/></w:pPr>`
    + `${fieldRuns('TITLE', 'タイトル', size)}<w:r><w:tab/></w:r>${fieldRuns('KEYWORDS', '機密区分', `<w:b/>${size}`)}</w:p></w:hdr>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W_NS}><w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="${Math.round(textWidth / 2)}"/></w:tabs><w:spacing w:after="0"/></w:pPr>`
    + `${fieldRuns('SUBJECT', '文書番号', size)}<w:r><w:tab/></w:r>${fieldRuns('PAGE', '1')}<w:r><w:t xml:space="preserve"> / </w:t></w:r>${fieldRuns('NUMPAGES', '1')}</w:p></w:ftr>`;
  set('word/header1.xml', header);
  set('word/footer1.xml', footer);
  set('word/styles.xml', patchStyles(get('word/styles.xml'), properties.font?.split(', ')[0] ?? DEFAULT_FONT));
  set('word/_rels/document.xml.rels', get('word/_rels/document.xml.rels').replace('</Relationships>',
    `<Relationship Type="${REL_HEADER}" Id="rId40" Target="header1.xml"/><Relationship Type="${REL_FOOTER}" Id="rId41" Target="footer1.xml"/></Relationships>`));
  set('[Content_Types].xml', get('[Content_Types].xml').replace('</Types>',
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'));
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rId40"/><w:footerReference w:type="default" r:id="rId41"/><w:pgSz w:w="${geometry.width}" w:h="${geometry.height}"/>${pgMar(geometry)}</w:sectPr>`;
  set('word/document.xml', get('word/document.xml').replace(/<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)(?=\s*<\/w:body>)/, () => sect));
  return writeZip(files);
}

// --- finishing Pandoc's output ----------------------------------------------------------------------------------

export interface FinishOptions {
  properties: DocumentProperties;
  title: string;
  /** Whether the document has fields (table of contents, page references) Word should update on opening. */
  hasFields: boolean;
  now: Date;
}

function lastSectionProperties(document: string): { refs: string; width: number; height: number; margin: string } {
  const matches = [...document.matchAll(/<w:sectPr\b[^>]*>([\s\S]*?)<\/w:sectPr>/g)];
  const inner = matches.at(-1)?.[1] ?? '';
  const refs = [...inner.matchAll(/<w:(?:header|footer)Reference\b[^>]*\/>/g)].map((match) => match[0]).join('');
  const size = /<w:pgSz\b[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(inner) ?? /<w:pgSz\b[^>]*w:h="(\d+)"[^>]*w:w="(\d+)"/.exec(inner);
  const width = size ? Number(size[1]) : 11906;
  const height = size ? Number(size[2]) : 16838;
  const margin = /<w:pgMar\b[^>]*\/>/.exec(inner)?.[0] ?? '<w:pgMar w:top="1134" w:right="1020" w:bottom="1020" w:left="1020" w:header="567" w:footer="567" w:gutter="0"/>';
  return { refs, width: Math.min(width, height), height: Math.max(width, height), margin };
}

const isoDate = (date: Date): string => date.toISOString().replace(/\.\d+Z$/, 'Z');

function coreProperties(options: FinishOptions): string {
  const { properties, title } = options;
  const element = (tag: string, value: string | undefined): string => (value ? `<${tag}>${escapeXml(value)}</${tag}>` : '');
  const stamp = isoDate(options.now);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + element('dc:title', title)
    + element('dc:subject', [properties.documentNumber, properties.version].filter(Boolean).join('　'))
    + element('dc:creator', properties.author ?? properties.organization)
    + element('cp:keywords', properties.classification)
    + element('dc:description', properties.subtitle)
    + '<dc:language>ja-JP</dc:language>'
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`;
}

/** Resolves the section sentinels, gives tables a repeating header row, sets the document properties. */
export function finishDocx(pandocOutput: Buffer, options: FinishOptions): Buffer {
  const files: ZipFile[] = [...readZip(pandocOutput).values()].map((entry) => ({ name: entry.name, data: entry.read() }));
  const index = (name: string): number => files.findIndex((file) => file.name === name);
  const documentAt = index('word/document.xml');
  if (documentAt < 0) throw new Error('Pandoc did not write word/document.xml');
  let document = files[documentAt].data.toString('utf8');

  const section = lastSectionProperties(document);
  document = document.replace(/@@MMI_SECT:(portrait|landscape):(refs|norefs)@@/g, (_whole, kind: string, refs: string) => {
    const size = kind === 'landscape'
      ? `<w:pgSz w:w="${section.height}" w:h="${section.width}" w:orient="landscape"/>`
      : `<w:pgSz w:w="${section.width}" w:h="${section.height}"/>`;
    return `${refs === 'refs' ? section.refs : ''}${size}${section.margin}`;
  });

  // The first row of every table is its header row; rows are not split across pages.
  document = document.replace(/((?:<w:tblGrid\s*\/>|<\/w:tblGrid>)\s*<w:tr\b[^>]*>)(\s*<w:trPr>[\s\S]*?<\/w:trPr>)?/g, (_whole, row: string, properties?: string) => {
    if (properties) {
      const additions = `${properties.includes('<w:cantSplit') ? '' : '<w:cantSplit/>'}${properties.includes('<w:tblHeader') ? '' : '<w:tblHeader/>'}`;
      return row + properties.replace('</w:trPr>', `${additions}</w:trPr>`);
    }
    return `${row}<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>`;
  });
  document = document.replace(/(<\/w:tr>\s*<w:tr\b[^>]*>)(?!\s*<w:trPr>)/g, '$1<w:trPr><w:cantSplit/></w:trPr>');
  files[documentAt].data = Buffer.from(document, 'utf8');

  const coreAt = index('docProps/core.xml');
  if (coreAt >= 0) files[coreAt].data = Buffer.from(coreProperties(options), 'utf8');
  const settingsAt = index('word/settings.xml');
  if (options.hasFields && settingsAt >= 0) {
    const settings = files[settingsAt].data.toString('utf8');
    if (!settings.includes('<w:updateFields')) {
      const updated = settings.includes('<w:footnotePr') ? settings.replace('<w:footnotePr', '<w:updateFields w:val="true"/><w:footnotePr') : settings.replace('</w:settings>', '<w:updateFields w:val="true"/></w:settings>');
      files[settingsAt].data = Buffer.from(updated, 'utf8');
    }
  }
  return writeZip(files);
}
