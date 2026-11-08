/**
 * The previous version of a document for `mmi render --base-rev <rev>`: the files of one git revision, exported to a
 * temporary folder as the committed blobs (`git ls-tree` and `git cat-file --batch`), so the previous tables are rendered from the previous data and a changed Excel or CSV value is
 * reported as a change. Nothing in the repository or the working tree is touched.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RenderError } from './render.js';

export interface RevisionExport {
  markdownFilePath: string;
  workspaceRoot: string;
  label: string;
  cleanup: () => void;
}

function git(cwd: string, args: string[]): Buffer {
  const result = spawnSync('git', ['-C', cwd, ...args], { maxBuffer: 1024 * 1024 * 1024, windowsHide: true });
  if (result.error) throw new RenderError(`git could not be started: ${result.error.message}`);
  if (result.status !== 0) throw new RenderError(`git ${args[0]} failed: ${result.stderr.toString('utf8').trim()}`);
  return result.stdout;
}

/**
 * The blobs of one commit under `relativeRoot`, written byte for byte as committed. `git archive` is not used: it
 * leaves out files marked `export-ignore` and applies `export-subst`, `eol` and `text` conversions, so the previous
 * version would no longer be what was committed. Symbolic links and submodules are not exported, and a file kept in
 * Git LFS is exported as its pointer text.
 */
function exportBlobs(top: string, commit: string, relativeRoot: string, temporary: string): void {
  const listing = git(top, ['ls-tree', '-r', '-z', '--full-tree', commit, ...(relativeRoot === '.' ? [] : ['--', relativeRoot])]);
  const entries: { sha: string; name: string }[] = [];
  for (const record of listing.toString('utf8').split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, type, sha] = record.slice(0, tab).split(' ');
    if (type !== 'blob' || mode === '120000') continue;
    entries.push({ sha, name: record.slice(tab + 1) });
  }
  if (entries.length === 0) return;
  const result = spawnSync('git', ['-C', top, 'cat-file', '--batch'], {
    input: `${entries.map((entry) => entry.sha).join('\n')}\n`,
    maxBuffer: 1024 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new RenderError(`git could not be started: ${result.error.message}`);
  if (result.status !== 0) throw new RenderError(`git cat-file failed: ${result.stderr.toString('utf8').trim()}`);
  const output = result.stdout;
  let offset = 0;
  for (const entry of entries) {
    const newline = output.indexOf(0x0a, offset);
    const header = newline < 0 ? '' : output.toString('utf8', offset, newline).split(' ');
    if (header[0] !== entry.sha || header[1] !== 'blob') throw new RenderError(`the revision could not be exported: ${entry.name}`);
    const size = Number(header[2]);
    const content = output.subarray(newline + 1, newline + 1 + size);
    if (content.length !== size) throw new RenderError(`the revision could not be exported: ${entry.name}`);
    offset = newline + 1 + size + 1;
    const target = path.resolve(temporary, entry.name);
    if (!target.startsWith(`${temporary}${path.sep}`)) throw new RenderError(`unsafe path in the revision: ${entry.name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export function exportRevision(markdownFilePath: string, workspaceRoot: string, revision: string): RevisionExport {
  if (!revision || revision.startsWith('-')) throw new RenderError('--base-rev needs a git revision such as HEAD~1, a tag or a commit');
  // Real paths on both sides: git reports the long form of a path where a temporary folder may be given in its
  // 8.3 short form (Windows), and the repository-relative path must not depend on which form was used.
  const realPath = (value: string): string => fs.realpathSync.native(path.resolve(value));
  const documentDirectory = path.dirname(realPath(markdownFilePath));
  const top = realPath(git(documentDirectory, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  const commit = git(top, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]).toString('utf8').trim();
  const relativeRoot = path.relative(top, realPath(workspaceRoot)) || '.';
  const relativeDocument = path.relative(top, realPath(markdownFilePath));
  if (relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot) || relativeDocument.startsWith('..')) {
    throw new RenderError('--base-rev needs the document and --root to be inside one git repository');
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-base-'));
  const cleanup = (): void => fs.rmSync(temporary, { recursive: true, force: true });
  try {
    exportBlobs(top, commit, relativeRoot.split(path.sep).join('/'), temporary);
  } catch (error) {
    cleanup();
    throw error;
  }
  const exportedDocument = path.join(temporary, relativeDocument);
  if (!fs.existsSync(exportedDocument)) {
    cleanup();
    throw new RenderError(`${relativeDocument.split(path.sep).join('/')} did not exist in ${revision}`);
  }
  return { markdownFilePath: exportedDocument, workspaceRoot: path.join(temporary, relativeRoot), label: `${revision}（${commit.slice(0, 8)}）`, cleanup };
}

export interface BaseSelection {
  base?: string;
  baseRoot?: string;
  baseRev?: string;
}

/** The comparison base for one document from the CLI options, or `undefined` when no comparison was asked for. */
export function resolveBase(
  selection: BaseSelection,
  markdownFilePath: string,
  workspaceRoot: string,
): { base: { markdownFilePath: string; workspaceRoot: string; label: string }; cleanup: () => void } | undefined {
  if (selection.base && selection.baseRev) throw new RenderError('use either --base or --base-rev, not both');
  if (selection.baseRoot && !selection.base) throw new RenderError('--base-root goes with --base');
  if (selection.baseRev) {
    const exported = exportRevision(markdownFilePath, workspaceRoot, selection.baseRev);
    return { base: { markdownFilePath: exported.markdownFilePath, workspaceRoot: exported.workspaceRoot, label: exported.label }, cleanup: exported.cleanup };
  }
  if (!selection.base) return undefined;
  const file = path.resolve(selection.base);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new RenderError(`--base ${selection.base} is not a file`);
  return { base: { markdownFilePath: file, workspaceRoot: path.resolve(selection.baseRoot ?? workspaceRoot), label: path.basename(file) }, cleanup: () => {} };
}
