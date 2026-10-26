/**
 * Automatic table numbers and cross references for delivery HTML (#639).
 *
 * Japanese design documents write "表3（p.12）" and renumber by hand whenever a
 * table is added or moved. With `captionNumbers: true` in the front matter this
 * module numbers the tables that carry a caption and lets a link to a table by
 * its `id` show the number and the page.
 *
 * The numbers are written into the HTML as text, so every consumer sees the
 * same result: a browser, a PDF generator and a Word import. Only the page
 * number needs a generator that supports CSS Paged Media (`target-counter`); a
 * browser drops that one declaration and shows the link without it.
 *
 * Without the front matter key nothing here runs and the output is unchanged.
 * It works on the HTML the renderer produced, so MMI notation and the
 * renderers stay as they are.
 */
import { escapeHtml } from '../core/html.js';

/** A caption that already starts with its own number ("表1　残件一覧", "図 2") is the author's and is left alone. */
const HAND_NUMBERED = /^\s*[表図]\s*[0-9０-９]/u;

const TABLE_FIGURE = /<figure (class="mmi-embed"[^>]*)><figcaption class="mmi-embed__caption">([^<]*)<\/figcaption>(<table class="mmi-table")/gu;
const EMBED_FIGURE = /<figure class="mmi-embed"([^>]*)>/gu;
const INTERNAL_LINK = /<a href="#([^"]*)">([^<]*)<\/a>/gu;

function unescapeHtml(value: string): string {
  return value.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
}

function embedId(attributes: string): string | undefined {
  const match = /(?:^|\s)id="([^"]*)"/u.exec(attributes);
  return match ? unescapeHtml(match[1]) : undefined;
}

/** markdown-it percent-encodes non-ASCII characters of a link target; the figure id keeps them as written. */
function linkTarget(fragment: string): string {
  const raw = unescapeHtml(fragment);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface CaptionNumbering {
  html: string;
  /** Table label by figure id, for example `workflow` -> `表2`. Hand-numbered captions have no entry. */
  labels: ReadonlyMap<string, string>;
}

export function numberCaptions(html: string): CaptionNumbering {
  const labels = new Map<string, string>();
  let count = 0;
  let numbered = html.replace(TABLE_FIGURE, (whole, attributes: string, caption: string, table: string) => {
    if (HAND_NUMBERED.test(unescapeHtml(caption))) return whole;
    count += 1;
    const label = `表${count}`;
    const id = embedId(attributes);
    if (id !== undefined) labels.set(id, label);
    return `<figure ${attributes}><figcaption class="mmi-embed__caption"><span class="mmi-embed__number">${label}</span>　${caption}</figcaption>${table}`;
  });

  // Every embed with an id can be linked; only numbered tables have a label to show.
  const embedIds = new Set<string>();
  for (const match of numbered.matchAll(EMBED_FIGURE)) {
    const id = embedId(match[1]);
    if (id !== undefined) embedIds.add(id);
  }
  numbered = numbered.replace(INTERNAL_LINK, (whole, fragment: string, text: string) => {
    const id = linkTarget(fragment);
    if (!embedIds.has(id)) return whole;
    const label = labels.get(id);
    // `[](#id)` has no text of its own, so it takes the table's current number; a link with text keeps it.
    if (text.trim() === '' && label === undefined) return whole;
    const shown = text.trim() === '' ? escapeHtml(label as string) : text;
    return `<a class="mmi-xref" href="#${fragment}">${shown}</a>`;
  });
  return { html: numbered, labels };
}

/** The page number after a cross reference: "表3" becomes "表3（p.12）". Generators without target-counter drop it. */
export const CROSS_REFERENCE_CSS = '  .mmi-xref::after { content: "（p." target-counter(attr(href url), page) "）"; }';
