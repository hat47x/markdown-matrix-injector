import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

import {
  appendSearchObservation,
  clearSearchObservations,
  readSearchObservationStore,
} from '../search/observation/store.js';
import {
  renderSearchObservationSummaryMarkdown,
  summarizeSearchObservations,
} from '../search/observation/summary.js';
import type { SearchObservationHost } from './searchFlow.js';

export const SEARCH_OBSERVATION_SUMMARY_COMMAND_ID =
  'markdownMatrixInjector.searchObservation.summary';
export const SEARCH_OBSERVATION_EXPORT_COMMAND_ID =
  'markdownMatrixInjector.searchObservation.export';
export const SEARCH_OBSERVATION_CLEAR_COMMAND_ID =
  'markdownMatrixInjector.searchObservation.clear';

const OBSERVATION_FILE = 'search-observations.json';
const NOTICE_KEY = 'mmi.search-observation.notice-v1';

export function createSearchObservationHost(
  context: vscode.ExtensionContext,
): SearchObservationHost {
  const config = vscode.workspace.getConfiguration('markdownMatrixInjector');
  const enabled =
    config.get<boolean>('search.observation.enabled', false) === true;
  const includeText =
    config.get<boolean>('search.observation.includeText', false) === true;

  return {
    enabled: enabled && context.storageUri !== undefined,
    includeText,
    record(record) {
      if (!enabled || !context.storageUri) return;
      appendSearchObservation(
        observationPath(context.storageUri),
        record,
      );
    },
  };
}

export async function showSearchObservationNoticeOnce(
  context: vscode.ExtensionContext,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdownMatrixInjector');
  if (
    config.get<boolean>('search.observation.enabled', false) !== true
    || context.storageUri === undefined
    || context.workspaceState.get<boolean>(NOTICE_KEY, false)
  ) {
    return;
  }

  const includeText =
    config.get<boolean>('search.observation.includeText', false) === true;
  const detail = includeText
    ? '検索回数、分類、結末、順位・適合度、別名提案の結果に加え、明示設定により最終の依頼文も保存します。'
    : '検索回数、分類、結末、順位・適合度、別名提案の結果だけを保存します。依頼文、表名、ファイル名、利用者名は保存しません。';

  await vscode.window.showInformationMessage(
    `MMI: 表検索の需要観測をこのワークスペースでローカル記録します。\n${detail}\n外部送信は行いません。`,
    { modal: true },
    '確認',
  );
  await context.workspaceState.update(NOTICE_KEY, true);
}

export function registerSearchObservationCommands(
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      SEARCH_OBSERVATION_SUMMARY_COMMAND_ID,
      async () => showSummary(context, false),
    ),
    vscode.commands.registerCommand(
      SEARCH_OBSERVATION_EXPORT_COMMAND_ID,
      async () => showSummary(context, true),
    ),
    vscode.commands.registerCommand(
      SEARCH_OBSERVATION_CLEAR_COMMAND_ID,
      async () => clearRecords(context),
    ),
  ];
}

async function showSummary(
  context: vscode.ExtensionContext,
  exportFile: boolean,
): Promise<void> {
  if (!context.storageUri) {
    void vscode.window.showInformationMessage(
      'MMI: ワークスペースを開いてから検索観測を利用してください。',
    );
    return;
  }
  const store = readSearchObservationStore(
    observationPath(context.storageUri),
  );
  const markdown = renderSearchObservationSummaryMarkdown(
    summarizeSearchObservations(store.records),
  );

  if (!exportFile) {
    const document = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: markdown,
    });
    await vscode.window.showTextDocument(document, { preview: true });
    return;
  }

  const target = await vscode.window.showSaveDialog({
    title: 'MMI: 検索観測の件数集計を書き出す',
    filters: { Markdown: ['md'] },
    saveLabel: '書き出す',
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(markdown, 'utf8'),
  );
  void vscode.window.showInformationMessage(
    'MMI: 検索観測の件数集計を書き出しました。依頼文は含みません。',
  );
}

async function clearRecords(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (!context.storageUri) return;
  const answer = await vscode.window.showWarningMessage(
    'MMI: このワークスペースの表検索の観測記録をすべて消去します。',
    { modal: true },
    '消去',
  );
  if (answer !== '消去') return;
  clearSearchObservations(observationPath(context.storageUri));
  void vscode.window.showInformationMessage(
    'MMI: 表検索の観測記録を消去しました。',
  );
}

function observationPath(storageUri: vscode.Uri): string {
  fs.mkdirSync(storageUri.fsPath, { recursive: true });
  return path.join(storageUri.fsPath, OBSERVATION_FILE);
}
