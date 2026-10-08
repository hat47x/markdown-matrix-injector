/**
 * Abbreviations the user registers themselves (ADR-0023). The built-in lexicon was removed: no list
 * can follow every company's vocabulary, so the vocabulary comes from the user's own documents
 * (documentGlossary.ts) and from what the user decides here.
 *
 * Stored as text in the workspace setting `markdownMatrixInjector.search.aliases`, one pair per entry
 * (`CBM=容積重量`), so it can be read, edited and shared like any other setting. Nothing is learned
 * silently: a pair is offered after the user picks a table that the typed name did not match, and it
 * is saved only when the user says so.
 */
import type { RegionRecord } from './regionCatalog.js';

export interface UserAlias {
  short: string;
  long: string;
}

const MAX_SHORT = 12;
const MIN_LONG = 2;
const MAX_LONG = 40;

/** `CBM=容積重量` (or `CBM＝容積重量`) entries -> pairs. Malformed entries are ignored. */
export function parseAliasSetting(entries: readonly unknown[] | undefined): UserAlias[] {
  const pairs: UserAlias[] = [];
  const seen = new Set<string>();
  for (const entry of entries ?? []) {
    if (typeof entry !== 'string') continue;
    const at = entry.search(/[=＝]/u);
    if (at < 0) continue;
    const short = entry.slice(0, at).trim();
    const long = entry.slice(at + 1).trim();
    if (short === '' || short.length > MAX_SHORT || long.length < MIN_LONG || long.length > MAX_LONG) continue;
    const key = `${short.normalize('NFKC').toLowerCase()}\u0000${long.normalize('NFKC').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ short, long });
  }
  return pairs;
}

export function formatAlias(alias: UserAlias): string {
  return `${alias.short}=${alias.long}`;
}

const LATIN_TOKEN = /[A-Za-z][A-Za-z0-9/&.\-]{1,9}/gu;
const GENERIC_SHEET = /^(sheet|シート)\s*\d*$/iu;

/**
 * A pair worth offering after the user picked `region` for `request`: the one abbreviation-like word
 * of the request that appears nowhere in the table's names, paired with the table's own name.
 * `undefined` when there is no such single word (nothing is guessed from several).
 */
export function suggestAlias(request: string, region: Pick<RegionRecord, 'bookStem' | 'sheet' | 'title' | 'headers'>): UserAlias | undefined {
  const names = [region.bookStem, region.sheet, region.title ?? '', ...(region.headers ?? [])].join(' ').normalize('NFKC').toLowerCase();
  const unseen = new Set<string>();
  for (const [token] of request.normalize('NFKC').matchAll(LATIN_TOKEN)) {
    if (!names.includes(token.toLowerCase())) unseen.add(token);
  }
  if (unseen.size !== 1) return undefined;
  const [short] = [...unseen];
  const long = (GENERIC_SHEET.test(region.sheet) ? region.title ?? region.sheet : region.sheet).trim();
  if (long.length < MIN_LONG || long.length > MAX_LONG) return undefined;
  return { short, long };
}
