/**
 * VS Code side of the local search-demand observation (design: 02_Architecture/search-observation.md).
 * Everything that decides or counts lives in src/search/observation/ and runs without VS Code; this
 * file only reads the settings, finds the workspace's storage folder, shows the one-time notice,
 * and offers the commands to summarize and erase the records.
 *
 * Off by default. Nothing is recorded, written or shown until the person turns the setting on.
 */
import path from 'node:path';
import * as vscode from 'vscode';
import { SearchSessionRecorder } from '../search/observation/record.js';
import { ObservationStore } from '../search/observation/store.js';
import { renderSummary, summarize } from '../search/observation/summary.js';
import type { AliasResult, ObservationRecord } from '../search/observation/types.js';

export const SUMMARIZE_OBSERVATION_COMMAND_ID = 'markdownMatrixInjector.summarizeSearchObservation';
export const CLEAR_OBSERVATION_COMMAND_ID = 'markdownMatrixInjector.clearSearchObservation';

const NOTICE_KEY = 'markdownMatrixInjector.searchObservation.noticed';
const FILE_NAME = 'search-observation.jsonl';

let context: vscode.ExtensionContext | undefined;

export function initSearchObservation(extensionContext: vscode.ExtensionContext): void {
  context = extensionContext;
}

function settings(): { enabled: boolean; includeText: boolean } {
  const config = vscode.workspace.getConfiguration('markdownMatrixInjector');
  return {
    enabled: config.get<boolean>('search.observation.enabled', false) === true,
    includeText: config.get<boolean>('search.observation.includeText', false) === true,
  };
}

/** The workspace-local store, or `undefined` when there is no workspace storage to hold one. */
function storeOf(): ObservationStore | undefined {
  const folder = context?.storageUri?.fsPath;
  return folder ? new ObservationStore(path.join(folder, FILE_NAME)) : undefined;
}

/** A recorder for one search session, or `undefined` while the observation is off. */
export function beginObservedSession(): SearchSessionRecorder | undefined {
  const { enabled, includeText } = settings();
  if (!enabled || !storeOf()) return undefined;
  if (context && context.workspaceState.get(NOTICE_KEY) !== true) {
    void context.workspaceState.update(NOTICE_KEY, true);
    void vscode.window.showInformationMessage(
      'MMI: 検索の観測がオンです。表を探した結果（依頼の分類・結末・選んだ候補の順位と適合度）をこのワークスペースのローカル領域にだけ記録します。依頼文・表名・ファイル名は記録せず、外部へ送りません。「MMI: 検索の観測を消去する」で削除できます。',
    );
  }
  return new SearchSessionRecorder({ includeText });
}

/** Writes the record of a finished session. Failure is silent: it must never disturb a search. */
export async function finishObservedSession(recorder: SearchSessionRecorder | undefined, alias: AliasResult): Promise<void> {
  if (!recorder) return;
  const record = recorder.build(alias);
  const store = storeOf();
  if (record && store) await store.append(record);
}

async function readRecords(): Promise<ObservationRecord[] | undefined> {
  const store = storeOf();
  return store ? store.readAll() : undefined;
}

/** Opens the counts-only summary as a Markdown document the person can read or save. */
export async function summarizeObservation(): Promise<void> {
  const records = await readRecords();
  if (!records) {
    void vscode.window.showInformationMessage('MMI: 検索の観測は、フォルダを開いたワークスペースでだけ使えます。');
    return;
  }
  const content = renderSummary(summarize(records));
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
  await vscode.window.showTextDocument(document, { preview: true });
}

export async function clearObservation(): Promise<void> {
  const store = storeOf();
  if (!store) return;
  const records = await store.readAll();
  if (records.length === 0) {
    void vscode.window.showInformationMessage('MMI: 消去する検索の観測はありません。');
    return;
  }
  const answer = await vscode.window.showWarningMessage(
    `MMI: このワークスペースの検索の観測 ${records.length} 件を消去します。元に戻せません。`,
    { modal: true },
    '消去する',
  );
  if (answer !== '消去する') return;
  await store.clear();
  void vscode.window.showInformationMessage('MMI: 検索の観測を消去しました。');
}
