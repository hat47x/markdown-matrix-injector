/**
 * The language of the messages the extension shows a person from Core and
 * Application code (Problems panel, preview, review dialogs): the
 * `markdownMatrixInjector.language` setting or, for `auto`, VS Code's display
 * language. Many Japanese teams run VS Code in English, hence the setting.
 * Sentences phrased through `uiText` follow VS Code's display language instead
 * (`vscode.l10n` cannot be told another language).
 */
import * as vscode from 'vscode';

export function currentMessageLanguage(): string {
  const chosen = vscode.workspace.getConfiguration('markdownMatrixInjector').get<string>('language', 'auto');
  return chosen === 'auto' ? vscode.env.language : chosen;
}
