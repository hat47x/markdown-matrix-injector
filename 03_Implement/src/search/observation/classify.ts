/**
 * Classifies the last search of a session (design §4). Rules only: no model reads the request, and
 * the class is an estimate of *why nothing matched*, not a statement of intent. The rules and their
 * thresholds live here; changing one means bumping OBSERVATION_SCHEMA.
 */
import type { CompileResult } from '../nlQuery/compiler.js';
import { isDescriptionQuestion } from '../nlQuery/paraphrase.js';
import type { RegionRecord } from '../regionCatalog.js';
import { normalizeText } from '../textFeatures.js';
import type { RequestClass } from './types.js';

export interface Classification {
  class: RequestClass;
  tokens: number;
  latinWords: number;
  question: boolean;
}

const CONTENT_RUN = /[\p{Script=Han}\p{Script=Katakana}ー\p{Script=Latin}0-9]+/gu;
const LATIN_WORD = /[A-Za-z][A-Za-z0-9/&.-]*/gu;
const FILE_NAME_PATTERN = /[A-Za-z0-9_-]*\.(?:xlsx?|xlsm|xlsb|csv|tsv|xml|json|ya?ml|md|txt)(?![A-Za-z0-9])/giu;
const SEPARATORS = /[\s・\-_ー/()（）]/gu;

const strip = (value: string): string => normalizeText(value).replace(SEPARATORS, '');

/**
 * The Latin words of a text as the person wrote them. A file name (`設計.xlsx`) is not an
 * abbreviation, so its extension is dropped; trailing punctuation is not part of a word.
 */
export function latinWordsOf(text: string): string[] {
  const withoutFileNames = text.normalize('NFKC').replace(FILE_NAME_PATTERN, ' ');
  const words = (withoutFileNames.match(LATIN_WORD) ?? [])
    .map((word) => word.replace(/[./&-]+$/u, ''))
    .filter((word) => word.length >= 2);
  return [...new Set(words)];
}

/** Whole Latin words of a name, lowercased. A word inside a longer word ("if" in "specification") does not count. */
function latinWordSetOf(text: string): Set<string> {
  return new Set(latinWordsOf(text).map((word) => word.toLowerCase()));
}

/** True when `a` and `b` differ by at most one inserted, deleted or replaced character (and are long enough to be words). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i += 1;
  if (short.length === long.length) return short.slice(i + 1) === long.slice(i + 1);
  return short.slice(i) === long.slice(i + 1);
}

function regionNames(region: RegionRecord): string[] {
  return [region.sheet, region.title ?? '', region.bookStem].map(strip).filter((name) => name !== '');
}

export function classifyResult(result: CompileResult): Classification {
  const input = result.ir.input;
  const tokens = (input.normalize('NFKC').match(CONTENT_RUN) ?? []).length;
  const latin = latinWordsOf(input);
  const question = isDescriptionQuestion(input);
  const base = { tokens, latinWords: latin.length, question };
  const near = result.nearMisses ?? [];

  // Structure-only evidence counts as a description whether it was promoted to a candidate or only offered as a near miss.
  const structural = [...result.candidates, ...near].some((candidate) => candidate.basis === 'paraphrase' || candidate.basis === 'semantic');
  if (structural) return { ...base, class: 'description' };
  if (result.candidates.length > 0) return { ...base, class: 'found' };
  if (result.status === 'unsupported') return { ...base, class: 'unsupported-op' };
  if (result.status === 'needs-more-input') return { ...base, class: 'other' };

  const hints = [result.ir.source, result.ir.sheet, result.ir.table, ...result.ir.target]
    .filter((hint) => hint !== undefined)
    .map((hint) => strip(hint.text))
    .filter((hint) => hint !== '');
  if (near.some((candidate) => regionNames(candidate.region).some((name) => hints.some((hint) => withinOneEdit(hint, name))))) {
    return { ...base, class: 'notation' };
  }

  // A word is seen when it is a whole word of a near miss's book, sheet, title or headers.
  const seen = new Set<string>();
  for (const { region } of near) {
    for (const text of [region.bookStem, region.sheet, region.title ?? '', ...(region.headers ?? [])]) {
      for (const word of latinWordSetOf(text)) seen.add(word);
    }
  }
  const unseen = latin.filter((word) => !seen.has(word.toLowerCase()));
  if (unseen.length === 1) return { ...base, class: 'abbreviation' };

  if (question) return { ...base, class: 'description' };
  // Design §4: no-such-table requires that no near candidate appeared at all.
  if (result.status === 'no-match' && near.length === 0) return { ...base, class: 'no-such-table' };
  return { ...base, class: 'other' };
}
