/**
 * `MMI: Import Tables from Workbook` (02_Architecture/import-assistance.md §5).
 *
 * Picks an existing Excel design document, asks where to save the import
 * draft, writes the draft (a new Markdown file -- the workbook is only read)
 * and opens it beside its preview, where every proposed reference is already
 * rendered from the source. The person then keeps, edits or deletes; nothing
 * is decided for them.
 */
import path from 'node:path';
import * as vscode from 'vscode';
import { analyzeWorkbookForImport, renderImportDraft } from '../importAssist/importDraft.js';
import { readWorkbookStructure, type WorkbookStructure } from '../importAssist/workbookStructure.js';
import { readWorkbookCached } from './sharedWorkbookCache.js';
import { toRelativeSuggestion } from './vscodeAdapters.js';

export const IMPORT_WORKBOOK_COMMAND_ID = 'markdownMatrixInjector.importFromWorkbook';

const IMPORTABLE = /\.(xlsx|xls|xml)$/i;

/** `draftTarget` skips the save dialog (scripted runs); the person always chooses it otherwise. */
export async function importFromWorkbook(workbookGlob: string, target?: vscode.Uri, draftTarget?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const workbook = target && IMPORTABLE.test(target.fsPath) ? target : await pickWorkbook(workbookGlob);
  if (!workbook) return undefined;

  const baseName = path.basename(workbook.fsPath).replace(/\.[^.]+$/, '');
  const activeMarkdown = vscode.window.activeTextEditor?.document;
  const folder = activeMarkdown?.languageId === 'markdown' && activeMarkdown.uri.scheme === 'file'
    ? path.dirname(activeMarkdown.uri.fsPath)
    : path.dirname(workbook.fsPath);
  const draftUri = draftTarget ?? await vscode.window.showSaveDialog({
    title: 'MMI: 取り込み候補の保存先（新しいMarkdownファイル。原本は変更しません）',
    defaultUri: vscode.Uri.file(path.join(folder, `${baseName}_取り込み候補.md`)),
    filters: { Markdown: ['md'] },
  });
  if (!draftUri) return undefined;

  let data;
  try {
    data = readWorkbookCached(workbook.fsPath);
  } catch (error) {
    void vscode.window.showErrorMessage(`MMI: ブックを読めませんでした: ${(error as Error).message}`);
    return undefined;
  }
  const draft = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'MMI: 表の領域と書式を調べています' },
    async () => {
      let structure: WorkbookStructure | undefined;
      try {
        structure = readWorkbookStructure(workbook.fsPath, data);
      } catch {
        structure = undefined; // names and tables are optional evidence; the draft works without them
      }
      return renderImportDraft(
        analyzeWorkbookForImport(path.basename(workbook.fsPath), toRelativeSuggestion(draftUri.fsPath, workbook.fsPath), data, { structure }),
      );
    },
  );

  await vscode.workspace.fs.writeFile(draftUri, new TextEncoder().encode(draft));
  const document = await vscode.workspace.openTextDocument(draftUri);
  await vscode.window.showTextDocument(document, { preview: false });
  await vscode.commands.executeCommand('markdown.showPreviewToSide', draftUri);
  return draftUri;
}

async function pickWorkbook(workbookGlob: string): Promise<vscode.Uri | undefined> {
  const files = (await vscode.workspace.findFiles(workbookGlob, '**/node_modules/**', 2000)).filter((uri) => IMPORTABLE.test(uri.fsPath));
  if (files.length === 0) {
    void vscode.window.showInformationMessage('MMI: ワークスペースにExcelのブックが見つかりません。');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    files
      .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
      .map((uri) => ({ label: path.basename(uri.fsPath), description: vscode.workspace.asRelativePath(uri), uri })),
    { title: 'MMI: 取り込む既存のExcel設計書を選ぶ', placeHolder: '表の領域・見出し・書式を調べ、参照付きの下書きを作ります（原本は変更しません）' },
  );
  return picked?.uri;
}
