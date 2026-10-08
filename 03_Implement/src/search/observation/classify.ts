import type { Candidate, CompileResult } from '../nlQuery/compiler.js';
import { isDescriptionQuestion } from '../nlQuery/paraphrase.js';
import type { SearchObservationFinal } from './types.js';

const LATIN_WORD = /[A-Za-z][A-Za-z0-9/&.\-]*/gu;
const WORD = /[\p{L}\p{N}]+/gu;

export function classifySearchObservation(
  query: string,
  result: CompileResult,
  includeText = false,
): SearchObservationFinal {
  const text = query.trim();
  const question = isDescriptionQuestion(text) || /[?？]\s*$/u.test(text);
  const latin = [...text.matchAll(LATIN_WORD)].map(([word]) =>
    word.normalize('NFKC').toLowerCase());
  const tokens = [...text.normalize('NFKC').matchAll(WORD)].length;

  let klass: SearchObservationFinal['class'];
  if (result.status === 'candidates') {
    klass = 'found';
  } else if (result.status === 'unsupported') {
    klass = 'unsupported-op';
  } else if (result.status === 'no-match') {
    const near = result.nearMisses ?? [];
    if (near.some((candidate) => notationLike(text, candidate))) {
      klass = 'notation';
    } else if (singleUnseenLatinWord(latin, near)) {
      klass = 'abbreviation';
    } else if (
      question
      || near.some((candidate) => candidate.basis === 'paraphrase')
      || near.some((candidate) => candidate.columns.length >= 2)
    ) {
      klass = 'description';
    } else if (near.length === 0) {
      klass = 'no-such-table';
    } else {
      klass = 'other';
    }
  } else {
    klass = 'other';
  }

  return {
    status: result.status,
    class: klass,
    tokens,
    latinWords: latin.length,
    question,
    ...(includeText ? { text } : {}),
  };
}

function candidateNames(candidate: Candidate): string[] {
  return [
    candidate.region.bookStem,
    candidate.region.sheet,
    candidate.region.title ?? '',
  ].filter(Boolean);
}

function singleUnseenLatinWord(
  latinWords: readonly string[],
  candidates: readonly Candidate[],
): boolean {
  const names = candidates
    .flatMap(candidateNames)
    .join(' ')
    .normalize('NFKC')
    .toLowerCase();
  const unseen = [...new Set(latinWords.filter((word) => !names.includes(word)))];
  return unseen.length === 1;
}

function notationLike(query: string, candidate: Candidate): boolean {
  const requestNames = extractNameRuns(query);
  if (requestNames.length === 0) return false;
  return candidateNames(candidate).some((name) => {
    const indexed = notationForm(name);
    return requestNames.some((request) => {
      const typed = notationForm(request);
      if (typed === indexed) return true;
      if (typed.length < 4 || indexed.length < 4) return false;
      if (stripLongVowel(typed) === stripLongVowel(indexed)) return true;
      if (stripTrailingOkurigana(typed) === stripTrailingOkurigana(indexed)) return true;
      return levenshteinAtMostOne(typed, indexed);
    });
  });
}

function extractNameRuns(query: string): string[] {
  return [...query.normalize('NFKC').matchAll(/[\p{Script=Han}ァ-ヶーA-Za-z0-9]{3,}/gu)]
    .map(([value]) => value)
    .filter((value) => !/^(見せて|教えて|ください|どこ|どれ|どんな|について)$/u.test(value));
}

function notationForm(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.(xlsx|xlsm|xls|csv|xml)$/u, '')
    .replace(/[\s_・.,，。()（）【】「」『』]/gu, '');
}

function stripLongVowel(value: string): string {
  return value.replace(/ー/gu, '');
}

function stripTrailingOkurigana(value: string): string {
  return value.replace(/[ぁ-ゖ]{1,2}$/u, '');
}

function levenshteinAtMostOne(left: string, right: string): boolean {
  const a = [...left];
  const b = [...right];
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let differences = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i] && ++differences > 1) return false;
    }
    return differences === 1;
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
    } else if (!skipped) {
      skipped = true;
      j += 1;
    } else {
      return false;
    }
  }
  return true;
}
