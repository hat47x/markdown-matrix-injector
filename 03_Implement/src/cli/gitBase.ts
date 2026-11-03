/**
 * The previous version of a document for `mmi render --base-rev <rev>`: the files of one git revision, exported to a
 * temporary folder, so the previous tables are rendered from the previous data and a changed Excel or CSV value is
 * reported as a change. Nothing in the repository or the working tree is touched.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readZip, ZipError } from '../core/zipReader.js';
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
  const archive = git(top, ['archive', '--format=zip', commit, '--', relativeRoot]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-base-'));
  const cleanup = (): void => fs.rmSync(temporary, { recursive: true, force: true });
  try {
    for (const entry of readZip(archive).values()) {
      if (entry.name.endsWith('/')) continue;
      const target = path.resolve(temporary, entry.name);
      if (!target.startsWith(`${temporary}${path.sep}`)) throw new RenderError(`unsafe path in the revision: ${entry.name}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.read());
    }
  } catch (error) {
    cleanup();
    if (error instanceof ZipError) throw new RenderError(`the revision could not be exported: ${error.message}`);
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
