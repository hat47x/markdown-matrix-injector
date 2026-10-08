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
const LATIN_WORD = /[A-Za-z][A-Za-z0-9/&.-]{1,9}/gu;
const SEPARATORS = /[\s・\-_ー/()（）]/gu;

const strip = (value: string): string => normalizeText(value).replace(SEPARATORS, '');

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
  const latin = [...new Set(input.normalize('NFKC').match(LATIN_WORD) ?? [])];
  const question = isDescriptionQuestion(input);
  const base = { tokens, latinWords: latin.length, question };

  const viaStructure = result.candidates.some((candidate) => candidate.basis === 'paraphrase' || candidate.basis === 'semantic');
  if (viaStructure) return { ...base, class: 'description' };
  if (result.candidates.length > 0) return { ...base, class: 'found' };
  if (result.status === 'unsupported') return { ...base, class: 'unsupported-op' };
  if (result.status === 'needs-more-input') return { ...base, class: 'other' };

  const near = result.nearMisses ?? [];
  const hints = [result.ir.source, result.ir.sheet, result.ir.table, ...result.ir.target]
    .filter((hint) => hint !== undefined)
    .map((hint) => strip(hint.text))
    .filter((hint) => hint !== '');
  if (near.some((candidate) => regionNames(candidate.region).some((name) => hints.some((hint) => withinOneEdit(hint, name))))) {
    return { ...base, class: 'notation' };
  }

  const candidates = [...near.map((candidate) => candidate.region)];
  const known = candidates.map((region) => [region.bookStem, region.sheet, region.title ?? '', ...(region.headers ?? [])].join(' ').normalize('NFKC').toLowerCase());
  const unseen = latin.filter((word) => !known.some((names) => names.includes(word.toLowerCase())));
  if (unseen.length === 1) return { ...base, class: 'abbreviation' };

  if (question) return { ...base, class: 'description' };
  if (result.status === 'no-match') return { ...base, class: 'no-such-table' };
  return { ...base, class: 'other' };
}
