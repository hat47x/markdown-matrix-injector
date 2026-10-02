/**
 * `mmi detach-check` (issue-0196, ADR-0019 D3): can this folder stand without
 * the source workbooks and without MMI?
 *
 * It looks only at the expanded documents. It reports what would break if the
 * originals were removed; it never judges whether the text is right
 * (ADR-0019 D12). Read-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LEDGER_FILE, readLedger } from '../core/importLedger.js';
import { MATERIALIZED_MANIFEST, readMaterializedManifest, sha256 } from './materialize.js';

export type DetachCode =
  | 'DETACH_UNEXPANDED_REFERENCE'
  | 'DETACH_UNMATERIALIZED_ATTACHMENT'
  | 'DETACH_BROKEN_LINK'
  | 'DETACH_LINK_OUTSIDE_ROOT'
  | 'DETACH_OUTPUT_MISSING'
  | 'DETACH_OUTPUT_CHANGED'
  | 'DETACH_RECORD_UNREADABLE';

export interface DetachFinding {
  file: string;
  line: number;
  code: DetachCode;
  message: string;
}

/** Schemes that never point at a local file. Everything else that looks absolute is a dependency. */
const REMOTE = /^(https?|mailto|tel|data|ftp|javascript):/i;
const ABSOLUTE_LOCAL = /^(file:|[A-Za-z]:[\\/]|\\\\|\/)/;

function relativeToRoot(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/') || '.';
}

/** Whether `target` is `root` or inside it. A leading `..` in a file name (`..dots.csv`) is not an escape. */
function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** Link destinations on one line: inline `](dest)`, reference definitions, autolinks and HTML attributes. */
export function linkTargets(line: string): string[] {
  const text = line.replace(/(`+)(?:(?!\1).)+?\1/g, '');
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

/** Checks Markdown files (and the ledger and materialization manifests under `root`). */
export function detachCheck(root: string, markdownFiles: readonly string[]): DetachFinding[] {
  const findings: DetachFinding[] = [];
  const absoluteRoot = path.resolve(root);
  const realRoot = fs.realpathSync(absoluteRoot);
  const outside = (resolved: string): boolean => {
    if (!isInside(absoluteRoot, resolved) && !isInside(realRoot, resolved)) return true;
    return fs.existsSync(resolved) && !isInside(realRoot, fs.realpathSync(resolved));
  };

  for (const file of markdownFiles) {
    const absolute = path.resolve(file);
    const label = relativeToRoot(absoluteRoot, absolute);
    let fence: { char: string; length: number } | undefined;
    fs.readFileSync(absolute, 'utf8').split(/\r?\n/).forEach((line, index) => {
      const at = index + 1;
      const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && marker[2].trim() === '') fence = undefined;
        return;
      }
      if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) { fence = { char: marker[1][0], length: marker[1].length }; return; }

      const text = line.replace(/(`+)(?:(?!\1).)+?\1/g, '');
      if (text.includes('![[')) {
        findings.push({ file: label, line: at, code: 'DETACH_UNEXPANDED_REFERENCE', message: 'MMI reference is not expanded; run `mmi render` first.' });
      }
      if (/^\s*(?:>\s*)+別紙\s*[:：]/.test(text) && !/別紙\s*[:：]\s*\[[^\]]+\]\([^)]+\)/.test(text)) {
        findings.push({ file: label, line: at, code: 'DETACH_UNMATERIALIZED_ATTACHMENT', message: 'Attachment exists only in the source workbook; render with --materialize.' });
      }
      for (const target of linkTargets(line)) {
        if (REMOTE.test(target) || target.startsWith('#')) continue;
        if (ABSOLUTE_LOCAL.test(target)) {
          findings.push({ file: label, line: at, code: 'DETACH_LINK_OUTSIDE_ROOT', message: `Link points to an absolute local path: ${target}` });
          continue;
        }
        let decoded = target;
        try { decoded = decodeURI(target); } catch { /* keep raw */ }
        const resolved = path.resolve(path.dirname(absolute), decoded.split(/[?#]/)[0]);
        if (outside(resolved)) {
          findings.push({ file: label, line: at, code: 'DETACH_LINK_OUTSIDE_ROOT', message: `Link points outside the folder: ${target}` });
        } else if (!fs.existsSync(resolved)) {
          findings.push({ file: label, line: at, code: 'DETACH_BROKEN_LINK', message: `Linked file does not exist: ${target}` });
        }
      }
    });
  }

  const record = (file: string, base: string, output: string, what: string, digest?: string): void => {
    const target = path.resolve(base, output);
    if (outside(target)) {
      findings.push({ file, line: 0, code: 'DETACH_LINK_OUTSIDE_ROOT', message: `${what} points outside the folder: ${output}` });
    } else if (!fs.existsSync(target)) {
      findings.push({ file, line: 0, code: 'DETACH_OUTPUT_MISSING', message: `${what} is missing: ${output}` });
    } else if (digest && `sha256:${sha256(fs.readFileSync(target))}` !== digest) {
      findings.push({ file, line: 0, code: 'DETACH_OUTPUT_CHANGED', message: `${what} differs from its recorded digest: ${output}` });
    }
  };

  const ledgerPath = path.join(absoluteRoot, DEFAULT_LEDGER_FILE);
  if (fs.existsSync(ledgerPath)) {
    try {
      for (const entry of readLedger(ledgerPath).entries) record(DEFAULT_LEDGER_FILE, absoluteRoot, entry.output, 'Imported asset');
    } catch (error) {
      findings.push({ file: DEFAULT_LEDGER_FILE, line: 0, code: 'DETACH_RECORD_UNREADABLE', message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const manifestPath of findMaterializedManifests(absoluteRoot)) {
    const label = relativeToRoot(absoluteRoot, manifestPath);
    try {
      for (const entry of readMaterializedManifest(manifestPath).entries) {
        record(label, path.dirname(manifestPath), entry.output, 'Materialized table', entry.outputSha256);
      }
    } catch (error) {
      findings.push({ file: label, line: 0, code: 'DETACH_RECORD_UNREADABLE', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}

function findMaterializedManifests(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name === MATERIALIZED_MANIFEST) found.push(child);
    }
  };
  walk(root);
  return found;
}
