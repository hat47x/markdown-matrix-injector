import path from 'node:path';
import { type EmbedQuery } from '../parser/embedSyntax.js';

export function renderEmbedCard(query: EmbedQuery, absolutePath: string): string {
  const label = path.basename(absolutePath);
  const meta = [query.target, query.range].filter(Boolean).join(' / ');
  const detail = meta ? `<div class="mmi-card__meta">${escapeHtml(meta)}</div>` : '';

  return [
    `<div class="mmi-card" data-path="${escapeHtml(absolutePath)}">`,
    `<div class="mmi-card__title">${escapeHtml(label)}</div>`,
    detail,
    '</div>',
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
