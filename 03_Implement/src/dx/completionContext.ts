/**
 * Cursor-span analysis for completion inside an unfinished MMI embed
 * (issue-0110 criterion 1). Given the whole document and the cursor offset,
 * it decides whether completion applies at all and, if so, exactly which span
 * a chosen candidate replaces -- the token under the cursor only, so the
 * rest of the notation and the surrounding prose survive.
 *
 * Never offers anything inside fenced or inline code, or outside an embed
 * that is still open at the cursor (a closed `![[...]]` earlier on the line
 * does not count).
 */

export type CompletionStage = 'filepath' | 'sheet' | 'range' | 'param-key' | 'param-value';

export interface CompletionContext {
  stage: CompletionStage;
  /** Document offsets of the token to replace (end is past the cursor when the token continues). */
  replaceStart: number;
  replaceEnd: number;
  /** Text of the token before the cursor, used for filtering. */
  typed: string;
  filepath: string;
  sheet?: string;
  range?: string;
  /** For param-value: the key being filled. */
  paramKey?: string;
  /** Keys already present elsewhere in the query (for de-duplication). */
  usedParams: string[];
}

const EMBED_OPEN = '![[';

export function analyzeCompletionContext(text: string, offset: number): CompletionContext | undefined {
  if (offset < 0 || offset > text.length) return undefined;
  if (insideCode(text, offset)) return undefined;

  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const open = text.lastIndexOf(EMBED_OPEN, offset - 1);
  if (open < lineStart || open + EMBED_OPEN.length > offset) return undefined;
  const bodyStart = open + EMBED_OPEN.length;
  const before = text.slice(bodyStart, offset);
  if (before.includes(']]')) return undefined; // closed before the cursor

  // The rest of the embed on this line, up to its closing ]] (if any).
  const lineEnd = text.indexOf('\n', offset) === -1 ? text.length : text.indexOf('\n', offset);
  const closeAt = text.indexOf(']]', offset);
  const bodyEnd = closeAt !== -1 && closeAt <= lineEnd ? closeAt : lineEnd;
  const body = text.slice(bodyStart, bodyEnd);
  const cursor = offset - bodyStart;

  const pipe = body.indexOf('|');
  const hash = body.indexOf('#');
  const pathEnd = firstOf(body, ['#', '|', '?'], 0);
  const queryAt = body.indexOf('?', pipe >= 0 ? pipe : 0);
  const filepath = body.slice(0, pathEnd === -1 ? body.length : pathEnd).trim();
  const sheet =
    hash >= 0 && hash < (pipe >= 0 ? pipe : body.length) && (queryAt < 0 || hash < queryAt)
      ? body.slice(hash + 1, firstOf(body, ['|', '?'], hash + 1) === -1 ? body.length : firstOf(body, ['|', '?'], hash + 1)).trim()
      : undefined;
  const range =
    pipe >= 0 ? body.slice(pipe + 1, queryAt > pipe ? queryAt : body.length).trim() || undefined : undefined;
  const usedParams = queryAt >= 0 ? paramKeys(body.slice(queryAt + 1)) : [];

  const token = (start: number, stops: string[]): Pick<CompletionContext, 'replaceStart' | 'replaceEnd' | 'typed'> => {
    const end = firstOf(body, stops, cursor);
    return {
      replaceStart: bodyStart + start,
      replaceEnd: bodyStart + (end === -1 ? body.length : end),
      typed: body.slice(start, cursor),
    };
  };

  if (queryAt >= 0 && cursor > queryAt) {
    const segStart = Math.max(body.lastIndexOf('&', cursor - 1), queryAt) + 1;
    const segment = body.slice(segStart, cursor);
    const eq = segment.indexOf('=');
    const own = eq >= 0 ? segment.slice(0, eq) : segment;
    const others = removeOnce(usedParams, own);
    if (eq >= 0) {
      return { stage: 'param-value', ...token(segStart + eq + 1, ['&']), filepath, sheet, range, paramKey: own, usedParams: others };
    }
    return { stage: 'param-key', ...token(segStart, ['&', '=']), filepath, sheet, range, usedParams: others };
  }
  if (pipe >= 0 && cursor > pipe) {
    return { stage: 'range', ...token(pipe + 1, ['?']), filepath, sheet, range, usedParams };
  }
  if (hash >= 0 && cursor > hash) {
    return { stage: 'sheet', ...token(hash + 1, ['|', '?']), filepath, sheet, range, usedParams };
  }
  return { stage: 'filepath', ...token(0, ['#', '|', '?']), filepath, sheet, range, usedParams };
}

function firstOf(text: string, needles: string[], from: number): number {
  let best = -1;
  for (const needle of needles) {
    const at = text.indexOf(needle, from);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

function paramKeys(query: string): string[] {
  return query
    .split('&')
    .map((segment) => segment.split('=', 1)[0] ?? '')
    .filter((key) => key.length > 0);
}

function removeOnce(list: string[], value: string): string[] {
  const at = list.indexOf(value);
  return at < 0 ? list : [...list.slice(0, at), ...list.slice(at + 1)];
}

/** Inside a fenced block (``` or ~~~) or an inline code span on the cursor's line. */
function insideCode(text: string, offset: number): boolean {
  const currentLineStart = text.lastIndexOf('\n', offset - 1) + 1;
  let fence: string | undefined;
  for (const line of text.slice(0, currentLineStart).split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (!marker) continue;
    if (!fence) fence = marker[0];
    else if (marker[0] === fence) fence = undefined;
  }
  if (fence) return true;
  const ticks = (text.slice(currentLineStart, offset).match(/`/gu) ?? []).length;
  return ticks % 2 === 1;
}
