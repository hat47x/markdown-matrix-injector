/**
 * Narrow, source-read-only HTML fragment extraction (#553).
 *
 * This is intentionally a normalized HTML5 fragment (not Markdown and not a
 * finished standalone publication). It rejects active content and unresolved
 * local dependencies instead of silently generating a broken detached asset.
 * Writes one content-addressed fragment plus one shared ledger entry, with
 * output-only rollback on failure.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../adapters/htmlFragmentAdapter.js';
import { entryFor, recordEntries } from '../core/importLedger.js';
import { createSourceIdentityFromBytes, readSourceFileIdentity } from '../core/sourceIdentity.js';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

export interface ExtractHtmlFragmentOptions {
  sourcePath: string;
  /** Explicit ID obtained during inspection, not an inferred section title. */
  id: string;
  /** Required review-time content identity from inspect --json. */
  expectedFingerprint: string;
  workspaceRoot: string;
  outDir: string;
  ledgerPath: string;
}

export interface ExtractedHtmlFragment {
  sourceDigest: string;
  fragmentFingerprint: string;
  outputDigest: string;
  path: string;
  status: 'written' | 'unchanged';
  /** External links are retained as links; their contents are not included. */
  externalLinks: string[];
}

function containedPath(value: string, root: string): string {
  const relative = path.relative(root, value);
  if (relative === '' || relative === '..'
      || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('MMI_HTML_OUTSIDE_ROOT: path must be a file or directory inside workspace');
  }
  return relative;
}

/**
 * Check each existing component for symlinks. The root directory is trusted
 * after realpath; this does not claim crash-atomicity or defense from another
 * actor concurrently replacing a directory between checks.
 */
function checkPath(root: string, target: string, createParents: boolean): void {
  const rootReal = fs.realpathSync(root);
  const relative = containedPath(path.resolve(target), path.resolve(root));
  let cursor = rootReal;
  const segments = relative.split(path.sep);
  for (let index = 0; index < segments.length; index += 1) {
    const isLeaf = index === segments.length - 1;
    cursor = path.join(cursor, segments[index]);
    let stat: fs.Stats | undefined;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!stat) {
      if (!isLeaf && createParents) {
        fs.mkdirSync(cursor, { mode: 0o700 });
      } else if (!isLeaf) {
        throw new Error('MMI_HTML_MISSING_PARENT: output parent directory is missing');
      }
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new Error('MMI_HTML_SYMLINK_PATH: path includes a symbolic link');
    }
    if (!isLeaf && !stat.isDirectory()) {
      throw new Error('MMI_HTML_NOT_DIRECTORY: parent is not a directory');
    }
  }
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function childrenOf(node: HtmlNode): readonly HtmlNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

/**
 * An unsanitized HTML snippet must not be declared safe merely because we
 * serialized a DOM. The initial extraction subset is deliberately conservative.
 */
function validateStaticFragment(fragmentHtml: string): string[] {
  const parsed = parseFragment(fragmentHtml, { scriptingEnabled: false });
  const denied = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
    'base', 'link', 'meta', 'template', 'foreignobject',
    'video', 'audio', 'source', 'track', 'canvas',
  ]);
  const ids = new Set<string>();
  const links: string[] = [];
  const anchorTargets: string[] = [];

  const walk = (node: HtmlNode): void => {
    if (isElement(node)) {
      const name = node.tagName.toLowerCase();
      if (denied.has(name)) {
        throw new Error(`MMI_HTML_ACTIVE_CONTENT: unsupported element ${name}`);
      }
      for (const attribute of node.attrs) {
        const key = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (/^on[a-z]/u.test(key) || key === 'style' || key === 'srcdoc'
            || /url\s*\(/iu.test(value)) {
          throw new Error(`MMI_HTML_ACTIVE_CONTENT: unsupported attribute ${key}`);
        }
        if (key === 'id') {
          if (ids.has(value)) {
            throw new Error('MMI_HTML_DUPLICATE_FRAGMENT_ID: duplicate ID inside selected fragment');
          }
          ids.add(value);
        }
        if (key === 'src' || key === 'srcset' || key === 'poster'
            || key === 'data' || key === 'action' || key === 'formaction') {
          throw new Error(`MMI_HTML_UNMATERIALIZED_ASSET: unsupported dependency ${key}`);
        }
        if (key === 'href' || key === 'xlink:href') {
          if (value.startsWith('#')) {
            if (value.length > 1) {
              anchorTargets.push(decodeURIComponent(value.slice(1)));
            }
          } else if (/^https?:\/\//iu.test(value) && name === 'a') {
            links.push(value);
          } else {
            throw new Error('MMI_HTML_UNMATERIALIZED_LINK: unsupported relative/active link');
          }
        }
      }
    }
    for (const child of childrenOf(node)) walk(child);
  };
  walk(parsed);
  for (const target of anchorTargets) {
    if (!ids.has(target)) {
      throw new Error(`MMI_HTML_UNRESOLVED_ANCHOR: #${target} is outside selected fragment`);
    }
  }
  return links;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function extractHtmlFragment(
  options: ExtractHtmlFragmentOptions,
): ExtractedHtmlFragment {
  const root = path.resolve(options.workspaceRoot);
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('MMI_HTML_ROOT_INVALID: workspace root must be a directory');
  }
  const sourcePath = path.resolve(options.sourcePath);
  const outDir = path.resolve(options.outDir);
  const ledgerPath = path.resolve(options.ledgerPath);
  if (!/\.html?$/iu.test(sourcePath)) {
    throw new Error('MMI_HTML_SOURCE_TYPE: only .html and .htm are supported');
  }

  checkPath(root, sourcePath, false);
  // The asset directory may not exist yet; check and create its parents only
  // after the selected fragment passes snapshot and safety validation.
  checkPath(root, ledgerPath, true);
  if (fs.existsSync(ledgerPath) && !fs.statSync(ledgerPath).isFile()) {
    throw new Error('MMI_HTML_LEDGER_INVALID: ledger path is not a file');
  }

  const sourceBytes = fs.readFileSync(sourcePath);
  const originalDigest = createSourceIdentityFromBytes(sourceBytes).digest;
  const sourceText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes);
  const sourceRelative = path.relative(path.dirname(ledgerPath), sourcePath).split(path.sep).join('/');
  const parsed = readHtmlFragments(sourceText, sourceRelative, originalDigest);
  const fragment = selectHtmlFragmentById(parsed, options.id, options.expectedFingerprint);
  const externalLinks = validateStaticFragment(fragment.html);
  const outputBytes = Buffer.from(fragment.html + '\n', 'utf8');
  const outputDigest = sha256(outputBytes);
  const outputPath = path.join(outDir, `fragment-${outputDigest.slice(7, 23)}.html`);
  if (path.resolve(sourcePath) === path.resolve(outputPath)) {
    throw new Error('MMI_HTML_SOURCE_OUTPUT_CONFLICT: output overlaps source');
  }

  // Only make the destination after the source and fragment checks succeed.
  checkPath(root, outputPath, true);
  // Recheck the full destination (including dangling symlinks) before reusing
  // a content-addressed asset or accepting a competing writer's EEXIST.
  const identicalExistingAsset = (): boolean => {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(outputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('MMI_HTML_OUTPUT_COLLISION: output is not a regular file');
    }
    if (sha256(fs.readFileSync(outputPath)) !== outputDigest) {
      throw new Error('MMI_HTML_OUTPUT_COLLISION: output exists with different contents');
    }
    return true;
  };
  const alreadyPresent = identicalExistingAsset();

  let created = false;
  let temporaryFile: string | undefined;
  try {
    if (!alreadyPresent) {
      temporaryFile = path.join(outDir, `.mmi-html-fragment-${randomUUID()}.tmp`);
      fs.writeFileSync(temporaryFile, outputBytes, { flag: 'wx', mode: 0o600 });
      if (readSourceFileIdentity(sourcePath).digest !== originalDigest) {
        throw new Error('MMI_HTML_SOURCE_CHANGED: source changed during extraction');
      }
      try {
        fs.linkSync(temporaryFile, outputPath); // create-if-absent, no overwrite
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST'
            || !identicalExistingAsset()) throw error;
      }
    }
    if (readSourceFileIdentity(sourcePath).digest !== originalDigest) {
      throw new Error('MMI_HTML_SOURCE_CHANGED: source changed before ledger commit');
    }

    const entry = entryFor(
      ledgerPath,
      sourcePath,
      fragment.candidate,
      outputPath,
      'explicit-html-id-with-reviewed-fingerprint-v1',
      {
        adapter: 'html-fragment-v1',
        id: options.id,
        projection: 'normalized-outer-html-v1',
      },
    );
    recordEntries(ledgerPath, [entry]);
    return {
      sourceDigest: originalDigest,
      fragmentFingerprint: fragment.candidate.fingerprint.digest,
      outputDigest,
      path: outputPath,
      status: created ? 'written' : 'unchanged',
      externalLinks,
    };
  } catch (error) {
    // Never delete a pre-existing or concurrently created asset on failure.
    if (created) fs.unlinkSync(outputPath);
    throw error;
  } finally {
    if (temporaryFile && fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}
