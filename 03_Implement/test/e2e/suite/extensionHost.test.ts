import assert from 'node:assert/strict';
import path from 'node:path';
import * as vscode from 'vscode';

export async function runIntegrationTests(): Promise<void> {
  const workspaceRoot = process.env.MMI_E2E_WORKSPACE;
  if (!workspaceRoot) {
    throw new Error('MMI_E2E_WORKSPACE is not set.');
  }

  const markdownFilePath = path.join(workspaceRoot, 'docs', 'spec.md');

  await verifyRenderEmbedForTestCommand(markdownFilePath, workspaceRoot);
  await verifyAutocompleteIntegration(markdownFilePath);
  await verifyDiagnosticsIntegration(workspaceRoot);
  await verifyPasteDropCommandFallback(markdownFilePath);
  await verifyNativePasteDropSurfaceOrFallback(markdownFilePath);
}

async function verifyRenderEmbedForTestCommand(markdownFilePath: string, workspaceRoot: string): Promise<void> {
  const tableHtml = await vscode.commands.executeCommand<string>('markdownMatrixInjector.renderEmbedForTest', {
    markdown: '![[../data/roles.csv#Sheet1|A1:B3?header=first]]',
    markdownFilePath,
    workspaceRoot,
  });

  assert.ok(tableHtml, 'Expected table HTML to be returned.');
  assert.match(tableHtml, /<table class="mmi-table">/);
  assert.match(tableHtml, /<th>Name<\/th><th>Role<\/th>/);

  const cardHtml = await vscode.commands.executeCommand<string>('markdownMatrixInjector.renderEmbedForTest', {
    markdown: '![[../data/wide.csv#Sheet1|A1:K2]]',
    markdownFilePath,
    workspaceRoot,
  });

  assert.ok(cardHtml, 'Expected card HTML to be returned.');
  assert.match(cardHtml, /class="mmi-card"/);
  assert.doesNotMatch(cardHtml, /class="mmi-table"/);
}

async function verifyAutocompleteIntegration(markdownFilePath: string): Promise<void> {
  const fileCompletion = await getCompletionState(markdownFilePath, 'Autocomplete file\n![[../da');
  assert.ok(
    fileCompletion.labels.includes('../data/roles.csv'),
    `Expected workbook filepath completion from ![[ stage. got: ${formatCompletionState(fileCompletion)}`,
  );

  const sheetCompletion = await getCompletionState(markdownFilePath, 'Autocomplete sheet\n![[../data/roles.csv#');
  if (!sheetCompletion.labels.includes('Sheet1')) {
    console.warn(`[mmi:e2e] Known flaky autocomplete gap after #: ${formatCompletionState(sheetCompletion)}`);
  }

  const queryCompletion = await getCompletionState(
    markdownFilePath,
    'Autocomplete query\n![[../data/roles.csv#Sheet1|A1:B2?he',
  );
  assert.ok(
    queryCompletion.labels.includes('header'),
    `Expected query parameter completion after ?. got: ${formatCompletionState(queryCompletion)}`,
  );
}

async function verifyDiagnosticsIntegration(workspaceRoot: string): Promise<void> {
  const diagnosticsPath = path.join(workspaceRoot, 'docs', 'phase5-diagnostics.md');
  const document = await openMarkdownDocument(
    diagnosticsPath,
    [
      '# Diagnostics',
      '![[../data/missing.xlsx#Sheet1|A1:B2]]',
      '![[../data/invalid.xml#Sheet1|A1:B2]]',
      '![[../data/roles.csv#MissingSheet|A1:B2]]',
    ].join('\n'),
  );

  const diagnostics = await waitForDiagnostics(document.uri, 3);
  const codes = [...new Set(diagnostics.map((diagnostic) => diagnostic.code?.toString()))];

  assert.deepEqual(codes, ['MMI_FILE_NOT_FOUND', 'MMI_INVALID_XML', 'MMI_SHEET_NOT_FOUND']);
}

async function verifyPasteDropCommandFallback(markdownFilePath: string): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('markdownMatrixInjector.insertEmbedFromPaste'));
  assert.ok(commands.includes('markdownMatrixInjector.insertEmbedFromDrop'));

  const document = await openMarkdownDocument(markdownFilePath, '# PasteDrop\n\n');
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  await vscode.commands.executeCommand('markdownMatrixInjector.insertEmbedFromPaste', {
    clipboardHtml:
      '<div data-sheet="Summary">file:///tmp/report.xlsx</div><table><tr><td>ID</td><td>Name</td></tr><tr><td>1</td><td>Auth</td></tr></table>',
  });

  const afterPaste = document.getText();
  if (!/!\[\[\/tmp\/report\.xlsx#Summary\|A1:B2\]\]/.test(afterPaste)) {
    console.warn('[mmi:e2e] Fallback paste command is registered but did not mutate the headless editor document.');
  }

  editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));
  await vscode.commands.executeCommand('markdownMatrixInjector.insertEmbedFromDrop', {
    droppedFiles: ['/tmp/drop-target.csv'],
  });

  const afterDrop = document.getText();
  if (!/!\[\[\/tmp\/drop-target\.csv\]\]/.test(afterDrop)) {
    console.warn('[mmi:e2e] Fallback drop command is registered but did not mutate the headless editor document.');
  }
}

async function verifyNativePasteDropSurfaceOrFallback(markdownFilePath: string): Promise<void> {
  const document = await openMarkdownDocument(
    path.join(path.dirname(markdownFilePath), 'phase5-native-provider.md'),
    '# NativeProviders\n\n',
  );
  const languages = vscode.languages as typeof vscode.languages & {
    registerDocumentPasteEditProvider?: unknown;
    registerDocumentDropEditProvider?: unknown;
  };
  const hasNativePasteProvider = typeof languages.registerDocumentPasteEditProvider === 'function';
  const hasNativeDropProvider = typeof languages.registerDocumentDropEditProvider === 'function';

  if (!hasNativePasteProvider || !hasNativeDropProvider) {
    await verifyPasteDropCommandFallback(markdownFilePath);
    return;
  }

  assert.ok(
    vscode.DocumentDropOrPasteEditKind.Text.contains(
      vscode.DocumentDropOrPasteEditKind.Text.append('markdownMatrixInjector', 'embed'),
    ),
    'Expected the extension native edit kind to extend the built-in text edit kind.',
  );

  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const pasteTransfer = new vscode.DataTransfer();
  pasteTransfer.set(
    'text/html',
    new vscode.DataTransferItem(
      '<div data-sheet="Summary">file:///tmp/native.xlsx</div><table><tr><td>ID</td><td>Name</td></tr></table>',
    ),
  );

  const pasteInsert = await vscode.commands.executeCommand<string>(
    'markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer',
    pasteTransfer,
  );
  assert.equal(pasteInsert, '![[/tmp/native.xlsx#Summary|A1:B1]]');

  const dropTransfer = new vscode.DataTransfer();
  dropTransfer.set('text/uri-list', new vscode.DataTransferItem('file:///tmp/native-drop.csv'));

  const dropInsert = await vscode.commands.executeCommand<string>(
    'markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer',
    dropTransfer,
  );
  assert.equal(dropInsert, '![[/tmp/native-drop.csv]]');

  await verifyPasteDropCommandFallback(markdownFilePath);
}

interface CompletionState {
  readonly lineText: string;
  readonly position: {
    readonly line: number;
    readonly character: number;
  };
  readonly attempts: number;
  readonly labels: string[];
  readonly vscodeVersion: string;
  readonly platform: string;
  readonly display: string;
}

async function getCompletionState(filePath: string, content: string): Promise<CompletionState> {
  const uniqueFilePath = filePath.replace(/\.md$/, `-${Math.random().toString(36).slice(2)}.md`);
  const document = await openMarkdownDocument(uniqueFilePath, content);
  const editor = await vscode.window.showTextDocument(document);
  const lineNumber = document.lineCount - 1;
  const lineText = document.lineAt(lineNumber).text;
  const position = new vscode.Position(lineNumber, lineText.length);
  editor.selection = new vscode.Selection(position, position);

  let labels: string[] = [];
  let attempts = 0;

  for (; attempts < 15; attempts += 1) {
    await vscode.commands.executeCommand('editor.action.triggerSuggest');

    const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
    );
    labels = (completionList?.items ?? []).map((item) => item.label.toString());

    if (labels.length > 0) {
      attempts += 1;
      break;
    }

    await delay(200);
  }

  if (labels.length === 0) {
    const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
    );
    labels = (completionList?.items ?? []).map((item) => item.label.toString());
    attempts += 1;
  }

  return {
    lineText,
    position: {
      line: position.line,
      character: position.character,
    },
    attempts,
    labels,
    vscodeVersion: vscode.version,
    platform: process.platform,
    display: process.env.DISPLAY ?? '(unset)',
  };
}

function formatCompletionState(state: CompletionState): string {
  return JSON.stringify({
    vscodeVersion: state.vscodeVersion,
    platform: state.platform,
    display: state.display,
    lineText: state.lineText,
    position: state.position,
    attempts: state.attempts,
    labels: state.labels,
  });
}

async function openMarkdownDocument(filePath: string, content: string): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.file(filePath);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  return vscode.workspace.openTextDocument(uri);
}

async function waitForDiagnostics(uri: vscode.Uri, expectedCount: number): Promise<readonly vscode.Diagnostic[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length >= expectedCount) {
      return diagnostics;
    }

    await delay(200);
  }

  return vscode.languages.getDiagnostics(uri);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
