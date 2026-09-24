/**
 * Character features shared by every retrieval method in issue-0115
 * (input-assistance-cpu-search.md §3.2 / §4.1: "同じ特徴・同じデータ・同じ候補数で
 * 比較する"). Region documents and queries are mapped into the same
 * role-agnostic feature space; roles (title / header / sheet / ...) only
 * change a feature's *weight*, BM25F-style, so a query term can match a
 * title or a header without the query having to know which one it is.
 *
 * No neural embedding, morphological analyser, or external dictionary: only
 * Unicode normalization, character n-grams and whole-word features.
 */

export type FeatureRole = 'book' | 'sheet' | 'title' | 'header' | 'value' | 'query';

export const DEFAULT_ROLE_WEIGHTS: Readonly<Record<FeatureRole, number>> = {
  title: 3,
  header: 2,
  sheet: 2,
  book: 1.5,
  value: 0.5,
  query: 1,
};

const SEPARATORS = /[\s　「」『』【】〔〕（）()［］[\]{}｛｝<>＜＞、。，．,.!！?？:：;；'"“”‘’`・\-_/\\|~〜～=+*#&@%^$]+/u;
const ASCII_OR_DIGIT = /[a-z0-9]+/g;

/**
 * NFKC (full-width ASCII -> half-width, half-width katakana -> full-width),
 * lower-case, hiragana folded onto katakana so 「けんさく」 and 「ケンサク」 share
 * features. Deterministic and locale-independent.
 */
export function normalizeText(value: string): string {
  const nfkc = value.normalize('NFKC').toLowerCase();
  let folded = '';
  for (const ch of nfkc) {
    const code = ch.codePointAt(0) ?? 0;
    folded += code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
  }
  return folded.trim();
}

/** Splits normalized text into separator-free segments. */
export function segments(value: string): string[] {
  return normalizeText(value).split(SEPARATORS).filter((segment) => segment.length > 0);
}

/**
 * Feature strings for one piece of text: whole-segment words (`w:`), ASCII
 * words (`w:`) with trigrams for identifiers of length >= 4 (`a3:`), and
 * non-ASCII character bigrams (`c2:`) -- or the single character (`c1:`)
 * for a one-character run. The same function is used for region text and for
 * queries, which is the whole point.
 */
export function textFeatureList(value: string): string[] {
  const features: string[] = [];
  for (const segment of segments(value)) {
    if (segment.length <= 24) {
      features.push(`w:${segment}`);
    }
    for (const run of splitRuns(segment)) {
      if (run.ascii) {
        if (run.text !== segment) features.push(`w:${run.text}`);
        if (run.text.length >= 4) {
          for (let i = 0; i + 3 <= run.text.length; i += 1) features.push(`a3:${run.text.slice(i, i + 3)}`);
        }
        continue;
      }
      const chars = [...run.text];
      if (chars.length === 1) {
        features.push(`c1:${chars[0]}`);
        continue;
      }
      if (run.text !== segment && chars.length <= 24) features.push(`w:${run.text}`);
      for (let i = 0; i + 2 <= chars.length; i += 1) features.push(`c2:${chars[i]}${chars[i + 1]}`);
    }
  }
  return features;
}

interface Run {
  text: string;
  ascii: boolean;
}

function splitRuns(segment: string): Run[] {
  const runs: Run[] = [];
  let cursor = 0;
  for (const match of segment.matchAll(ASCII_OR_DIGIT)) {
    const start = match.index ?? 0;
    if (start > cursor) runs.push({ text: segment.slice(cursor, start), ascii: false });
    runs.push({ text: match[0], ascii: true });
    cursor = start + match[0].length;
  }
  if (cursor < segment.length) runs.push({ text: segment.slice(cursor), ascii: false });
  return runs;
}

/** A weighted bag of features. */
export type FeatureBag = Map<string, number>;

/**
 * Adds `value`'s features to `bag`, each weighted by `weight`. Repeated
 * features inside one text are counted once per call so a long value list
 * cannot swamp a short title.
 */
export function addTextFeatures(bag: FeatureBag, value: string, weight: number): void {
  for (const feature of new Set(textFeatureList(value))) {
    bag.set(feature, (bag.get(feature) ?? 0) + weight);
  }
}

/**
 * Dice coefficient over character bigrams of normalized text: a cheap, bounded
 * fuzzy score for resolving a column name the user typed against a header
 * ("操作" vs "操作内容", "ｽﾃｰﾀｽ" vs "ステータス"). Used only to *resolve* a
 * name inside an already-chosen region, never to rank regions.
 */
export function bigramDice(left: string, right: string): number {
  const a = bigrams(normalizeText(left).replace(/\s+/gu, ''));
  const b = bigrams(normalizeText(right).replace(/\s+/gu, ''));
  if (a.length === 0 && b.length === 0) return normalizeText(left) === normalizeText(right) ? 1 : 0;
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const gram of a) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of b) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      counts.set(gram, remaining - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function bigrams(value: string): string[] {
  const chars = [...value];
  if (chars.length === 1) return [chars[0]];
  const out: string[] = [];
  for (let i = 0; i + 2 <= chars.length; i += 1) out.push(chars[i] + chars[i + 1]);
  return out;
}
