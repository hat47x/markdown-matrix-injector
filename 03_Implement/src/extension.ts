import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { WorkbookCache } from './cache/workbookCache.js';
import { markdownMatrixPlugin } from './plugin/markdownMatrixPlugin.js';
import type { WorkbookData } from './core/workbookLoader.js';

interface RenderEmbedForTestArgs {
  markdown: string;
  markdownFilePath: string;
  workspaceRoot?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'markdownMatrixInjector.renderEmbedForTest',
    async (args: RenderEmbedForTestArgs) => renderEmbedForTest(args),
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}

export async function renderEmbedForTest(args: RenderEmbedForTestArgs): Promise<string> {
  const md = new MarkdownIt();
  md.use(markdownMatrixPlugin, {
    markdownFilePath: args.markdownFilePath,
    workspaceRoot: args.workspaceRoot,
    cache: new WorkbookCache<WorkbookData>(),
  });

  return md.render(args.markdown);
}
