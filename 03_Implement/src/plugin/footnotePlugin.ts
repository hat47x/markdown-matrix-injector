/**
 * Footnotes for the delivery export: `text[^1]` and `[^1]: note`.
 *
 * Each reference becomes `<span class="mmi-footnote">note</span>`. The export CSS sets `float: footnote` on it, so a
 * generator that implements CSS footnotes (WeasyPrint) puts the note at the foot of the page that holds the
 * reference, numbered automatically, and a browser shows the note in brackets right in the text.
 *
 * markdown-it reads `[^1]: note` as a link definition on its own, so without this rule the note text vanished. Rules:
 *  - a reference counts only when a definition with that label exists, so `[^0-9]` in a sentence stays text;
 *  - a note is one paragraph; continuation lines are indented by two or more spaces;
 *  - every definition is used by exactly one reference, otherwise the export stops: an unused note would be lost and
 *    a note used twice would print twice under two numbers.
 */
import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

export class FootnoteError extends Error {}

interface FootnoteEnv {
  footnoteDefs?: Map<string, string>;
  footnoteLines?: Map<string, number>;
}

const DEFINITION = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/u;

export function footnotePlugin(md: MarkdownIt): void {
  md.block.ruler.before('reference', 'mmi_footnote_def', (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const first = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
    const match = DEFINITION.exec(first);
    if (!match) return false;
    if (silent) return true;
    const parts = [match[2]];
    let next = startLine + 1;
    while (next < endLine && !state.isEmpty(next) && state.sCount[next] - state.blkIndent >= 2) {
      parts.push(state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]));
      next += 1;
    }
    const env = state.env as FootnoteEnv;
    env.footnoteDefs ??= new Map();
    env.footnoteLines ??= new Map();
    if (env.footnoteDefs.has(match[1])) throw new FootnoteError(`footnote [^${match[1]}] is defined twice (line ${startLine + 1})`);
    env.footnoteDefs.set(match[1], parts.join(' ').trim());
    env.footnoteLines.set(match[1], startLine + 1);
    state.line = next;
    return true;
  });

  md.inline.ruler.before('link', 'mmi_footnote_ref', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b || state.src.charCodeAt(state.pos + 1) !== 0x5e) return false;
    const end = state.src.indexOf(']', state.pos + 2);
    if (end < 0) return false;
    const label = state.src.slice(state.pos + 2, end);
    if (!label || /\s/u.test(label)) return false;
    if (!(state.env as FootnoteEnv).footnoteDefs?.has(label)) return false;
    if (!silent) state.push('mmi_footnote_ref', '', 0).meta = { label };
    state.pos = end + 1;
    return true;
  });

  // Once the inline tokens exist: every definition has exactly one reference.
  md.core.ruler.push('mmi_footnote_check', (state) => {
    const env = state.env as FootnoteEnv;
    const defs = env.footnoteDefs;
    if (!defs || defs.size === 0) return;
    const seen = new Set<string>();
    for (const token of state.tokens) {
      for (const child of token.children ?? []) {
        if (child.type !== 'mmi_footnote_ref') continue;
        const label = (child.meta as { label: string }).label;
        if (seen.has(label)) throw new FootnoteError(`footnote [^${label}] is referenced more than once; write the note again under its own label`);
        seen.add(label);
      }
    }
    for (const label of defs.keys()) {
      if (!seen.has(label)) throw new FootnoteError(`footnote [^${label}] (line ${env.footnoteLines?.get(label)}) has no reference in the text, so its note would be lost`);
    }
  });

  md.renderer.rules.mmi_footnote_ref = (tokens, index, _options, env: FootnoteEnv) => {
    const label = (tokens[index].meta as { label: string }).label;
    return `<span class="mmi-footnote">${md.renderInline(env.footnoteDefs?.get(label) ?? '', {})}</span>`;
  };
}

/** Page-bottom notes for CSS Paged Media; the fallback keeps the note readable where footnotes are not implemented. */
export const FOOTNOTE_CSS = `
  .mmi-footnote { float: footnote; font-size: 8.5pt; line-height: 1.5; }
  ::footnote-call { content: counter(footnote); font-size: 0.75em; vertical-align: super; line-height: 0; }
  ::footnote-marker { content: counter(footnote) ") "; }
  @page { @footnote { border-top: 0.5pt solid #808080; padding-top: 3pt; margin-top: 6pt; } }
  @media screen { .mmi-footnote { float: none; color: #444; } .mmi-footnote::before { content: "（注: "; } .mmi-footnote::after { content: "）"; } }`;
