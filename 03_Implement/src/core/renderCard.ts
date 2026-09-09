import path from 'node:path';
import { type EmbedQuery } from '../parser/embedSyntax.js';
import { escapeHtml } from './html.js';

export function renderEmbedCard(query: EmbedQuery, absolutePath: string, uriScheme = 'vscode'): string {
  const label = path.basename(absolutePath);
  const meta = [query.target, query.range].filter(Boolean).join(' / ');
  const detail = meta ? `<div class="mmi-card__meta">${escapeHtml(meta)}</div>` : '';
  // ADR-0015: standard Markdown preview does not execute arbitrary command URIs.
  // Route through the extension URI handler, which validates the local source.
  const openUri = `${uriScheme}://hat47x.markdown-matrix-injector/open?source=${encodeURIComponent(absolutePath)}`;

  return [
    `<div class="mmi-card" data-path="${escapeHtml(absolutePath)}">`,
    `<a class="mmi-card__title" href="${escapeHtml(query.filepath)}">${escapeHtml(label)}</a>`,
    detail,
    `<a class="mmi-card__open" href="${escapeHtml(openUri)}">外部アプリで開く</a>`,
    '</div>',
  ].join('');
}
