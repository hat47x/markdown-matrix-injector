/**
 * Read-only post-commit audit for a reviewed HTML decomposition (#553).
 *
 * Detects the interrupted-publish gap between filesystem output creation and
 * the shared ledger update. Never deletes, repairs, writes, or follows output
 * symlinks. An audit is a point-in-time observation, not a durable receipt.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  readHtmlFragments,
  selectHtmlFragmentById,
} from '../adapters/htmlFragmentAdapter.js';
import {
  placeOf,
  readLedger,
  sourceKey,
  type LedgerEntry,
} from '../core/importLedger.js';
import { createSourceIdentityFromBytes, readSourceFileIdentity } from '../core/sourceIdentity.js';
import { previewHtmlDecomposition } from './htmlDecompositionPreview.js';
import type { CommitHtmlDecompositionOptions } from './commitHtmlDecomposition.js';

type FileState = 'matching' | 'missing' | 'changed' | 'unsafe';
type LedgerState = 'matching' | 'missing' | 'changed' | 'invalid';

export interface HtmlAuditFile {
  id: string;
  output: string;
  expectedDigest: string;
  file: FileState;
  ledger: LedgerState;
}

export interface HtmlDecompositionAudit {
  status: 'complete' | 'incomplete' | 'stale' | 'blocked';
  sourceDigest: string;
  /** Missing/changed outputs are not automatically eligible for deletion. */
  files: HtmlAuditFile[];
  /** Stable diagnostic codes; no automatic filesystem repair is performed. */
  problems: string[];
  /** Means mechanically consistent at observation time, not publishable or Detached. */
  consistentAtObservation: boolean;
}

function inside(root: string, absolute: string): string {
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep)
      || path.isAbsolute(relative)) {
    throw new Error('MMI_HTML_OUTSIDE_ROOT: path must be inside workspace');
  }
  return relative;
}

/** Inspect all existing components without following symlinks. */
function pathSafety(root: string, absolute: string): 'safe' | 'unsafe' {
  const relative = inside(root, absolute);
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'safe';
      throw error;
    }
    if (stat.isSymbolicLink()) return 'unsafe';
  }
  return 'safe';
}

function assetStatus(root: string, absolute: string, expectedDigest: string): FileState {
  if (pathSafety(root, absolute) === 'unsafe') return 'unsafe';
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return 'unsafe';
  const actual = createSourceIdentityFromBytes(fs.readFileSync(absolute)).digest;
  return actual === expectedDigest ? 'matching' : 'changed';
}

function ledgerState(
  entries: readonly LedgerEntry[],
  source: string,
  place: string,
  kind: LedgerEntry['kind'],
  digest: string,
  output: string,
  outputDigest: string,
  id: string,
  sourceDigest: string,
  representation: string,
): LedgerState {
  const occurrences = entries.filter((entry) =>
    entry.source === source && entry.place === place && entry.kind === kind);
  if (occurrences.length === 0) return 'missing';
  if (occurrences.length !== 1) return 'changed';
  const entry = occurrences[0];
  return entry.sourceDigest === sourceDigest
    && entry.fingerprint.digest === digest
    && entry.fingerprint.representation === representation
    && entry.output === output
    && entry.outputDigest === outputDigest
    && entry.reviewState === 'accepted'
    && entry.basis === 'reviewed-html-decomposition-batch-v0'
    && entry.conversion.projection === 'normalized-html-with-reviewed-anchor-rewrites-v0'
    && entry.conversion.id === id
    ? 'matching' : 'changed';
}

/**
 * Report whether a previously reviewed batch appears complete, stale, or
 * interrupted. The caller must provide the *same* approved manifest used by
 * html-commit; the tool does not infer missing review decisions.
 */
export function auditHtmlDecomposition(
  options: CommitHtmlDecompositionOptions,
): HtmlDecompositionAudit {
  const root = fs.realpathSync(path.resolve(options.workspaceRoot));
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('MMI_HTML_ROOT_INVALID: root must be a directory');
  }
  const sourcePath = path.resolve(options.sourcePath);
  const ledgerPath = path.resolve(options.ledgerPath);
  if (pathSafety(root, sourcePath) !== 'safe'
      || pathSafety(root, ledgerPath) !== 'safe') {
    throw new Error('MMI_HTML_SYMLINK_PATH: source or ledger contains symlink');
  }
  if (!/\.html?$/iu.test(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error('MMI_HTML_SOURCE_INVALID: source must be a regular HTML file');
  }
  const bytes = fs.readFileSync(sourcePath);
  const sourceDigest = createSourceIdentityFromBytes(bytes).digest;
  if (sourceDigest !== options.expectedSourceDigest) {
    return {
      status: 'stale',
      sourceDigest,
      files: [],
      problems: ['MMI_HTML_SOURCE_CHANGED'],
      consistentAtObservation: false,
    };
  }
  const html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const label = path.relative(path.dirname(ledgerPath), sourcePath).split(path.sep).join('/');
  const parsed = readHtmlFragments(html, label, sourceDigest);
  const preview = previewHtmlDecomposition(parsed, options.selections);
  if (!preview.readyForReview) {
    return {
      status: 'blocked',
      sourceDigest,
      files: [],
      problems: preview.plan.problems.map((p) => p.code),
      consistentAtObservation: false,
    };
  }

  const problems: string[] = [];
  let entries: LedgerEntry[] = [];
  let invalidLedger = false;
  try {
    entries = readLedger(ledgerPath).entries;
  } catch {
    invalidLedger = true;
    problems.push('MMI_HTML_LEDGER_INVALID');
  }

  const sourceLabel = sourceKey(ledgerPath, sourcePath);
  const files = preview.files.map((file): HtmlAuditFile => {
    const absolute = path.resolve(root, file.output);
    // Same result as the write preflight: no source or ledger overwrite.
    const protectedPaths = [sourcePath, ledgerPath].map((p) => p.normalize('NFC').toLowerCase());
    const outputSafe = !protectedPaths.includes(absolute.normalize('NFC').toLowerCase());
    const currentFile = outputSafe
      ? assetStatus(root, absolute, file.digest)
      : 'unsafe';
    const candidate = selectHtmlFragmentById(
      parsed, file.sourceId,
      options.selections.find((s) => s.id === file.sourceId)?.expectedFingerprint,
    ).candidate;
    const outputRelative = path.relative(path.dirname(ledgerPath), absolute).split(path.sep).join('/');
    const currentLedger = invalidLedger ? 'invalid' : ledgerState(
      entries,
      sourceLabel,
      placeOf(candidate),
      candidate.kind,
      candidate.fingerprint.digest,
      outputRelative,
      file.digest,
      file.sourceId,
      sourceDigest,
      candidate.fingerprint.representation,
    );
    if (currentFile !== 'matching') {
      problems.push('MMI_HTML_OUTPUT_' + currentFile.toUpperCase());
    }
    if (currentLedger !== 'matching') {
      problems.push('MMI_HTML_LEDGER_' + currentLedger.toUpperCase());
    }
    return {
      id: file.sourceId,
      output: file.output,
      expectedDigest: file.digest,
      file: currentFile,
      ledger: currentLedger,
    };
  });
  // Recheck source after the audit to prevent labeling an observation as
  // complete if the source changed while we were reading the outputs.
  if (readSourceFileIdentity(sourcePath).digest !== sourceDigest) {
    return {
      status: 'stale',
      sourceDigest,
      files,
      problems: [...problems, 'MMI_HTML_SOURCE_CHANGED_DURING_AUDIT'],
      consistentAtObservation: false,
    };
  }
  const complete = problems.length === 0 && files.length === options.selections.length;
  return {
    status: complete ? 'complete' : 'incomplete',
    sourceDigest,
    files,
    problems: [...new Set(problems)],
    consistentAtObservation: complete,
  };
}
