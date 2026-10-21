import path from 'node:path';
import { type EmbedQuery } from '../parser/embedSyntax.js';
import { escapeHtml } from './html.js';

export interface RenderEmbedCardOptions {
  uriScheme?: string;
  /**
   * Document export (HTML for PDF, delivered HTML): emit only the author-written relative
   * path. The absolute local path and the extension open link would leak the author's
   * folder layout (user name, customer name) into a delivered artifact.
   */
  forExport?: boolean;
}

export function renderEmbedCard(query: EmbedQuery, absolutePath: string, options: string | RenderEmbedCardOptions = {}): string {
  const { uriScheme = 'vscode', forExport = false } = typeof options === 'string' ? { uriScheme: options } : options;
  const label = path.basename(absolutePath);
  const meta = [query.target, query.range].filter(Boolean).join(' / ');
  const detail = meta ? `<div class="mmi-card__meta">${escapeHtml(meta)}</div>` : '';
  // data-source is the author-written path; print CSS shows it on paper (別紙参照).
  const source = `data-source="${escapeHtml(query.filepath)}"`;
  if (forExport) {
    return [
      `<div class="mmi-card" ${source}>`,
      `<a class="mmi-card__title" href="${escapeHtml(query.filepath)}">${escapeHtml(label)}</a>`,
      detail,
      '</div>',
    ].join('');
  }
  // ADR-0015: standard Markdown preview does not execute arbitrary command URIs.
  // Route through the extension URI handler, which validates the local source.
  const openUri = `${uriScheme}://hat47x.markdown-matrix-injector/open?source=${encodeURIComponent(absolutePath)}`;

  return [
    `<div class="mmi-card" data-path="${escapeHtml(absolutePath)}" ${source}>`,
    `<a class="mmi-card__title" href="${escapeHtml(query.filepath)}">${escapeHtml(label)}</a>`,
    detail,
    `<a class="mmi-card__open" href="${escapeHtml(openUri)}">外部アプリで開く</a>`,
    '</div>',
  ].join('');
}
