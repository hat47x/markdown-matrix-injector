/**
 * One-line summary of what the real rendering engine produced for a
 * candidate embed (issue-0111 criterion 4): the confirm step shows whether
 * the reference renders as a table (and its size), an empty table (grep
 * matched nothing), a card, or an error -- before anything is inserted.
 *
 * Reads only the engine's own markers (`mmi-table`, `mmi-card`,
 * `mmi-error`); it does not re-implement rendering.
 */

export type PreviewSummary =
  | { kind: 'table'; bodyRows: number; columns: number; header: boolean }
  | { kind: 'empty'; columns: number }
  | { kind: 'card' }
  | { kind: 'error'; message: string }
  | { kind: 'unknown' };

export function summarizeRenderedEmbed(html: string): PreviewSummary {
  const error = /<div class="mmi-error">([\s\S]*?)<\/div>/u.exec(html);
  if (error) return { kind: 'error', message: decodeEntities(error[1]) };
  if (html.includes('class="mmi-card"')) return { kind: 'card' };
  const table = /<table class="mmi-table">([\s\S]*?)<\/table>/u.exec(html);
  if (!table) return { kind: 'unknown' };
  const head = /<thead>([\s\S]*?)<\/thead>/u.exec(table[1])?.[1] ?? '';
  const body = /<tbody>([\s\S]*?)<\/tbody>/u.exec(table[1])?.[1] ?? '';
  const bodyRows = (body.match(/<tr[\s>]/gu) ?? []).length;
  const firstRow = /<tr[^>]*>([\s\S]*?)<\/tr>/u.exec(head || body)?.[1] ?? '';
  const columns = (firstRow.match(/<t[hd][\s>]/gu) ?? []).length;
  if (bodyRows === 0) return { kind: 'empty', columns };
  return { kind: 'table', bodyRows, columns, header: head.length > 0 };
}

export function describePreview(summary: PreviewSummary): string {
  switch (summary.kind) {
    case 'table':
      return `表として表示: 本体${summary.bodyRows}行 × ${summary.columns}列${summary.header ? '（見出しあり）' : ''}`;
    case 'empty':
      return `表として表示: 該当行0件（${summary.columns}列。grepに一致する行がありません）`;
    case 'card':
      return '別紙カードとして表示（列数・セル数が大きい、またはシート未指定・mode=card）';
    case 'error':
      return `エラー: ${summary.message}`;
    case 'unknown':
      return '表示を判定できませんでした';
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, '&');
}

/**
 * The engine's table HTML cut down to its header and first `maxRows` body
 * rows, for a hover. Anything that is not a table (card, error) is returned
 * unchanged. Classes and attributes stay as the engine wrote them.
 */
export function truncateTableHtml(html: string, maxRows: number): { html: string; hiddenRows: number } {
  const body = /<tbody>([\s\S]*?)<\/tbody>/u.exec(html);
  if (!body) return { html, hiddenRows: 0 };
  const rows = body[1].match(/<tr[\s>][\s\S]*?<\/tr>/gu) ?? [];
  if (rows.length <= maxRows) return { html, hiddenRows: 0 };
  return {
    html: html.replace(body[0], `<tbody>${rows.slice(0, maxRows).join('')}</tbody>`),
    hiddenRows: rows.length - maxRows,
  };
}
