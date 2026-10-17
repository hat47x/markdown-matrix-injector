/**
 * The Excel copy's own source, when it can be confirmed (ADR-0017 option 2).
 *
 * Returns a match only after `verifyCopySource` accepts it: same copy as the
 * paste, identical values at that address in the saved workbook, workbook
 * inside a workspace folder. The caller still offers it for selection; it is
 * never inserted on its own (R1). Controlled by
 * `markdownMatrixInjector.paste.useClipboardSource` (default on, local
 * Windows only).
 */
import * as vscode from 'vscode';

import { parseRangeToCellRange } from '../core/tableGeometry.js';
import { verifyCopySource, type ClipboardRejectionPhrases } from './clipboardProvenance.js';
import { matchContext, type WorkbookContentMatch } from './contentMatchSearch.js';
import { readWorkbookCached } from './sharedWorkbookCache.js';
import { toRelativeSuggestion } from './vscodeAdapters.js';
import { clipboardProvenanceSupported, readRawClipboard, warmClipboardHelper } from './windowsClipboard.js';
import { uiText } from './uiPhrases.js';

export const USE_CLIPBOARD_SOURCE_SETTING = 'paste.useClipboardSource';

/** The rejection wording in the bundle's language; `l10n` keys are the English references. */
const clipboardRejectionPhrases: ClipboardRejectionPhrases = {
  noSourceOnClipboard: () => uiText('The copied source is not on the clipboard.'),
  mismatchedPaste: () => uiText('The pasted content does not match the current clipboard content (it may be a different copy).'),
  outsideWorkspace: () => uiText('The copied workbook lies outside the workspace.'),
  unreadableSource: (sheet) => uiText('Could not read the copied workbook or its sheet "{0}" (it may be unsaved).', sheet),
  changedContents: () => uiText('The saved workbook contents differ from the copy (unsaved changes, or the copy includes hidden rows or columns).'),
};

export interface SourcedMatch extends WorkbookContentMatch {
  /** The address came from the clipboard and was checked against the saved source. */
  readonly confirmedSource: true;
}

function enabled(): boolean {
  return (
    clipboardProvenanceSupported(vscode.env.remoteName) &&
    vscode.workspace.getConfiguration('markdownMatrixInjector').get<boolean>(USE_CLIPBOARD_SOURCE_SETTING, true)
  );
}

/** Starts the reader early so the first paste does not wait for it. */
export function warmCopySource(extensionPath: string): void {
  if (enabled()) warmClipboardHelper(extensionPath);
}

export async function confirmedCopySource(
  extensionPath: string,
  document: vscode.TextDocument,
  pastedText: string,
): Promise<{ match?: SourcedMatch; reason?: string }> {
  if (!enabled()) return {};
  const raw = await readRawClipboard(extensionPath);
  if (!raw) return {};
  const verdict = verifyCopySource(raw, pastedText, {
    workspaceRoots: (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === 'file').map((folder) => folder.uri.fsPath),
    loadSheet: (absolutePath, sheet) => readWorkbookCached(absolutePath).sheets[sheet],
    reasons: clipboardRejectionPhrases,
  });
  if (!verdict.ok) return { reason: verdict.reason };
  const { source } = verdict;
  const range = parseRangeToCellRange(source.range);
  const sheet = readWorkbookCached(source.path).sheets[source.sheet];
  return {
    match: {
      filepath: toRelativeSuggestion(document.uri.fsPath, source.path),
      sheet: source.sheet,
      range,
      ...(sheet ? { context: matchContext(sheet, range) } : {}),
      confirmedSource: true,
    },
  };
}

/** The confirmed source first; content matches at the same place are dropped. */
export function withSource(source: SourcedMatch | undefined, matches: readonly WorkbookContentMatch[]): WorkbookContentMatch[] {
  if (!source) return [...matches];
  const same = (match: WorkbookContentMatch) =>
    match.sheet === source.sheet &&
    match.filepath === source.filepath &&
    match.range.startRow === source.range.startRow &&
    match.range.startCol === source.range.startCol &&
    match.range.endRow === source.range.endRow &&
    match.range.endCol === source.range.endCol;
  return [source, ...matches.filter((match) => !same(match))];
}

export function isConfirmedSource(match: WorkbookContentMatch): match is SourcedMatch {
  return (match as Partial<SourcedMatch>).confirmedSource === true;
}
