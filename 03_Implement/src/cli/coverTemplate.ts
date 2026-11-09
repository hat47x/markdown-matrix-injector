/**
 * A customer's own cover page for the HTML/PDF export (#635).
 *
 * Many customers prescribe the cover of a deliverable: logo, ruled frame, where the document number and the
 * approval stamps go. The template is an HTML fragment with `{{placeholders}}` filled from the front matter; MMI
 * wraps it so it is the first page, has no running header or footer, and is followed by a page break.
 *
 * The fragment is inlined into the exported HTML, so it is held to the same rules as customer CSS: it must not run
 * anything and must not pull anything from the network, so the document renders the same offline on any machine.
 */
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { escapeHtml } from '../core/html.js';
import { hasExternalCssReference } from './cssExternalRefs.js';
import type { DocumentProperties } from './documentExport.js';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export class CoverTemplateError extends Error {}

/** Placeholders a template may use. */
export const COVER_PLACEHOLDERS = [
  'title', 'subtitle', 'documentNumber', 'version', 'date', 'customer', 'organization', 'author', 'classification', 'approvals',
] as const;

const FORBIDDEN_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'frame', 'frameset', 'applet']);
const URL_ATTRIBUTES = new Set(['src', 'href', 'poster', 'srcset', 'action', 'formaction', 'data', 'xlink:href']);
/** A URL that leaves the template: any scheme or network address, except an embedded image or font and a link inside the page. */
function isExternal(value: string): boolean {
  const url = value.trim();
  if (url.startsWith('#') || /^data:(?:image|font)\//iu.test(url)) return false;
  return /^[a-z][a-z0-9+.-]*:/iu.test(url) || url.startsWith('//');
}
const EXTERNAL_CSS = { test: hasExternalCssReference };

function check(node: Node, template: string): void {
  if ('tagName' in node) {
    const element = node as Element;
    if (FORBIDDEN_ELEMENTS.has(element.tagName)) throw new CoverTemplateError(`<${element.tagName}> is not allowed in a cover template`);
    for (const attribute of element.attrs) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) throw new CoverTemplateError(`event attribute ${name} is not allowed in a cover template`);
      if (URL_ATTRIBUTES.has(name) && isExternal(attribute.value)) {
        // "data:image/..." is allowed (a logo embedded in the template); other schemes and network addresses are not.
        throw new CoverTemplateError(`${name}="${attribute.value.slice(0, 40)}" points outside the template; embed the image as a data: URI`);
      }
      if (name === 'style' && EXTERNAL_CSS.test(attribute.value)) throw new CoverTemplateError('external url() and @import are not allowed in a cover template');
    }
    if (element.tagName === 'style') {
      const css = element.childNodes.map((child) => ('value' in child ? String(child.value) : '')).join('');
      if (EXTERNAL_CSS.test(css)) throw new CoverTemplateError('external url() and @import are not allowed in a cover template');
    }
  }
  if ('content' in node && node.content) check(node.content as unknown as Node, template);
  if ('childNodes' in node) for (const child of node.childNodes) check(child, template);
}

/** The approval stamp boxes, as the built-in cover draws them. */
export function approvalTable(approvals: string[]): string {
  if (approvals.length === 0) return '';
  return `<table class="mmi-cover__approvals"><tr>${approvals.map((role) => `<th>${escapeHtml(role)}</th>`).join('')}</tr>`
    + `<tr>${approvals.map(() => '<td></td>').join('')}</tr></table>`;
}

/** Fills the template and wraps it as the cover section. Unknown placeholders are errors, so a typo is not printed. */
export function renderCoverTemplate(template: string, properties: DocumentProperties, title: string): string {
  const unclosed = template.replace(/\{\{\s*[A-Za-z]+\s*\}\}/g, '');
  if (/\{\{|\}\}/.test(unclosed)) throw new CoverTemplateError('a "{{" or "}}" in the cover template is not a placeholder; write {{name}}');
  check(parseFragment(template) as unknown as Node, template);
  const values: Record<(typeof COVER_PLACEHOLDERS)[number], string> = {
    title: escapeHtml(title),
    subtitle: escapeHtml(properties.subtitle ?? ''),
    documentNumber: escapeHtml(properties.documentNumber ?? ''),
    version: escapeHtml(properties.version ?? ''),
    date: escapeHtml(properties.date ?? ''),
    customer: escapeHtml(properties.customer ?? ''),
    organization: escapeHtml(properties.organization ?? ''),
    author: escapeHtml(properties.author ?? ''),
    classification: escapeHtml(properties.classification ?? ''),
    approvals: approvalTable(properties.approvals),
  };
  const filled = template.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_whole, name: string) => {
    if (!(COVER_PLACEHOLDERS as readonly string[]).includes(name)) {
      throw new CoverTemplateError(`unknown placeholder {{${name}}} in the cover template; use ${COVER_PLACEHOLDERS.map((placeholder) => `{{${placeholder}}}`).join(', ')}`);
    }
    return values[name as (typeof COVER_PLACEHOLDERS)[number]];
  });
  return `<section class="mmi-cover-custom">${filled}</section>`;
}

export const COVER_TEMPLATE_CSS = `
  .mmi-cover-custom { page: mmi-cover; break-after: page; }
  @media screen { .mmi-cover-custom { border-bottom: 1px solid #ccc; padding-bottom: 24px; } }`;
