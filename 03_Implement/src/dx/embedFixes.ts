/**
 * Quick-fix candidates for broken embeds (issue-0111 criterion 3).
 *
 * Only targets that exist are offered: sheet names read from the workbook,
 * workbook files found in the workspace. Candidates are ranked by
 * similarity to what was written; if several are equally plausible they are
 * all offered and the user picks one. Each fix replaces only the broken part
 * (the sheet name or the file path) -- never the whole embed, so an embed
 * that could not be parsed is never rewritten wholesale.
 */
import { bigramDice, normalizeText } from '../search/textFeatures.js';

export interface FixCandidate {
  /** Replacement text for the broken span. */
  replacement: string;
  score: number;
}

const MIN_SIMILARITY = 0.4;
const MAX_FIXES = 5;

export function sheetFixCandidates(written: string, existing: readonly string[]): FixCandidate[] {
  return rank(written, existing, (name) => name);
}

/**
 * `files` are workspace-relative suggestions in the same form completion
 * inserts (e.g. `../data/roles.csv`). Similarity is judged on the file name,
 * with a small bonus when the directory part also matches.
 */
export function fileFixCandidates(written: string, files: readonly string[]): FixCandidate[] {
  const base = (value: string): string => value.split(/[\\/]/u).pop() ?? value;
  const dir = (value: string): string => value.slice(0, Math.max(0, value.length - base(value).length));
  return rank(written, files, base, (candidate) => (normalizeText(dir(candidate)) === normalizeText(dir(written)) ? 0.05 : 0));
}

function charDice(left: string, right: string): number {
  const a = [...normalizeText(left)];
  const b = [...normalizeText(right)];
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let overlap = 0;
  for (const ch of b) {
    const left = counts.get(ch) ?? 0;
    if (left > 0) {
      overlap += 1;
      counts.set(ch, left - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function rank(
  written: string,
  candidates: readonly string[],
  view: (candidate: string) => string,
  bonus: (candidate: string) => number = () => 0,
): FixCandidate[] {
  const target = view(written);
  return candidates
    .filter((candidate) => candidate !== written)
    .map((candidate) => {
      const exactFold = normalizeText(view(candidate)) === normalizeText(target);
      // Bigrams punish one wrong character in a short kanji name hard (状態繊維 vs 状態遷移 = 0.33);
      // shared characters, weighted lower, keep such typos fixable.
      const similarity = Math.max(bigramDice(view(candidate), target), 0.8 * charDice(view(candidate), target));
      return { replacement: candidate, score: exactFold ? 1 : similarity + bonus(candidate) };
    })
    .filter((candidate) => candidate.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || a.replacement.localeCompare(b.replacement))
    .slice(0, MAX_FIXES);
}
