/**
 * `MMI: Import from Workbook` (02_Architecture/import-assistance.md §5).
 *
 * Picks an existing Excel design document, asks where to save the import
 * draft, keeps tables as live MMI references, extracts embedded images as
 * ordinary content-addressed Markdown assets, records those image occurrences
 * in the shared import ledger, and opens the draft beside its preview.
 * The workbook is read-only; the person keeps, moves, edits or deletes the
 * proposed content in the draft.
 */
import path from 'node:path';
import * as vscode from 'vscode';
import { writeWorkbookImportDraft } from '../importAssist/importMaterialization.js';
import { readWorkbookCached } from './sharedWorkbookCache.js';

export const IMPORT_WORKBOOK_COMMAND_ID = 'markdownMatrixInjector.importFromWorkbook';

const IMPORTABLE = /\.(xlsx|xlsm|xls|xml)$/i;

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
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(draftUri)
    ?? vscode.workspace.getWorkspaceFolder(workbook);
  const ledgerPath = workspaceFolder
    ? path.join(workspaceFolder.uri.fsPath, 'mmi-ledger.json')
    : path.join(path.dirname(draftUri.fsPath), 'mmi-ledger.json');

  let materialized: ReturnType<typeof writeWorkbookImportDraft>;
  try {
    materialized = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'MMI: 表と画像を取り込み候補へ整理しています' },
      async () => writeWorkbookImportDraft({
        sourcePath: workbook.fsPath,
        draftPath: draftUri.fsPath,
        ledgerPath,
        workbook: data,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('MMI_IMPORT_DRAFT_EXISTS:')) {
      void vscode.window.showErrorMessage(
        'MMI: 保存先のMarkdownは既に存在します。別の新しいファイル名を選んでください。',
      );
    } else {
      void vscode.window.showErrorMessage(
        `MMI: 取り込み候補を作成できませんでした: ${message}`,
      );
    }
    return undefined;
  }
  if (materialized.imageProblems.length > 0) {
    void vscode.window.showWarningMessage(
      `MMI: 下書きを作成しました。抽出できなかった画像が ${materialized.imageProblems.length} 件あります。下書きの「画像の注意」を確認してください。`,
    );
  }
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
