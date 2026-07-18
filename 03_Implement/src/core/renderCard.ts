import path from 'node:path';
import { type EmbedQuery } from '../parser/embedSyntax.js';

export function renderEmbedCard(query: EmbedQuery, absolutePath: string): string {
  const label = path.basename(absolutePath);
  const meta = [query.target, query.range].filter(Boolean).join(' / ');
  const detail = meta ? `<div class="mmi-card__meta">${escapeHtml(meta)}</div>` : '';
  // ADR-0011 hybrid open affordance:
  // - Baseline: the title links to the source via the author-written relative
  //   path. Plain links survive the Strict preview sanitizer and work without
  //   Workspace Trust, so the reader can always reach the source file.
  // - Trusted environments: an explicit button fires env.openExternal through a
  //   command: URI, opening the source in its OS-default app (Excel etc.).
  //   Untrusted previews simply don't fire it — the baseline link still works.
  const commandUri = `command:markdownMatrixInjector.openSource?${encodeURIComponent(
    JSON.stringify([absolutePath]),
  )}`;

  return [
    `<div class="mmi-card" data-path="${escapeHtml(absolutePath)}">`,
    `<a class="mmi-card__title" href="${escapeHtml(query.filepath)}">${escapeHtml(label)}</a>`,
    detail,
    `<a class="mmi-card__open" href="${escapeHtml(commandUri)}">外部アプリで開く</a>`,
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
