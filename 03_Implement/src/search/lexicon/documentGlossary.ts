/**
 * Abbreviation pairs taken from the user's own workbooks (ADR-0023, layer 2).
 *
 * People write the pairing down themselves: 「ネットワーク（N/W）」 in an
 * overview table, or a 用語集 / 略語一覧 sheet with 略称 and 正式名称 columns.
 * Reading those pairs adapts the search to the company's vocabulary with no
 * lexicon to maintain. It is a deterministic lookup (method class M0); a pair
 * only widens retrieval, is shown with where it was found, and is never
 * confirmed on its own.
 *
 * Two sources, both bounded:
 *   - parenthetical: `正式名称（ABC）` or `ABC（正式名称）` in a sheet name, title,
 *     header, or sampled value;
 *   - glossary table: a detected table whose headers name a short-form column
 *     (略称・略語・Abbr ...) and a long-form column (正式名称・名称 ...).
 *
 * Nothing here writes to disk; pairs live in the region catalog and disappear
 * with it (design §2.1).
 */
import type { SheetSource } from '../../core/sheetSource.js';
import type { DetectedRegion } from '../regionDetector.js';

export interface GlossaryPair {
  /** The abbreviation as written. */
  short: string;
  /** The formal name as written. */
  long: string;
  kind: 'parenthetical' | 'glossary-table' | 'user-alias';
  /** Where it was written, for display: `book / sheet`. */
  origin: string;
}

const MAX_GLOSSARY_ROWS = 5000;
const MAX_PAIRS_PER_BOOK = 500;

const LATIN_SHORT = '[A-Za-z][A-Za-z0-9/&.\\-]{1,9}';
// Kanji, katakana (with the long-vowel mark) and digits. Hiragana is left out so a particle ends the name:
// 「システムのキャパシティ計画（CAP）」 gives キャパシティ計画.
const NAME_CHARS = '\\p{Script=Han}\\p{Script=Katakana}ー0-9';
const LONG_THEN_SHORT = new RegExp(`([${NAME_CHARS}]{2,20})\\s?[(]\\s?(${LATIN_SHORT})\\s?[)]`, 'gu');
const SHORT_THEN_LONG = new RegExp(`(?<![A-Za-z0-9/&.\\-])(${LATIN_SHORT})\\s?[(]\\s?([${NAME_CHARS}]{2,20})\\s?[)]`, 'gu');

const SHORT_HEADER = /略称|略語|略号|略記|頭字語|abbr|acronym|short/iu;
const LONG_HEADER = /正式名称|正式|フルスペル|full|原語|元の言葉|名称|用語/iu;

const key = (value: string): string => value.normalize('NFKC').toLowerCase().trim();

/** Pairs written as `正式名称（ABC）` / `ABC（正式名称）` in one piece of text. */
export function pairsInText(text: string, origin: string): GlossaryPair[] {
  const normalized = text.normalize('NFKC');
  const pairs: GlossaryPair[] = [];
  for (const match of normalized.matchAll(LONG_THEN_SHORT)) {
    pairs.push({ short: match[2], long: match[1], kind: 'parenthetical', origin });
  }
  for (const match of normalized.matchAll(SHORT_THEN_LONG)) {
    pairs.push({ short: match[1], long: match[2], kind: 'parenthetical', origin });
  }
  return pairs;
}

/** Pairs from a glossary-shaped table (short-form column + long-form column). */
export function pairsInGlossaryTable(sheet: SheetSource, region: DetectedRegion, origin: string): GlossaryPair[] {
  const headers = region.headers;
  if (!headers) return [];
  const shortIndex = headers.findIndex((header) => SHORT_HEADER.test(header));
  const longIndex = headers.findIndex((header, index) => index !== shortIndex && LONG_HEADER.test(header));
  if (shortIndex < 0 || longIndex < 0) return [];
  const column = (index: number): number => region.columnAnchors?.[index] ?? region.range.startCol + index;
  const pairs: GlossaryPair[] = [];
  const last = Math.min(region.range.endRow, region.range.startRow + MAX_GLOSSARY_ROWS);
  for (let row = region.range.startRow + 1; row <= last; row += 1) {
    const short = sheet.cellAt(row, column(shortIndex))?.text?.trim() ?? '';
    const long = sheet.cellAt(row, column(longIndex))?.text?.trim() ?? '';
    if (short === '' || long === '' || short.length > 12 || long.length < 2 || long.length > 40) continue;
    if (key(short) === key(long)) continue;
    pairs.push({ short, long, kind: 'glossary-table', origin });
  }
  return pairs;
}

/** All pairs one workbook writes down, deduplicated, at most {@link MAX_PAIRS_PER_BOOK}. */
export function mineWorkbookGlossary(
  bookLabel: string,
  sheets: Readonly<Record<string, SheetSource>>,
  regions: readonly DetectedRegion[],
): GlossaryPair[] {
  const seen = new Set<string>();
  const out: GlossaryPair[] = [];
  const add = (pairs: readonly GlossaryPair[]): void => {
    for (const pair of pairs) {
      const id = `${key(pair.short)}\u0000${key(pair.long)}`;
      if (seen.has(id) || out.length >= MAX_PAIRS_PER_BOOK) continue;
      seen.add(id);
      out.push(pair);
    }
  };
  for (const sheetName of Object.keys(sheets)) add(pairsInText(sheetName, `${bookLabel} / ${sheetName}`));
  for (const region of regions) {
    const origin = `${bookLabel} / ${region.sheet}`;
    if (region.title) add(pairsInText(region.title, origin));
    for (const header of region.headers ?? []) add(pairsInText(header, origin));
    for (const value of region.valueSample) add(pairsInText(value, origin));
    const sheet = sheets[region.sheet];
    if (sheet) add(pairsInGlossaryTable(sheet, region, origin));
  }
  return out;
}
