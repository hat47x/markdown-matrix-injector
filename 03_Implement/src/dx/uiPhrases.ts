/**
 * Strings the extension puts on screen for a person, phrased through
 * `vscode.l10n` (package.json `l10n: ./l10n`, bundles under `l10n/`). The
 * sentence written in code is the English reference; the bundle
 * `l10n/bundle.l10n.ja.json` carries the Japanese wording. Which bundle is used
 * follows VS Code's display language -- the `markdownMatrixInjector.language`
 * setting only covers the Core message tables (`src/core/messages/`).
 */
import * as vscode from 'vscode';

/** Every fixed sentence lands in a bundle key exactly as it is written here. */
export function uiText(message: string, ...args: Array<string | number | boolean>): string {
  return args.length > 0 ? vscode.l10n.t(message, ...args) : vscode.l10n.t(message);
}
