/**
 * `MMI: Import from Workbook` (02_Architecture/import-assistance.md §5).
 *
 * Picks an existing Excel design document, asks where to save the import
 * draft, keeps tables as live MMI references, extracts embedded images as
 * ordinary content-addressed Markdown assets, records those image occurrences
 * in the shared import ledger, and opens the draft beside its preview.
 *
 * Linked references stay inside their trust boundary. If the chosen legacy
 * workbook lives outside that boundary, the person chooses a project-local
 * source-copy path first; MMI copies the exact bytes and references the copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

import { writeWorkbookImportDraft } from '../importAssist/importMaterialization.js';
import {
  intakeSourceFile,
  pathWithinBoundaryForWrite,
} from '../importAssist/sourceIntake.js';

export const IMPORT_WORKBOOK_COMMAND_ID = 'markdownMatrixInjector.importFromWorkbook';

const IMPORTABLE = /\.(xlsx|xlsm|xls|xml)$/i;
const WORKBOOK_FILTERS = {
  'Excel / XML Spreadsheet': ['xlsx', 'xlsm', 'xls', 'xml'],
};

/**
 * `draftTarget` and `sourceCopyTarget` skip save dialogs in scripted runs.
 * Interactive users always choose any required write destination.
 */
export async function importFromWorkbook(
  workbookGlob: string,
  target?: vscode.Uri,
  draftTarget?: vscode.Uri,
  sourceCopyTarget?: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  const workbook = target && IMPORTABLE.test(target.fsPath)
    ? target
    : await pickWorkbook(workbookGlob);
  if (!workbook) return undefined;

  const baseName = path.basename(workbook.fsPath).replace(/\.[^.]+$/u, '');
  const activeMarkdown = vscode.window.activeTextEditor?.document;
  const workspaceDefault = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const folder = activeMarkdown?.languageId === 'markdown'
    && activeMarkdown.uri.scheme === 'file'
    ? path.dirname(activeMarkdown.uri.fsPath)
    : workspaceDefault ?? path.dirname(workbook.fsPath);

  const draftUri = draftTarget ?? await vscode.window.showSaveDialog({
    title: 'MMI: 取り込み候補の保存先（新しいMarkdownファイル。原本は変更しません）',
    defaultUri: vscode.Uri.file(path.join(folder, `${baseName}_取り込み候補.md`)),
    filters: { Markdown: ['md'] },
  });
  if (!draftUri) return undefined;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(draftUri);
  const referenceBoundary = workspaceFolder?.uri.fsPath
    ?? path.dirname(draftUri.fsPath);
  const ledgerPath = workspaceFolder
    ? path.join(workspaceFolder.uri.fsPath, 'mmi-ledger.json')
    : path.join(path.dirname(draftUri.fsPath), 'mmi-ledger.json');

  let effectiveWorkbook = workbook;
  let sourceCopyCreated = false;

  if (!pathWithinBoundaryForWrite(workbook.fsPath, referenceBoundary)) {
    const suggestedCopy = vscode.Uri.file(
      path.join(
        referenceBoundary,
        'data',
        'imported',
        path.basename(workbook.fsPath),
      ),
    );
    const copyUri = sourceCopyTarget ?? await vscode.window.showSaveDialog({
      title: 'MMI: 原本コピーの保存先（このファイルをLinked参照の正本にします）',
      defaultUri: suggestedCopy,
      filters: WORKBOOK_FILTERS,
    });
    if (!copyUri) return undefined;

    if (!pathWithinBoundaryForWrite(copyUri.fsPath, referenceBoundary)) {
      void vscode.window.showErrorMessage(
        'MMI: 原本コピーは下書きと同じワークスペース内に保存してください。',
      );
      return undefined;
    }

    try {
      const intake = intakeSourceFile(workbook.fsPath, copyUri.fsPath);
      effectiveWorkbook = vscode.Uri.file(intake.sourcePath);
      sourceCopyCreated = intake.created;
    } catch (error) {
      void vscode.window.showErrorMessage(
        `MMI: 原本をワークスペースへ取り込めませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  let materialized: ReturnType<typeof writeWorkbookImportDraft>;
  try {
    materialized = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MMI: 表と画像を取り込み候補へ整理しています',
      },
      async () => writeWorkbookImportDraft({
        sourcePath: effectiveWorkbook.fsPath,
        draftPath: draftUri.fsPath,
        ledgerPath,
      }),
    );
  } catch (error) {
    if (sourceCopyCreated) fs.rmSync(effectiveWorkbook.fsPath, { force: true });
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
      `MMI: 下書きを作成しました。画像・図形に関する注意が ${materialized.imageProblems.length} 件あります。下書きの「画像・図形の注意」を確認してください。`,
    );
  }

  const document = await vscode.workspace.openTextDocument(draftUri);
  await vscode.window.showTextDocument(document, { preview: false });
  await vscode.commands.executeCommand('markdown.showPreviewToSide', draftUri);
  return draftUri;
}

async function pickWorkbook(workbookGlob: string): Promise<vscode.Uri | undefined> {
  const files = (
    await vscode.workspace.findFiles(workbookGlob, '**/node_modules/**', 2000)
  ).filter((uri) => IMPORTABLE.test(uri.fsPath));

  if (files.length === 0) return browseWorkbook();

  const browse = {
    label: '$(folder-opened) ワークスペース外のExcelファイルを選ぶ…',
    description: '選んだ原本は、必要に応じてワークスペース内へコピーしてから参照します',
    browse: true as const,
  };
  const picked = await vscode.window.showQuickPick(
    [
      ...files
        .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
        .map((uri) => ({
          label: path.basename(uri.fsPath),
          description: vscode.workspace.asRelativePath(uri),
          uri,
        })),
      browse,
    ],
    {
      title: 'MMI: 取り込む既存のExcel設計書を選ぶ',
      placeHolder: '表は参照、埋込画像はファイルとして取り込みます（原本は変更しません）',
    },
  );

  if (!picked) return undefined;
  if ('browse' in picked) return browseWorkbook();
  return picked.uri;
}

async function browseWorkbook(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: 'MMI: 取り込む既存のExcel設計書を選ぶ',
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: WORKBOOK_FILTERS,
  });
  return picked?.[0];
}
