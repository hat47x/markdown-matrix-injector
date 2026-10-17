/**
 * Hover on an embed (issue-0111 UX): what the reference renders as -- the
 * engine's own table cut to its first rows, or the card / error it produces
 * -- plus one-click "edit" and "open source". Read-only; opening the source
 * goes through the existing validated command.
 */
import * as vscode from 'vscode';

import { embedAt } from './authoringFlow.js';
import { serializeEmbedParts } from './embedEditor.js';
import { describePreview, summarizeRenderedEmbed, truncateTableHtml, type PreviewPhrases } from './embedPreview.js';
import { resolveWorkbookPath } from './vscodeAdapters.js';
import { uiText } from './uiPhrases.js';

const HOVER_ROWS = 5;

/** The hover's summary/buttons in the bundle's language; `l10n` keys are the English reference sentences. */
const phrases: PreviewPhrases = {
  table: (bodyRows, columns, header) =>
    uiText('Renders as a table: {0} body rows × {1} columns{2}', bodyRows, columns, header ? uiText(' (with header)') : ''),
  empty: (columns) => uiText('Renders as a table: 0 matching rows ({0} columns). No row matched the grep condition.', columns),
  card: () => uiText('Renders as a card sheet (no sheet or mode=card, or too many columns or cells for a table)'),
  error: (message) => uiText('Error: {0}', message),
  unknown: () => uiText('Could not determine what this renders as'),
};

export function createEmbedHoverProvider(render: (markdown: string, markdownFilePath: string, workspaceRoot?: string) => Promise<string>): vscode.HoverProvider {
  return {
    async provideHover(document, position, token) {
      const embed = embedAt(document, position);
      if (!embed) return undefined;
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
      const markdown = serializeEmbedParts(embed.parts);
      let html: string;
      try {
        html = await render(markdown, document.uri.fsPath, workspaceRoot);
      } catch (error) {
        html = `<div class="mmi-error">${String(error)}</div>`;
      }
      if (token.isCancellationRequested) return undefined;
      const summary = summarizeRenderedEmbed(html);
      const absolute = resolveWorkbookPath(embed.parts.filepath, document.uri.fsPath, workspaceRoot);
      const edit = commandUri('markdownMatrixInjector.authorEmbed', [{ uri: document.uri.toString(), line: position.line, character: position.character }]);
      const open = commandUri('markdownMatrixInjector.openSource', [absolute]);

      const content = new vscode.MarkdownString(undefined, true);
      content.supportHtml = true;
      content.isTrusted = { enabledCommands: ['markdownMatrixInjector.authorEmbed', 'markdownMatrixInjector.openSource'] };
      content.appendMarkdown(`**MMI** — ${escapeMarkdown(describePreview(summary, phrases))}\n\n`);
      if (summary.kind === 'table') {
        const cut = truncateTableHtml(html, HOVER_ROWS);
        content.appendMarkdown(`${/<table[\s\S]*<\/table>/u.exec(cut.html)?.[0] ?? ''}\n\n`);
        if (cut.hiddenRows > 0) content.appendMarkdown(`${uiText('…and {0} more rows', cut.hiddenRows)}\n\n`);
      }
      content.appendMarkdown(`[${uiText('$(edit) Edit')}](${edit})　[${uiText('$(link-external) Open source')}](${open})`);
      return new vscode.Hover(content, embed.range);
    },
  };
}

function commandUri(command: string, args: unknown[]): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+.!|<>-]/g, (ch) => `\\${ch}`);
}
