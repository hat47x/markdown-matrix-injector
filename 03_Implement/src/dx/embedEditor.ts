/**
 * Structured, loss-free editing of one existing `![[...]]` embed
 * (issue-0111 criterion 2). The embed is split into its parts, and each query
 * segment keeps its original text. Changing one key rewrites only that
 * segment; unknown keys (`x-*`, future keys), repeated keys (`formatColumn`)
 * and the original spelling/encoding of every untouched segment survive, so
 * a round trip without changes reproduces the input byte for byte.
 */

export interface EmbedParts {
  filepath: string;
  sheet?: string;
  range?: string;
  /** Raw `key=value` segments in their original order and spelling. */
  segments: string[];
}

export function parseEmbedParts(raw: string): EmbedParts | undefined {
  const match = /^!\[\[(?<body>[^\]]*)\]\]$/u.exec(raw.trim());
  if (!match?.groups) return undefined;
  const body = match.groups.body;
  const pipe = body.indexOf('|');
  const head = pipe >= 0 ? body.slice(0, pipe) : body;
  const tail = pipe >= 0 ? body.slice(pipe + 1) : undefined;
  let query: string | undefined;
  let headPath = head;
  let range: string | undefined;
  if (tail !== undefined) {
    const q = tail.indexOf('?');
    range = (q >= 0 ? tail.slice(0, q) : tail) || undefined;
    query = q >= 0 ? tail.slice(q + 1) : undefined;
  } else {
    const q = head.indexOf('?');
    if (q >= 0) {
      headPath = head.slice(0, q);
      query = head.slice(q + 1);
    }
  }
  const hash = headPath.indexOf('#');
  const filepath = (hash >= 0 ? headPath.slice(0, hash) : headPath).trim();
  if (!filepath) return undefined;
  return {
    filepath,
    sheet: hash >= 0 ? headPath.slice(hash + 1) || undefined : undefined,
    range,
    segments: query ? query.split('&').filter((segment) => segment.length > 0) : [],
  };
}

export function serializeEmbedParts(parts: EmbedParts): string {
  const head = `${parts.filepath}${parts.sheet !== undefined ? `#${parts.sheet}` : ''}`;
  const query = parts.segments.length > 0 ? `?${parts.segments.join('&')}` : '';
  return parts.range !== undefined ? `![[${head}|${parts.range}${query}]]` : `![[${head}${query}]]`;
}

const keyOf = (segment: string): string => decodeSafe(segment.split('=', 1)[0] ?? '');

/** Values of `key`, decoded like the renderer does (URLSearchParams). */
export function getParams(parts: EmbedParts, key: string): string[] {
  return new URLSearchParams(parts.segments.join('&')).getAll(key);
}

/**
 * Sets a single-valued key: the first occurrence is rewritten in place,
 * later duplicates of the same key are removed (a single-valued key given
 * twice is ambiguous), and `undefined` removes the key. Other keys are not
 * touched. Repeatable keys use `setRepeatedParam`.
 */
export function setParam(parts: EmbedParts, key: string, value: string | undefined): EmbedParts {
  const segments: string[] = [];
  let written = false;
  for (const segment of parts.segments) {
    if (keyOf(segment) !== key) {
      segments.push(segment);
      continue;
    }
    if (!written && value !== undefined) segments.push(encodeSegment(key, value));
    written = true;
  }
  if (!written && value !== undefined) segments.push(encodeSegment(key, value));
  return { ...parts, segments };
}

/** Replaces all values of a repeatable key, keeping the position of its first occurrence. */
export function setRepeatedParam(parts: EmbedParts, key: string, values: readonly string[]): EmbedParts {
  const firstAt = parts.segments.findIndex((segment) => keyOf(segment) === key);
  const others = parts.segments.filter((segment) => keyOf(segment) !== key);
  const replacement = values.map((value) => encodeSegment(key, value));
  const at = firstAt < 0 ? others.length : parts.segments.slice(0, firstAt).filter((segment) => keyOf(segment) !== key).length;
  return { ...parts, segments: [...others.slice(0, at), ...replacement, ...others.slice(at)] };
}

/**
 * Minimal escaping: only characters that would change the meaning of the
 * notation or of URLSearchParams are percent-encoded, so Japanese values stay
 * readable (`grep=要確認`, not `grep=%E8%A6%81...`).
 */
export function encodeSegment(key: string, value: string): string {
  const escape = (text: string): string => text.replace(/[%&+=#|[\]?\s]/gu, (ch) => encodeURIComponent(ch));
  return `${escape(key)}=${escape(value)}`;
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/gu, ' '));
  } catch {
    return text;
  }
}
