import { type EmbedQuery } from '../parser/embedSyntax.js';

const PAGE_BREAK_VALUES = new Set(['before', 'after', 'both']);
const ORIENTATION_VALUES = new Set(['landscape', 'portrait']);

export function renderEmbedFrame(query: EmbedQuery, innerHtml: string): string {
  const id = sanitizeAttribute(query.params.get('id'));
  const pageBreak = normalizeValue(query.params.get('pageBreak'), PAGE_BREAK_VALUES);
  const orientation = normalizeValue(query.params.get('orientation'), ORIENTATION_VALUES);
  const caption = query.params.get('caption')?.trim();
  const attributes = [
    'class="mmi-embed"',
    id ? `id="${escapeHtml(id)}"` : '',
    pageBreak ? `data-page-break="${escapeHtml(pageBreak)}"` : '',
    orientation ? `data-orientation="${escapeHtml(orientation)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const captionHtml = caption ? `<figcaption class="mmi-embed__caption">${escapeHtml(caption)}</figcaption>` : '';

  return `<figure ${attributes}>${captionHtml}${innerHtml}</figure>`;
}

function normalizeValue(value: string | null, allowedValues: Set<string>): string | null {
  if (!value) {
    return null;
  }

  return allowedValues.has(value) ? value : null;
}

function sanitizeAttribute(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
