/**
 * Small synthesized WordprocessingML packages for the docx Source Adapter
 * tests. The ZIP writer is shared with the Excel image fixtures so the test
 * bytes go through the same read-only reader as a real `.docx`.
 */
import { zipOf } from './buildXlsxWithImages.js';

export const DOCX_NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

export interface DocxPackageInput {
  body?: string;
  styles?: string;
  comments?: string;
  relationships?: readonly string[];
  media?: Readonly<Record<string, Buffer | string>>;
  documentXml?: string;
}

export function relationship(input: {
  id: string;
  target: string;
  type?: string;
  external?: boolean;
}): string {
  const type = input.type ?? IMAGE_REL;
  return `<Relationship Id="${input.id}" Type="${type}" Target="${input.target}"${input.external ? ' TargetMode="External"' : ''}/>`;
}

export function buildDocx(input: DocxPackageInput): Buffer {
  const entries: Record<string, Buffer | string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>',
    'word/document.xml': input.documentXml
      ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOCX_NAMESPACES}><w:body>${input.body ?? ''}</w:body></w:document>`,
    'word/_rels/document.xml.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${(input.relationships ?? []).join('')}</Relationships>`,
  };
  if (input.styles !== undefined) entries['word/styles.xml'] = input.styles;
  if (input.comments !== undefined) entries['word/comments.xml'] = input.comments;
  for (const [name, content] of Object.entries(input.media ?? {})) {
    entries[`word/media/${name}`] = content;
  }
  return zipOf(entries);
}

export function paragraph(text: string, options: {
  styleId?: string;
  outlineLevel?: number;
  before?: string;
  after?: string;
} = {}): string {
  const properties = [
    options.styleId ? `<w:pStyle w:val="${options.styleId}"/>` : '',
    options.outlineLevel !== undefined ? `<w:outlineLvl w:val="${options.outlineLevel}"/>` : '',
  ].join('');
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${options.before ?? ''}`
    + `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>${options.after ?? ''}</w:p>`;
}

export function table(rows: readonly (readonly {
  text: string;
  gridSpan?: number;
  vMerge?: 'continue' | 'restart';
}[])[]): string {
  const body = rows.map((row, rowIndex) => {
    const properties = rowIndex === 0 ? '' : '';
    const cells = row.map((cell) => {
      const cellProperties = [
        cell.gridSpan && cell.gridSpan > 1 ? `<w:gridSpan w:val="${cell.gridSpan}"/>` : '',
        cell.vMerge ? `<w:vMerge${cell.vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : '',
      ].join('');
      return `<w:tc>${cellProperties ? `<w:tcPr>${cellProperties}</w:tcPr>` : ''}`
        + `<w:p><w:r><w:t xml:space="preserve">${cell.text}</w:t></w:r></w:p></w:tc>`;
    }).join('');
    return `<w:tr>${properties}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr/><w:tblGrid/>${body}</w:tbl>`;
}

export function tableWithHeaderRow(
  header: readonly string[],
  body: readonly (readonly string[])[],
): string {
  const renderRow = (cells: readonly string[], headerRow: boolean) =>
    `<w:tr>${headerRow ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((text) =>
      `<w:tc><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr/><w:tblGrid/>${renderRow(header, true)}${body.map((row) => renderRow(row, false)).join('')}</w:tbl>`;
}

export function drawing(input: {
  relationshipId?: string;
  externalRelationshipId?: string;
  name?: string;
  description?: string;
  extent?: { cx: number; cy: number };
  uri?: string;
}): string {
  const blip = input.relationshipId
    ? `<a:blip r:embed="${input.relationshipId}"/>`
    : input.externalRelationshipId
      ? `<a:blip r:link="${input.externalRelationshipId}"/>`
      : '<a:blip/>';
  return `<w:p><w:r><w:drawing><wp:inline>`
    + (input.extent ? `<wp:extent cx="${input.extent.cx}" cy="${input.extent.cy}"/>` : '')
    + `<wp:docPr id="1" name="${input.name ?? 'Picture 1'}"${input.description ? ` descr="${input.description}"` : ''}/>`
    + '<a:graphic><a:graphicData uri="'
    + (input.uri ?? 'http://schemas.openxmlformats.org/drawingml/2006/picture')
    + '"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="'
    + (input.name ?? 'Picture 1')
    + '"/></pic:nvPicPr><pic:blipFill>'
    + blip
    + '</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

export function stylesXml(styles: readonly {
  id: string;
  name?: string;
  basedOn?: string;
  outlineLevel?: number;
}[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${DOCX_NAMESPACES}>`
    + styles.map((style) =>
      `<w:style w:type="paragraph" w:styleId="${style.id}">`
      + (style.name ? `<w:name w:val="${style.name}"/>` : '')
      + (style.basedOn ? `<w:basedOn w:val="${style.basedOn}"/>` : '')
      + (style.outlineLevel !== undefined
        ? `<w:pPr><w:outlineLvl w:val="${style.outlineLevel}"/></w:pPr>`
        : '')
      + '</w:style>').join('')
    + '</w:styles>';
}

export function commentsXml(comments: readonly {
  id: string;
  text: string;
  author?: string;
  initials?: string;
  date?: string;
}[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments ${DOCX_NAMESPACES}>`
    + comments.map((comment) =>
      `<w:comment w:id="${comment.id}"${comment.author ? ` w:author="${comment.author}"` : ''}`
      + `${comment.initials ? ` w:initials="${comment.initials}"` : ''}`
      + `${comment.date ? ` w:date="${comment.date}"` : ''}>`
      + `<w:p><w:r><w:t>${comment.text}</w:t></w:r></w:p></w:comment>`).join('')
    + '</w:comments>';
}

export function markedComment(text: string, id: string): string {
  return `<w:p><w:commentRangeStart w:id="${id}"/><w:r><w:t>${text}</w:t></w:r>`
    + `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r></w:p>`;
}
