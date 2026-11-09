/**
 * Detects CSS that would send a PDF generator to the network: an @import, or a url() / image-set() / image()
 * string that names an external scheme or a protocol-relative address. It is used for customer style sheets
 * and for the style parts of a cover template (#792).
 *
 * The text is normalised the way a CSS parser reads it before it is looked at: comments are removed and
 * escapes are decoded. A plain pattern on the raw text misses `@\69mport`, `\75rl(`, `url(\68ttp://...)` and
 * `u/**\/rl(`. Removing a comment joins the two sides, which is stricter than a parser (it reads `u/**\/rl(`
 * as two tokens); a false refusal is the safe side here.
 *
 * Not covered: a reference the CSS cannot express as text (for example one built by the generator's own
 * resource loading), and `file:`-style local paths, which stay governed by the workspace-root rule.
 */

/** Schemes that carry their content inline and fetch nothing. */
const INLINE = '(?!image\\/|font\\/|application\\/font)';
const EXTERNAL_TARGET = `(?:[a-z][a-z0-9+.-]*:${INLINE}|\\/\\/)`;
const EXTERNAL_URL = new RegExp(`url\\(\\s*['"]?\\s*${EXTERNAL_TARGET}`, 'iu');
const EXTERNAL_STRING = new RegExp(`['"]\\s*${EXTERNAL_TARGET}`, 'iu');

/** Removes comments (an unterminated one runs to the end, as in CSS) and keeps string contents intact. */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  let quote: string | undefined;
  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = undefined;
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    out += ch;
    i += 1;
  }
  return out;
}

/** Decodes CSS escapes: `\` + 1-6 hex digits (+ one optional white space), or `\` + any other character. */
function decodeEscapes(text: string): string {
  return text.replace(/\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f]))/gu, (_match, hex: string | undefined, other: string | undefined) => {
    if (hex !== undefined) {
      const code = Number.parseInt(hex, 16);
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '�' : String.fromCodePoint(code);
    }
    return other ?? '';
  });
}

/** The normal form the checks run on: no comments, no escapes. */
export function normaliseCss(text: string): string {
  return decodeEscapes(stripComments(text));
}

export function hasExternalCssReference(text: string): boolean {
  const css = normaliseCss(text);
  if (/@import\b/i.test(css) || EXTERNAL_URL.test(css)) return true;
  // image-set("a.png" 1x, "http://...") and image("...") take a string, not a url().
  for (const call of css.matchAll(/(?:-webkit-)?(?:image-set|image)\(([^)]*)\)/giu)) {
    if (EXTERNAL_STRING.test(call[1])) return true;
  }
  return false;
}
