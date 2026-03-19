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
  await verifyPasteDropCommands(markdownFilePath);
  await verifyNativePasteDropProviders(markdownFilePath);
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
  const fileSuggestions = await getCompletionLabels(markdownFilePath, 'Autocomplete file\n![[../da');
  assert.ok(fileSuggestions.includes('../data/roles.csv'), 'Expected workbook filepath completion from ![[ stage.');

  const sheetSuggestions = await getCompletionLabels(markdownFilePath, 'Autocomplete sheet\n![[../data/roles.csv#');
  assert.ok(sheetSuggestions.includes('Sheet1'), 'Expected sheet completion after #.');

  const queryParamSuggestions = await getCompletionLabels(
    markdownFilePath,
    'Autocomplete query\n![[../data/roles.csv#Sheet1|A1:B2?he',
  );
  assert.ok(queryParamSuggestions.includes('header'), 'Expected query parameter completion after ?.');
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
  const codes = diagnostics.map((diagnostic) => diagnostic.code);

  assert.deepEqual(codes, ['MMI_FILE_NOT_FOUND', 'MMI_INVALID_XML', 'MMI_SHEET_NOT_FOUND']);
}

async function verifyPasteDropCommands(markdownFilePath: string): Promise<void> {
  const document = await openMarkdownDocument(markdownFilePath, '# PasteDrop\n');
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  await vscode.commands.executeCommand('markdownMatrixInjector.insertEmbedFromPaste', {
    clipboardHtml:
      '<div data-sheet="Summary">file:///tmp/report.xlsx</div><table><tr><td>ID</td><td>Name</td></tr><tr><td>1</td><td>Auth</td></tr></table>',
  });

  assert.match(document.getText(), /!\[\[\/tmp\/report\.xlsx#Summary\|A1:B2\]\]/);

  editor.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));
  await vscode.commands.executeCommand('markdownMatrixInjector.insertEmbedFromDrop', {
    droppedFiles: ['/tmp/drop-target.csv'],
  });

  assert.match(document.getText(), /!\[\[\/tmp\/drop-target\.csv\]\]/);
}


async function verifyNativePasteDropProviders(markdownFilePath: string): Promise<void> {
  const document = await openMarkdownDocument(
    path.join(path.dirname(markdownFilePath), 'phase5-native-provider.md'),
    `# NativeProviders\n`,
  );
  const pasteProvider = (vscode.languages as typeof vscode.languages & {
    registerDocumentPasteEditProvider?: unknown;
  }).registerDocumentPasteEditProvider;
  const dropProvider = (vscode.languages as typeof vscode.languages & {
    registerDocumentDropEditProvider?: unknown;
  }).registerDocumentDropEditProvider;

  assert.equal(typeof pasteProvider, 'function');
  assert.equal(typeof dropProvider, 'function');
  assert.ok(vscode.DocumentDropOrPasteEditKind.Text.contains(vscode.DocumentDropOrPasteEditKind.Text.append('markdownMatrixInjector', 'embed')));

  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));

  const pasteTransfer = new vscode.DataTransfer();
  pasteTransfer.set(
    'text/html',
    new vscode.DataTransferItem(
      '<div data-sheet="Summary">file:///tmp/native.xlsx</div><table><tr><td>ID</td><td>Name</td></tr></table>',
    ),
  );

  const pasteInsert = await vscode.commands.executeCommand<string>('markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer', pasteTransfer);
  assert.equal(pasteInsert, '![[/tmp/native.xlsx#Summary|A1:B1]]');

  const dropTransfer = new vscode.DataTransfer();
  dropTransfer.set('text/uri-list', new vscode.DataTransferItem('file:///tmp/native-drop.csv'));

  const dropInsert = await vscode.commands.executeCommand<string>('markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer', dropTransfer);
  assert.equal(dropInsert, '![[/tmp/native-drop.csv]]');
}

async function getCompletionLabels(filePath: string, content: string): Promise<string[]> {
  const uniqueFilePath = filePath.replace(/\.md$/, `-${Math.random().toString(36).slice(2)}.md`);
  const document = await openMarkdownDocument(uniqueFilePath, content);
  const position = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      position,
    );
    const labels = (completionList?.items ?? []).map((item) => item.label.toString());

    if (labels.length > 0) {
      return labels;
    }

    await delay(200);
  }

  const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    document.uri,
    position,
  );
  return (completionList?.items ?? []).map((item) => item.label.toString());
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
