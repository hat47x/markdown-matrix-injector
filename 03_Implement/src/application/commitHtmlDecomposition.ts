/**
 * Guarded multi-fragment HTML decomposition commit (#553).
 *
 * One batch of outputs is published with create-if-absent links and one ledger
 * update. Normal failures roll back only assets created by this invocation.
 * This is NOT crash-atomic, multi-process transactional, or HTML sanitization.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../adapters/htmlFragmentAdapter.js';
import {
  entryFor,
  readLedger,
  recordEntries,
} from '../core/importLedger.js';
import { createSourceIdentityFromBytes, readSourceFileIdentity } from '../core/sourceIdentity.js';
import {
  previewHtmlDecomposition,
  type HtmlPreviewFile,
} from './htmlDecompositionPreview.js';
import type { HtmlPlanSelection } from './htmlDecompositionPlan.js';

export interface CommitHtmlDecompositionOptions {
  workspaceRoot: string;
  sourcePath: string;
  ledgerPath: string;
  selections: readonly HtmlPlanSelection[];
  /** Mandatory full-source snapshot digest obtained when reviewing the plan. */
  expectedSourceDigest: string;
}

export interface CommittedHtmlDecomposition {
  sourceDigest: string;
  /** A content digest is NOT a proof of visual or semantic equivalence. */
  files: {
    id: string;
    output: string;
    digest: string;
    status: 'written' | 'unchanged';
  }[];
  ledger: string;
}

function assertInside(root: string, target: string): string {
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep)
      || path.isAbsolute(relative)) {
    throw new Error('MMI_HTML_OUTSIDE_ROOT: path must be inside workspace');
  }
  return relative;
}

/** Reject symlinks, including dangling links, on all existing path components. */
function inspectPath(root: string, target: string): void {
  const relative = assertInside(root, target);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let entry: fs.Stats;
    try {
      entry = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw new Error('MMI_HTML_SYMLINK_PATH: path includes a symlink');
    }
  }
}

function ensureParent(root: string, target: string): void {
  inspectPath(root, target);
  const relative = assertInside(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
    // Recheck each element just before use, not only before planning.
    inspectPath(root, current);
    if (!fs.lstatSync(current).isDirectory()) {
      throw new Error('MMI_HTML_NOT_DIRECTORY: non-directory parent');
    }
  }
}

function existingOutput(target: string, digest: string): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('MMI_HTML_OUTPUT_COLLISION: output is not a regular file');
  }
  const actual = createSourceIdentityFromBytes(fs.readFileSync(target)).digest;
  if (actual !== digest) {
    throw new Error('MMI_HTML_OUTPUT_COLLISION: output exists with different content');
  }
  return true;
}

function verifySource(sourcePath: string, expected: string): void {
  if (readSourceFileIdentity(sourcePath).digest !== expected) {
    throw new Error('MMI_HTML_SOURCE_CHANGED: source differs from reviewed snapshot');
  }
}

/**
 * The caller must explicitly request a write (unlike html-plan --preview).
 * No file is created until all fragments pass reference planning, snapshot
 * checks, and destination collision preflight.
 */
export function commitHtmlDecomposition(
  options: CommitHtmlDecompositionOptions,
): CommittedHtmlDecomposition {
  const root = fs.realpathSync(path.resolve(options.workspaceRoot));
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('MMI_HTML_ROOT_INVALID: workspace root is not a directory');
  }
  const sourcePath = path.resolve(options.sourcePath);
  const ledgerPath = path.resolve(options.ledgerPath);
  if (!/\.html?$/iu.test(sourcePath)) {
    throw new Error('MMI_HTML_SOURCE_TYPE: source must end in .html or .htm');
  }
  inspectPath(root, sourcePath);
  inspectPath(root, ledgerPath);
  if (!fs.statSync(sourcePath).isFile()) {
    throw new Error('MMI_HTML_SOURCE_INVALID: source must be a regular file');
  }
  if (fs.existsSync(ledgerPath) && !fs.statSync(ledgerPath).isFile()) {
    throw new Error('MMI_HTML_LEDGER_INVALID: ledger must be a regular file');
  }

  const bytes = fs.readFileSync(sourcePath);
  const sourceDigest = createSourceIdentityFromBytes(bytes).digest;
  if (sourceDigest !== options.expectedSourceDigest) {
    throw new Error('MMI_HTML_SOURCE_CHANGED: source digest differs from approved plan');
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const sourceLabel = path.relative(path.dirname(ledgerPath), sourcePath).split(path.sep).join('/');
  const parsed = readHtmlFragments(text, sourceLabel, sourceDigest);
  const preview = previewHtmlDecomposition(parsed, options.selections);
  if (!preview.readyForReview) {
    throw new Error('MMI_HTML_PLAN_BLOCKED: ' + preview.plan.problems.map((p) => p.code).join(', '));
  }
  if (preview.files.length !== options.selections.length) {
    throw new Error('MMI_HTML_BATCH_INCOMPLETE: preview is not complete');
  }
  const files = preview.files.map((item: HtmlPreviewFile) => ({
    ...item,
    absolute: path.resolve(root, item.output),
  }));

  // Preflight all output targets BEFORE creating a directory or publishing any
  // file. This is not a claim of full filesystem race freedom.
  const protectedPaths = new Set([
    sourcePath.normalize('NFC').toLowerCase(),
    ledgerPath.normalize('NFC').toLowerCase(),
  ]);
  for (const file of files) {
    inspectPath(root, file.absolute);
    if (protectedPaths.has(file.absolute.normalize('NFC').toLowerCase())) {
      throw new Error('MMI_HTML_OUTPUT_COLLISION: output is source or ledger');
    }
    existingOutput(file.absolute, file.digest);
  }
  readLedger(ledgerPath); // verify existing ledger before any writes
  verifySource(sourcePath, sourceDigest);

  const created: string[] = [];
  const temporary: string[] = [];
  const statuses = new Map<string, 'written' | 'unchanged'>();
  try {
    for (const file of files) {
      ensureParent(root, file.absolute);
      if (existingOutput(file.absolute, file.digest)) {
        statuses.set(file.output, 'unchanged');
        continue;
      }
      const temporaryPath = path.join(
        path.dirname(file.absolute),
        '.mmi-html-batch-' + randomUUID() + '.tmp',
      );
      temporary.push(temporaryPath);
      fs.writeFileSync(temporaryPath, file.html, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      verifySource(sourcePath, sourceDigest);
      try {
        fs.linkSync(temporaryPath, file.absolute); // create-if-absent, no overwrite
        created.push(file.absolute);
        statuses.set(file.output, 'written');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST'
            || !existingOutput(file.absolute, file.digest)) {
          throw error;
        }
        statuses.set(file.output, 'unchanged');
      }
      fs.unlinkSync(temporaryPath);
      temporary.pop();
    }

    verifySource(sourcePath, sourceDigest);
    ensureParent(root, ledgerPath);
    const entries = files.map((file) => {
      const candidate = selectHtmlFragmentById(
        parsed,
        file.sourceId,
        options.selections.find((s) => s.id === file.sourceId)?.expectedFingerprint,
      ).candidate;
      return entryFor(
        ledgerPath,
        sourcePath,
        candidate,
        file.absolute,
        'reviewed-html-decomposition-batch-v0',
        {
          projection: 'normalized-html-with-reviewed-anchor-rewrites-v0',
          id: file.sourceId,
          outputDigest: file.digest,
        },
      );
    });
    recordEntries(ledgerPath, entries);
    return {
      sourceDigest,
      files: files.map((file) => ({
        id: file.sourceId,
        output: file.output,
        digest: file.digest,
        status: statuses.get(file.output) ?? 'unchanged',
      })),
      ledger: path.relative(root, ledgerPath).split(path.sep).join('/'),
    };
  } catch (error) {
    // If the process crashes, a partially published batch may remain.
    // Do not remove pre-existing outputs, and do not claim crash-atomicity.
    for (const file of created.reverse()) {
      try { fs.unlinkSync(file); } catch { /* retain original error */ }
    }
    throw error;
  } finally {
    for (const tmp of temporary) {
      try { fs.unlinkSync(tmp); } catch { /* cleanup best effort */ }
    }
  }
}
