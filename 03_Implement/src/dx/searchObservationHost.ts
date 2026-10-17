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
import { uiText } from './uiPhrases.js';

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
      // Turning includeText off also removes request text that earlier records kept.
      appendSearchObservation(
        observationPath(context.storageUri),
        record,
        undefined,
        { keepText: includeText },
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
    ? uiText('It saves the number of searches, the outcome, the rank and fit, the results of alias suggestion, and, only with the explicit setting, the final request text.')
    : uiText('It saves only the number of searches, the outcome, the rank and fit, and the results of alias suggestion. It does not save request text, table names, file names, or user names.');

  await vscode.window.showInformationMessage(
    uiText('MMI: It records the demand observation of table search locally in this workspace.\n{0}\nIt sends nothing outside the machine.', detail),
    { modal: true },
    uiText('Accept'),
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
      uiText('MMI: Open a workspace before using the search observation.'),
    );
    return;
  }
  let records;
  try {
    records = readSearchObservationStore(observationPath(context.storageUri)).records;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(uiText('MMI: Could not read the search observation records: {0}', reason));
    return;
  }
  const markdown = renderSearchObservationSummaryMarkdown(
    summarizeSearchObservations(records),
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
    title: uiText('MMI: Export the count summary of the search observation'),
    filters: { Markdown: ['md'] },
    saveLabel: uiText('Export'),
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(markdown, 'utf8'),
  );
  void vscode.window.showInformationMessage(
    uiText('MMI: Exported the count summary of the search observation. It does not contain request text.'),
  );
}

async function clearRecords(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (!context.storageUri) return;
  const clearLabel = uiText('Erase');
  const answer = await vscode.window.showWarningMessage(
    uiText('MMI: Erase all observation records of table search in this workspace.'),
    { modal: true },
    clearLabel,
  );
  if (answer !== clearLabel) return;
  try {
    clearSearchObservations(observationPath(context.storageUri));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(uiText('MMI: Could not erase the search observation records: {0}', reason));
    return;
  }
  void vscode.window.showInformationMessage(
    uiText('MMI: Erased the observation records of table search.'),
  );
}

/**
 * Test-command entries (Extension Host e2e only, registered from activate when test commands are
 * enabled): the stored records, and a clear without the confirmation dialog.
 */
export function registerSearchObservationTestCommands(
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'markdownMatrixInjector.__test.searchObservationRecords',
      () => (context.storageUri
        ? readSearchObservationStore(observationPath(context.storageUri)).records
        : []),
    ),
    vscode.commands.registerCommand(
      'markdownMatrixInjector.__test.clearSearchObservations',
      () => {
        if (context.storageUri) clearSearchObservations(observationPath(context.storageUri));
      },
    ),
  ];
}

function observationPath(storageUri: vscode.Uri): string {
  fs.mkdirSync(storageUri.fsPath, { recursive: true });
  return path.join(storageUri.fsPath, OBSERVATION_FILE);
}
