/**
 * Revision marks for delivery HTML (#638).
 *
 * A reviser hands the customer a new version of a document and the customer asks what changed. This module
 * compares the previous and the current rendering of a document block by block (heading, paragraph, list item,
 * table row, table caption, 別紙 card) and marks the current HTML: `data-mmi-rev="added|changed"` on the block, and
 * a list of deleted blocks for an appendix. Tables are compared after MMI expanded them, so a changed value in the
 * referenced Excel or CSV shows up as a changed row when the previous version is rendered from its own data.
 *
 * The comparison is a reading aid for the reviewer. It decides nothing about acceptance, and a block that only moved
 * is reported as deleted and added.
 *
 * It works on the HTML the renderer produced; MMI notation and the renderers stay as they are, and a document that
 * is not compared is not touched.
 */
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { escapeHtml } from '../core/html.js';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export type RevisionState = 'added' | 'changed';

interface Unit {
  key: string;
  /** Where the block starts and the end of its start tag, to splice an attribute into the current HTML. */
  tagEnd: number;
  caption: boolean;
  heading: string;
}

const MAX_CELLS = 30_000_000;

/** Two blocks count as the same block edited when this share of their two-character pieces is common. */
const MIN_SIMILARITY = 0.3;

/** Sørensen–Dice coefficient over character bigrams (a single character counts as its own piece). */
function similarity(left: string, right: string): number {
  const pieces = (text: string): Map<string, number> => {
    const counts = new Map<string, number>();
    const size = text.length < 2 ? 1 : 2;
    for (let index = 0; index + size <= text.length; index += 1) {
      const piece = text.slice(index, index + size);
      counts.set(piece, (counts.get(piece) ?? 0) + 1);
    }
    return counts;
  };
  const a = pieces(left);
  const b = pieces(right);
  let common = 0;
  for (const [piece, count] of a) common += Math.min(count, b.get(piece) ?? 0);
  const total = [...a.values()].reduce((sum, count) => sum + count, 0) + [...b.values()].reduce((sum, count) => sum + count, 0);
  return total === 0 ? 0 : (2 * common) / total;
}

const textOf = (node: Node): string => {
  if ('value' in node && node.nodeName === '#text') return node.value;
  if ('childNodes' in node) return node.childNodes.map(textOf).join(' ');
  return '';
};

const normalize = (text: string): string => text.replace(/\s+/gu, ' ').trim();
const isElement = (node: Node): node is Element => 'tagName' in node;
const classes = (element: Element): string[] => (element.attrs.find((attr) => attr.name === 'class')?.value ?? '').split(/\s+/u);

function tagEndOf(element: Element): number {
  const location = element.sourceCodeLocation?.startTag;
  if (!location) throw new Error('revision marks need source locations');
  return location.endOffset - 1;
}

/** Splits rendered body HTML into comparable blocks, in document order. */
export function extractUnits(html: string): Unit[] {
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  const units: Unit[] = [];
  let heading = '';
  const push = (element: Element, text: string, caption = false): void => {
    const key = normalize(text);
    if (key) units.push({ key, tagEnd: tagEndOf(element), caption, heading });
  };
  const rows = (element: Element): void => {
    for (const child of element.childNodes) {
      if (!isElement(child)) continue;
      if (child.tagName === 'tr') push(child, child.childNodes.filter(isElement).map((cell) => normalize(textOf(cell))).join(' | '));
      else rows(child);
    }
  };
  const visit = (element: Element): void => {
    const tag = element.tagName;
    if (/^h[1-6]$/u.test(tag)) {
      heading = normalize(textOf(element));
      push(element, textOf(element));
    } else if (tag === 'figure' && classes(element).includes('mmi-embed')) {
      for (const child of element.childNodes) {
        if (!isElement(child)) continue;
        if (child.tagName === 'figcaption') push(element, textOf(child), true);
        else if (child.tagName === 'table') rows(child);
        else push(child, textOf(child));
      }
    } else if (tag === 'table') {
      rows(element);
    } else if (tag === 'ul' || tag === 'ol') {
      for (const item of element.childNodes) if (isElement(item) && item.tagName === 'li') push(item, textOf(item));
    } else if (tag === 'blockquote' || tag === 'div' || tag === 'section') {
      for (const child of element.childNodes) if (isElement(child)) visit(child);
    } else if (tag !== 'hr') {
      push(element, textOf(element));
    }
  };
  for (const node of fragment.childNodes) if (isElement(node)) visit(node);
  return units;
}

export interface RevisionDiff {
  /** Marks for the current units, by index. */
  marks: Map<number, RevisionState>;
  deleted: Unit[];
}

/** Longest common subsequence over the blocks that differ after the shared head and tail are dropped. */
export function diffUnits(previous: Unit[], current: Unit[]): RevisionDiff {
  let head = 0;
  while (head < previous.length && head < current.length && previous[head].key === current[head].key) head += 1;
  let tail = 0;
  while (tail < previous.length - head && tail < current.length - head
    && previous[previous.length - 1 - tail].key === current[current.length - 1 - tail].key) tail += 1;
  const a = previous.slice(head, previous.length - tail);
  const b = current.slice(head, current.length - tail);
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) throw new Error('the documents differ too much to compare block by block');
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = a[i].key === b[j].key ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const marks = new Map<number, RevisionState>();
  const deleted: Unit[] = [];
  let i = 0;
  let j = 0;
  let removed: Unit[] = [];
  let added: number[] = [];
  const flush = (): void => {
    // A removed block facing an added block of similar text is an edit. Pair them in order; the rest are plain
    // additions and deletions, so a new section next to a deleted line is not reported as an edit of that line.
    // When the same number of blocks was removed and added between identical neighbours, they are edits in place.
    const inPlace = removed.length === added.length;
    let next = 0;
    for (const index of added) {
      let match = -1;
      for (let k = next; k < removed.length; k += 1) {
        if (inPlace || similarity(removed[k].key, current[index].key) >= MIN_SIMILARITY) {
          match = k;
          break;
        }
      }
      if (match < 0) {
        marks.set(index, 'added');
      } else {
        deleted.push(...removed.slice(next, match));
        marks.set(index, 'changed');
        next = match + 1;
      }
    }
    deleted.push(...removed.slice(next));
    removed = [];
    added = [];
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].key === b[j].key) {
      flush();
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length || lcs[i * width + j + 1] >= lcs[(i + 1) * width + j])) {
      added.push(head + j);
      j += 1;
    } else {
      removed.push(a[i]);
      i += 1;
    }
  }
  flush();
  return { marks, deleted };
}

export interface RevisionResult {
  html: string;
  appendixHtml: string;
  counts: { added: number; changed: number; deleted: number };
}

/**
 * Marks `currentHtml` against `previousHtml`. The attribute goes at the end of each start tag so the patterns other
 * post-processors use on the start of a tag (caption numbers) keep matching.
 */
export function markRevisions(previousHtml: string, currentHtml: string, baseLabel: string): RevisionResult {
  const previous = extractUnits(previousHtml);
  const current = extractUnits(currentHtml);
  const { marks, deleted } = diffUnits(previous, current);
  const inserts = [...marks.entries()].map(([index, state]) => ({
    at: current[index].tagEnd,
    text: current[index].caption ? ` data-mmi-rev-caption="${state}"` : ` data-mmi-rev="${state}"`,
  }));
  // A figure whose caption and rows both changed would receive the caption attribute once per unit; keep one per tag.
  const seen = new Set<string>();
  let html = currentHtml;
  for (const insert of inserts.filter((item) => !seen.has(`${item.at}${item.text}`) && seen.add(`${item.at}${item.text}`)).sort((x, y) => y.at - x.at)) {
    html = `${html.slice(0, insert.at)}${insert.text}${html.slice(insert.at)}`;
  }
  const counts = {
    added: [...marks.values()].filter((state) => state === 'added').length,
    changed: [...marks.values()].filter((state) => state === 'changed').length,
    deleted: deleted.length,
  };
  return { html, appendixHtml: renderAppendix(baseLabel, counts, deleted), counts };
}

function renderAppendix(baseLabel: string, counts: RevisionResult['counts'], deleted: Unit[]): string {
  const summary = `追加${counts.added}件・変更${counts.changed}件・削除${counts.deleted}件`;
  const rows = deleted
    .map((unit) => `<tr><td>${escapeHtml(unit.heading)}</td><td>${escapeHtml(unit.key)}</td></tr>`)
    .join('');
  const table = deleted.length
    ? `<table class="mmi-revisions__deleted"><thead><tr><th>見出し</th><th>削除した内容</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>削除した内容はありません。</p>';
  return `<section class="mmi-revisions"><div class="mmi-revisions__title">改訂箇所の一覧</div>`
    + `<p>比較元: ${escapeHtml(baseLabel)}　${summary}</p>`
    + '<p>本文の左端の実線は追加した箇所、二重線は変更した箇所を表します。移動した箇所は、削除と追加として示します。</p>'
    + `${table}</section>`;
}

export const REVISION_CSS = `
  [data-mmi-rev="added"], [data-mmi-rev="changed"] { border-left: 3pt solid #c00000; padding-left: 0.5em; }
  [data-mmi-rev="changed"] { border-left-style: double; border-left-width: 4pt; }
  tr[data-mmi-rev] { border-left: 0; padding-left: 0; }
  tr[data-mmi-rev="added"] > :first-child { border-left: 3pt solid #c00000; }
  tr[data-mmi-rev="changed"] > :first-child { border-left: 4pt double #c00000; }
  [data-mmi-rev-caption="added"] > figcaption { border-left: 3pt solid #c00000; padding-left: 0.5em; }
  [data-mmi-rev-caption="changed"] > figcaption { border-left: 4pt double #c00000; padding-left: 0.5em; }
  .mmi-revisions { break-before: page; }
  .mmi-revisions__title { font-size: 14pt; font-weight: 700; margin-bottom: 0.8em; bookmark-level: 2; bookmark-label: "改訂箇所の一覧"; }
  .mmi-revisions__deleted { width: 100%; }`;
