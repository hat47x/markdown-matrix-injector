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

/** The wording of a preview summary, per language (issue-0211: the UI must not mix languages). */
export interface PreviewPhrases {
  table(bodyRows: number, columns: number, header: boolean): string;
  empty(columns: number): string;
  card(): string;
  error(message: string): string;
  unknown(): string;
}

/** The wording a plain (no VS Code host) caller sees: the English reference. */
export const enPreviewPhrases: PreviewPhrases = {
  table: (bodyRows, columns, header) => `Renders as a table: ${bodyRows} body rows × ${columns} columns${header ? ' (with header)' : ''}`,
  empty: (columns) => `Renders as a table: 0 matching rows (${columns} columns). No row matched the grep condition.`,
  card: () => 'Renders as a card sheet (no sheet or mode=card, or too many columns or cells for a table)',
  error: (message) => `Error: ${message}`,
  unknown: () => 'Could not determine what this renders as',
};

/** The previous Japanese wording, kept verbatim (the reference the confirmation screen was checked against). */
export const jaPreviewPhrases: PreviewPhrases = {
  table: (bodyRows, columns, header) => `表として表示: 本体${bodyRows}行 × ${columns}列${header ? '（見出しあり）' : ''}`,
  empty: (columns) => `表として表示: 該当行0件（${columns}列。grepに一致する行がありません）`,
  card: () => '別紙カードとして表示（列数・セル数が大きい、またはシート未指定・mode=card）',
  error: (message) => `エラー: ${message}`,
  unknown: () => '表示を判定できませんでした',
};

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

export function describePreview(summary: PreviewSummary, phrases: PreviewPhrases = enPreviewPhrases): string {
  switch (summary.kind) {
    case 'table':
      return phrases.table(summary.bodyRows, summary.columns, summary.header);
    case 'empty':
      return phrases.empty(summary.columns);
    case 'card':
      return phrases.card();
    case 'error':
      return phrases.error(summary.message);
    case 'unknown':
      return phrases.unknown();
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
