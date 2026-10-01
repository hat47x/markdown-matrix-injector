/**
 * Same-layout sheets across the books being imported
 * (02_Architecture/import-assistance.md §4).
 *
 * Design documents are written from templates, so most sheets of a book share
 * a layout: the same headings, the same table headers, the same key/value
 * frame. Telling the person "these twelve sheets have one layout, these two
 * differ, and here is how" lets them decide once per layout and look closely
 * only at the deviations. This is the product form of the worksheet-format
 * research (ADR-0017): the comparison is exact and explained item by item,
 * never a score that stands in for a decision.
 */
import type { ImportCandidate } from './importCandidates.js';

export interface SheetRef {
  book: string;
  sheet: string;
}

export interface LayoutGroup {
  /** 1-based, in order of first appearance. */
  id: number;
  members: SheetRef[];
}

export interface LayoutDifference {
  kind: 'column-added' | 'column-missing' | 'heading-added' | 'heading-missing' | 'table-added' | 'table-missing' | 'label-added' | 'label-missing';
  /** Table title (or heading/label text) the difference is about. */
  subject: string;
  detail?: string;
}

export interface LayoutDeviation {
  sheet: SheetRef;
  /** The group (or single sheet) it is closest to. */
  nearest: { group?: number; sheet: SheetRef };
  /** Share of layout items the two have in common (Jaccard), for ordering only. */
  overlap: number;
  differences: LayoutDifference[];
}

export interface LayoutSummary {
  groups: LayoutGroup[];
  deviations: LayoutDeviation[];
  /** Sheets that are neither in a group nor close to another sheet. */
  unique: SheetRef[];
}

export interface SheetCandidates extends SheetRef {
  candidates: readonly ImportCandidate[];
}

/** Items shared by a layout: headings, table headers per table, frame labels. */
interface LayoutItems {
  headings: string[];
  tables: { title: string; headers: string[] }[];
  labels: string[];
}

const NEAR_OVERLAP = 0.6;

export function summarizeLayouts(sheets: readonly SheetCandidates[]): LayoutSummary {
  const items = sheets.map((sheet) => layoutItems(sheet.candidates));
  const keys = items.map((item) => [...tokens(item)].sort().join('\n'));

  const groups: LayoutGroup[] = [];
  const groupOf = new Map<number, number>();
  keys.forEach((key, index) => {
    if (groupOf.has(index) || key === '') return;
    const members = keys.flatMap((other, j) => (other === key ? [j] : []));
    if (members.length < 2) return;
    const id = groups.length + 1;
    groups.push({ id, members: members.map((j) => ref(sheets[j])) });
    members.forEach((j) => groupOf.set(j, id));
  });

  const deviations: LayoutDeviation[] = [];
  const unique: SheetRef[] = [];
  sheets.forEach((sheet, index) => {
    if (groupOf.has(index)) return;
    const mine = tokens(items[index]);
    let best: { j: number; overlap: number } | undefined;
    sheets.forEach((_, j) => {
      if (j === index || keys[j] === '') return;
      const overlap = jaccard(mine, tokens(items[j]));
      // Prefer a grouped sheet on ties: a deviation from a shared layout is the useful message.
      if (!best || overlap > best.overlap || (overlap === best.overlap && groupOf.has(j) && !groupOf.has(best.j))) best = { j, overlap };
    });
    if (!best || best.overlap < NEAR_OVERLAP) {
      unique.push(ref(sheet));
      return;
    }
    deviations.push({
      sheet: ref(sheet),
      nearest: { group: groupOf.get(best.j), sheet: ref(sheets[best.j]) },
      overlap: Math.round(best.overlap * 1000) / 1000,
      differences: describeDifferences(items[index], items[best.j]),
    });
  });
  return { groups, deviations, unique };
}

function ref(sheet: SheetRef): SheetRef {
  return { book: sheet.book, sheet: sheet.sheet };
}

function layoutItems(candidates: readonly ImportCandidate[]): LayoutItems {
  const headings: string[] = [];
  const tables: LayoutItems['tables'] = [];
  const labels: string[] = [];
  for (const candidate of candidates) {
    if (candidate.role === 'heading') headings.push(candidate.excerpt[0] ?? '');
    else if (candidate.role === 'table') {
      // Untitled tables are compared by their order on the sheet (表1, 表2, ...).
      tables.push({ title: candidate.title ?? `表${tables.length + 1}`, headers: (candidate.columns ?? []).map((column) => column.header) });
    } else if (candidate.role === 'key-value' || candidate.role === 'form') labels.push(...(candidate.labels ?? []));
  }
  return { headings, tables, labels };
}

function tokens(items: LayoutItems): Set<string> {
  const out = new Set<string>();
  for (const heading of items.headings) out.add(`h\t${heading}`);
  for (const table of items.tables) {
    out.add(`t\t${table.title}`);
    for (const header of table.headers) out.add(`c\t${table.title}\t${header}`);
  }
  for (const label of items.labels) out.add(`k\t${label}`);
  return out;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / (a.size + b.size - common);
}

function describeDifferences(mine: LayoutItems, theirs: LayoutItems): LayoutDifference[] {
  const out: LayoutDifference[] = [];
  const setDiff = (a: readonly string[], b: readonly string[]): string[] => a.filter((x) => !b.includes(x));
  for (const heading of setDiff(mine.headings, theirs.headings)) out.push({ kind: 'heading-added', subject: heading });
  for (const heading of setDiff(theirs.headings, mine.headings)) out.push({ kind: 'heading-missing', subject: heading });
  for (const table of mine.tables) {
    const other = theirs.tables.find((candidate) => candidate.title === table.title);
    if (!other) {
      out.push({ kind: 'table-added', subject: table.title });
      continue;
    }
    for (const header of setDiff(table.headers, other.headers)) out.push({ kind: 'column-added', subject: table.title, detail: header });
    for (const header of setDiff(other.headers, table.headers)) out.push({ kind: 'column-missing', subject: table.title, detail: header });
  }
  for (const table of theirs.tables) {
    if (!mine.tables.some((candidate) => candidate.title === table.title)) out.push({ kind: 'table-missing', subject: table.title });
  }
  for (const label of setDiff(mine.labels, theirs.labels)) out.push({ kind: 'label-added', subject: label });
  for (const label of setDiff(theirs.labels, mine.labels)) out.push({ kind: 'label-missing', subject: label });
  return out;
}

export function describeDifferenceJa(difference: LayoutDifference): string {
  switch (difference.kind) {
    case 'column-added':
      return `表「${difference.subject}」に列「${difference.detail}」があります`;
    case 'column-missing':
      return `表「${difference.subject}」に列「${difference.detail}」がありません`;
    case 'heading-added':
      return `見出し「${difference.subject}」があります`;
    case 'heading-missing':
      return `見出し「${difference.subject}」がありません`;
    case 'table-added':
      return `表「${difference.subject}」があります`;
    case 'table-missing':
      return `表「${difference.subject}」がありません`;
    case 'label-added':
      return `項目「${difference.subject}」があります`;
    case 'label-missing':
      return `項目「${difference.subject}」がありません`;
  }
}
