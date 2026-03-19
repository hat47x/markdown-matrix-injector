import fs from 'node:fs/promises';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import * as XLSX from 'xlsx';
import { WorkbookCache } from './cache/workbookCache.js';
import type { WorkbookData } from './core/workbookLoader.js';
import {
  AUTOCOMPLETE_QUERY_PARAM_CANDIDATES,
  getAutocompleteCandidates,
  type AutocompleteCandidateSets,
} from './dx/autocompleteProvider.js';
import {
  buildCompletionItems,
  createDiagnosticsForDocument,
  getDropInsertText,
  getPasteInsertText,
  getTextBeforePosition,
  resolveWorkbookReference,
  toRelativeSuggestion,
  type PasteDropCommandArgs,
} from './dx/vscodeAdapters.js';
import { markdownMatrixPlugin } from './plugin/markdownMatrixPlugin.js';

interface RenderEmbedForTestArgs {
  markdown: string;
  markdownFilePath: string;
  workspaceRoot?: string;
}

const MARKDOWN_SELECTOR: vscode.DocumentSelector = [{ language: 'markdown' }];
const SUPPORTED_COMPLETION_TRIGGER_CHARACTERS = ['[', '#', '|', '?', '&'] as const;
const WORKBOOK_FILE_GLOB = '**/*.{xlsx,xls,csv,xml}';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('markdown-matrix-injector');

  context.subscriptions.push(
    diagnostics,
    vscode.commands.registerCommand('markdownMatrixInjector.renderEmbedForTest', async (args: RenderEmbedForTestArgs) =>
      renderEmbedForTest(args),
    ),
    vscode.commands.registerTextEditorCommand(
      'markdownMatrixInjector.insertEmbedFromPaste',
      async (editor, _edit, args?: PasteDropCommandArgs) => {
        const insertText = getPasteInsertText(args);
        if (!insertText) {
          return;
        }

        await editor.edit((editBuilder) => {
          editBuilder.replace(editor.selection, insertText);
        });
      },
    ),
    vscode.commands.registerTextEditorCommand(
      'markdownMatrixInjector.insertEmbedFromDrop',
      async (editor, _edit, args?: PasteDropCommandArgs) => {
        const insertText = getDropInsertText(args);
        if (!insertText) {
          return;
        }

        await editor.edit((editBuilder) => {
          editBuilder.replace(editor.selection, insertText);
        });
      },
    ),
    vscode.languages.registerCompletionItemProvider(
      MARKDOWN_SELECTOR,
      createCompletionProvider(),
      ...SUPPORTED_COMPLETION_TRIGGER_CHARACTERS,
    ),
    vscode.workspace.onDidOpenTextDocument((document) => refreshDiagnosticsForDocument(document, diagnostics)),
    vscode.workspace.onDidChangeTextDocument((event) => refreshDiagnosticsForDocument(event.document, diagnostics)),
    vscode.workspace.onDidSaveTextDocument((document) => refreshDiagnosticsForDocument(document, diagnostics)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
  );

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnosticsForDocument(document, diagnostics);
  }
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

function createCompletionProvider(): vscode.CompletionItemProvider {
  return {
    async provideCompletionItems(document, position) {
      const linePrefix = getTextBeforePosition(document.lineAt(position.line).text, position.character);

      if (!linePrefix.includes('![[')) {
        return undefined;
      }

      const candidateSets = await buildAutocompleteCandidateSets(document, linePrefix);
      const candidates = buildCompletionItems(getAutocompleteCandidates(linePrefix, candidateSets));

      return candidates.map((candidate) => {
        const item = new vscode.CompletionItem(candidate.label, toCompletionKind(candidate.kind));
        item.insertText = candidate.insertText;
        return item;
      });
    },
  };
}

async function buildAutocompleteCandidateSets(
  document: vscode.TextDocument,
  input: string,
): Promise<AutocompleteCandidateSets> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const workspaceRoot = workspaceFolder?.uri.fsPath;
  const files = workspaceRoot
    ? (await vscode.workspace.findFiles(WORKBOOK_FILE_GLOB, '**/{node_modules,dist}/**'))
        .filter((uri) => uri.fsPath.startsWith(workspaceRoot))
        .map((uri) => toRelativeSuggestion(document.uri.fsPath, uri.fsPath))
        .sort((left, right) => left.localeCompare(right))
    : [];
  const reference = resolveWorkbookReference(input, document.uri.fsPath, workspaceRoot);
  const workbookMetadata = reference?.resolvedFilepath
    ? await readWorkbookMetadata(reference.resolvedFilepath)
    : undefined;

  return {
    files,
    sheets: workbookMetadata?.sheets ?? [],
    ranges: workbookMetadata?.ranges ?? [],
    queryParams: AUTOCOMPLETE_QUERY_PARAM_CANDIDATES,
  };
}

async function readWorkbookMetadata(
  resolvedFilepath: string,
): Promise<{ sheets: string[]; ranges: string[] } | undefined> {
  try {
    const workbook = XLSX.readFile(resolvedFilepath, { dense: true });
    const sheets = [...workbook.SheetNames];
    const ranges = sheets
      .map((sheetName) => workbook.Sheets[sheetName]?.['!ref'])
      .filter((range): range is string => typeof range === 'string' && range.length > 0);

    return { sheets, ranges };
  } catch {
    return undefined;
  }
}

async function refreshDiagnosticsForDocument(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  if (document.languageId !== 'markdown') {
    diagnostics.delete(document.uri);
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const workspaceRoot = workspaceFolder?.uri.fsPath;
  const items = await createDiagnosticsForDocument(document.getText(), document.uri.fsPath, workspaceRoot, {
    fileExists: async (filepath) => {
      try {
        await fs.access(filepath);
        return true;
      } catch {
        return false;
      }
    },
    readFile: (filepath) => fs.readFile(filepath),
    readWorkbookSheetNames: async (filepath) => {
      const workbook = XLSX.readFile(filepath, { dense: true, bookSheets: true });
      return [...workbook.SheetNames];
    },
  });

  diagnostics.set(
    document.uri,
    items.map(({ diagnostic, range }) => {
      const vsCodeDiagnostic = new vscode.Diagnostic(
        new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character),
        diagnostic.message,
        vscode.DiagnosticSeverity.Error,
      );
      vsCodeDiagnostic.source = diagnostic.source;
      vsCodeDiagnostic.code = diagnostic.code;
      return vsCodeDiagnostic;
    }),
  );
}

function toCompletionKind(kind: 'file' | 'sheet' | 'range' | 'query-param'): vscode.CompletionItemKind {
  switch (kind) {
    case 'file':
      return vscode.CompletionItemKind.File;
    case 'sheet':
      return vscode.CompletionItemKind.Module;
    case 'range':
      return vscode.CompletionItemKind.Field;
    case 'query-param':
      return vscode.CompletionItemKind.Property;
    default:
      return vscode.CompletionItemKind.Text;
  }
}
