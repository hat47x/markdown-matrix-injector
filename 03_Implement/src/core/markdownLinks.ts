/**
 * Local-link discovery and classification for Markdown artifacts (issue-0196).
 *
 * Used to decide whether a document still depends on files outside the folder
 * it is handed over in. Pure text/filesystem reads; no MMI semantics.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Schemes that never point at a local file. */
const REMOTE = /^(https?|mailto|tel|data|ftp|javascript):/i;
/** `file:`, drive letters, UNC and root-absolute paths all name a place outside the artifact. */
const ABSOLUTE_LOCAL = /^(file:|[A-Za-z]:[\\/]|\\\\|\/)/;

const INLINE_CODE = /(`+)(?:(?!\1).)+?\1/g;

export function stripInlineCode(line: string): string {
  return line.replace(INLINE_CODE, '');
}

/** Fence state for a line-by-line scan: matches by character and length, as CommonMark does. */
export class FenceTracker {
  private fence: { char: string; length: number } | undefined;

  /** True when `line` is inside, or is the delimiter of, a fenced code block. */
  skips(line: string): boolean {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (this.fence) {
      if (marker && marker[1][0] === this.fence.char && marker[1].length >= this.fence.length && marker[2].trim() === '') this.fence = undefined;
      return true;
    }
    if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) {
      this.fence = { char: marker[1][0], length: marker[1].length };
      return true;
    }
    return false;
  }
}

/** Link destinations on one line: inline `](dest)`, reference definitions, autolinks and HTML attributes. */
export function linkTargets(line: string): string[] {
  const text = stripInlineCode(line);
  const targets: string[] = [];

  for (let at = text.indexOf(']('); at >= 0; at = text.indexOf('](', at + 2)) {
    let i = at + 2;
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    let dest = '';
    if (text[i] === '<') {
      const end = text.indexOf('>', i);
      if (end < 0) continue;
      dest = text.slice(i + 1, end);
    } else {
      let depth = 0;
      for (; i < text.length; i += 1) {
        const c = text[i];
        if (c === '\\') { dest += text[i + 1] ?? ''; i += 1; continue; }
        if (c === '(') depth += 1;
        else if (c === ')') { if (depth === 0) break; depth -= 1; }
        else if (c === ' ' || c === '\t') break;
        dest += c;
      }
    }
    targets.push(dest);
  }

  const definition = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(text);
  if (definition) targets.push(definition[1].replace(/^<|>$/g, ''));
  for (const match of text.matchAll(/<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi)) targets.push(match[1]);
  for (const match of text.matchAll(/\b(src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const value = match[2] ?? match[3] ?? '';
    if (match[1].toLowerCase() === 'srcset') targets.push(...value.split(',').map((part) => part.trim().split(/\s+/)[0]));
    else targets.push(value);
  }
  return targets.filter((target) => target !== '');
}

/** Whether `target` is `root` or inside it. A file name that merely starts with `..` is not an escape. */
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

export interface LocalLink {
  absolutePath: string;
  outsideRoot: boolean;
}

/**
 * Resolve a link destination written in `markdownFilePath`.
 * Returns undefined for remote links and in-page anchors. Symlinks are followed,
 * so a link that leaves the folder through one counts as outside.
 */
export function resolveLocalLink(markdownFilePath: string, workspaceRoot: string, rawTarget: string): LocalLink | undefined {
  if (!rawTarget || rawTarget.startsWith('#') || REMOTE.test(rawTarget)) return undefined;
  if (ABSOLUTE_LOCAL.test(rawTarget)) return { absolutePath: rawTarget, outsideRoot: true };
  let decoded = rawTarget.split(/[?#]/)[0];
  try { decoded = decodeURI(decoded); } catch { /* keep the literal path; it fails visibly if absent */ }
  const absolutePath = path.resolve(path.dirname(markdownFilePath), decoded);
  const root = path.resolve(workspaceRoot);
  let realRoot = root;
  try { realRoot = fs.realpathSync(root); } catch { /* missing root: lexical check only */ }
  let outsideRoot = !isInside(root, absolutePath) && !isInside(realRoot, absolutePath);
  if (!outsideRoot && fs.existsSync(absolutePath)) outsideRoot = !isInside(realRoot, fs.realpathSync(absolutePath));
  return { absolutePath, outsideRoot };
}
