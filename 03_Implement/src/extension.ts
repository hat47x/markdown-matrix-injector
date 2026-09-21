import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import * as XLSX from 'xlsx';
import { WorkbookCache } from './cache/workbookCache.js';
import { validateOpenSourcePath } from './core/openSourcePath.js';
import { loadWorkbook, type WorkbookData } from './core/workbookLoader.js';
import { cellRangeToA1 } from './core/tableGeometry.js';
import { buildDeliveryManifestCsv } from './manifest/collectDeliveryManifest.js';
import {
  AUTOCOMPLETE_QUERY_PARAM_CANDIDATES,
  getAutocompleteCandidates,
  type AutocompleteCandidateSets,
} from './dx/autocompleteProvider.js';
import {
  buildCompletionItems,
  buildQueryEvidenceExportArtifacts,
  createDiagnosticsForDocument,
  getDropEditFromDataTransfer,
  getDropInsertText,
  getDropInsertTextFromDataTransfer,
  getPasteEditFromDataTransfer,
  getPasteInsertText,
  getPasteInsertTextFromDataTransfer,
  getTextBeforePosition,
  resolveWorkbookReference,
  toRelativeSuggestion,
  type PasteDropCommandArgs,
} from './dx/vscodeAdapters.js';
import { getScenarioTemplateCandidates, SCENARIO_OBSERVATION_TEMPLATE } from './dx/scenarioTemplate.js';
import { parseTsv } from './dx/pasteDrop.js';
import {
  buildContentMatchMarkdown,
  findWorkbookContentMatches,
  type WorkbookContentMatch,
  type WorkbookSheetsSource,
} from './dx/contentMatchSearch.js';
import { markdownMatrixPlugin } from './plugin/markdownMatrixPlugin.js';

interface RenderEmbedForTestArgs {
  markdown: string;
  markdownFilePath: string;
  workspaceRoot?: string;
}

const MARKDOWN_SELECTOR: vscode.DocumentSelector = [{ language: 'markdown' }];
const SUPPORTED_COMPLETION_TRIGGER_CHARACTERS = ['[', '#', '|', '?', '&'] as const;
const WORKBOOK_FILE_GLOB = '**/*.{xlsx,xls,csv,xml}';
const NATIVE_PASTE_DROP_EDIT_KIND = vscode.DocumentDropOrPasteEditKind.Text.append('markdownMatrixInjector', 'embed');
const CONTENT_MATCH_PASTE_EDIT_KIND = NATIVE_PASTE_DROP_EDIT_KIND.append('contentMatch');
const PASTE_MIME_TYPES = ['text/html', 'files'] as const;
const DROP_MIME_TYPES = ['text/html', 'text/uri-list', 'files'] as const;
const FALLBACK_COMMAND_IDS = [
  'markdownMatrixInjector.insertEmbedFromPaste',
  'markdownMatrixInjector.insertEmbedFromDrop',
] as const;
const NATIVE_PASTE_DROP_COMMAND_NAME = 'Insert Markdown Matrix embed';
const CONTENT_MATCH_PASTE_COMMAND_ID = 'markdownMatrixInjector.insertEmbedByContentMatch';
/**
 * Safety cap on how many workspace files a single content-match search will
 * load, independent of `findContentMatches`'s own per-sheet `maxIndexedCells`
 * (`core/contentMatch.ts`). Measured (2026-09-16, native filesystem, not the
 * WSL2<->Windows `/mnt/c` bridge, which is not representative of a real
 * extension host): loading+searching 30 real sample workbooks takes ~20ms
 * steady-state, 300 (10x) takes ~65-140ms. This cap exists only to bound the
 * pathological case (a workspace with thousands of workbook files); it is not
 * expected to be hit in realistic use. Provisional -- raise if real usage
 * shows it is too tight.
 */
const MAX_CONTENT_MATCH_WORKSPACE_FILES = 500;
const ENABLE_TEST_COMMANDS_ENV_VAR = 'MMI_ENABLE_TEST_COMMANDS';
const DEV_INSERT_SCENARIO_TEMPLATE_COMMAND_ID = 'markdownMatrixInjector.__dev.insertScenarioObservationTemplate';
const DEV_EXPORT_QUERY_EVIDENCE_COMMAND_ID = 'markdownMatrixInjector.__dev.exportQueryEvidence';

interface PasteDropIntegrationTestMetadata {
  fallbackCommandIds: string[];
  nativeEditKind: string;
  pasteMimeTypes: string[];
  dropMimeTypes: string[];
}

interface NativePasteDropState {
  hostSupportsPasteProvider: boolean;
  hostSupportsDropProvider: boolean;
  registeredPasteProvider: boolean;
  registeredDropProvider: boolean;
}

function createNativePasteDropState(): NativePasteDropState {
  return {
    hostSupportsPasteProvider: typeof vscode.languages.registerDocumentPasteEditProvider === 'function',
    hostSupportsDropProvider: typeof vscode.languages.registerDocumentDropEditProvider === 'function',
    registeredPasteProvider: false,
    registeredDropProvider: false,
  };
}

function createNativePasteProviderOptions(): vscode.DocumentPasteProviderMetadata {
  return {
    providedPasteEditKinds: [NATIVE_PASTE_DROP_EDIT_KIND, CONTENT_MATCH_PASTE_EDIT_KIND],
    pasteMimeTypes: [...PASTE_MIME_TYPES],
  };
}

function createNativeDropProviderOptions(): vscode.DocumentDropEditProviderMetadata {
  return {
    providedDropEditKinds: [NATIVE_PASTE_DROP_EDIT_KIND],
    dropMimeTypes: [...DROP_MIME_TYPES],
  };
}

function createPasteDropIntegrationTestMetadata(): PasteDropIntegrationTestMetadata {
  return {
    fallbackCommandIds: [...FALLBACK_COMMAND_IDS],
    nativeEditKind: NATIVE_PASTE_DROP_EDIT_KIND.value,
    pasteMimeTypes: [...PASTE_MIME_TYPES],
    dropMimeTypes: [...DROP_MIME_TYPES],
  };
}

export function activate(context: vscode.ExtensionContext): { extendMarkdownIt: typeof extendMarkdownIt } {
  const diagnostics = vscode.languages.createDiagnosticCollection('markdown-matrix-injector');
  const nativePasteDropState = createNativePasteDropState();

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        if (uri.path === '/open') await openEmbedSource(new URLSearchParams(uri.query).get('source'));
      },
    }),
    vscode.commands.registerCommand('markdownMatrixInjector.renderEmbedForTest', async (args: RenderEmbedForTestArgs) =>
      renderEmbedForTest(args),
    ),
    vscode.commands.registerTextEditorCommand('markdownMatrixInjector.generateDeliveryManifest', (editor) =>
      generateDeliveryManifestForEditor(editor),
    ),
    vscode.commands.registerCommand('markdownMatrixInjector.openSource', (sourcePath?: unknown) =>
      openEmbedSource(sourcePath),
    ),
    vscode.commands.registerCommand(CONTENT_MATCH_PASTE_COMMAND_ID, () => insertEmbedByContentMatch()),
    ...registerCompatibilityPasteDropCommands(),
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

  if (shouldRegisterTestCommands(context)) {
    context.subscriptions.push(...registerTestCommands(nativePasteDropState));
  }

  registerNativePasteDropProviders(context, nativePasteDropState);

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnosticsForDocument(document, diagnostics);
  }

  // The built-in Markdown extension reads Extension.exports, which is the
  // activation result, rather than this module's named ES exports.
  return { extendMarkdownIt };
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

/**
 * Entry point invoked by VS Code's built-in Markdown preview when the extension
 * contributes `markdown.markdownItPlugins`. This is what actually injects
 * `![[...]]` embeds into the live preview. The Markdown file path is resolved
 * per render from `env.currentDocument`, and a single cache is shared for the
 * lifetime of the extension host so the mtime-keyed Workbook cache survives
 * across preview re-renders.
 */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  const cache = new WorkbookCache<WorkbookData>();
  return md.use(markdownMatrixPlugin, {
    cache,
    uriScheme: vscode.env.uriScheme,
    resolveWorkspaceRoot: (markdownFilePath: string) =>
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(markdownFilePath))?.uri.fsPath,
  });
}

/**
 * `MMI: Generate Delivery Manifest` (requirements Phase 4). Scans the active
 * Markdown document for embeds that fall back to a card (i.e. become a delivery
 * "別紙" attachment) and writes a CSV checklist next to the document.
 */
async function generateDeliveryManifestForEditor(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  if (document.isUntitled) {
    void vscode.window.showWarningMessage('MMI: Save the Markdown file before generating a delivery manifest.');
    return;
  }

  const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  const { records, csvText } = buildDeliveryManifestCsv({
    markdownText: document.getText(),
    markdownFilePath: document.uri.fsPath,
    workspaceRoot,
    cache: new WorkbookCache<WorkbookData>(),
  });

  if (records.length === 0) {
    void vscode.window.showInformationMessage(
      'MMI: No attachment (card) embeds found in this document — delivery manifest not written.',
    );
    return;
  }

  const outputPath = buildDeliveryManifestOutputPath(document.uri.fsPath);
  try {
    await fs.writeFile(outputPath, `${csvText}\n`, 'utf8');
    void vscode.window.showInformationMessage(
      `MMI: Delivery manifest written (${records.length} attachment(s)) -> ${outputPath}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MMI: Failed to write delivery manifest: ${reason}`);
  }
}

function buildDeliveryManifestOutputPath(markdownFilePath: string): string {
  const directory = path.dirname(markdownFilePath);
  const basename = path.basename(markdownFilePath, path.extname(markdownFilePath));
  return path.join(directory, `${basename}.delivery-manifest.csv`);
}

/**
 * `MMI: Open Embed Source` — fired by the card's 「外部アプリで開く」 button via a
 * extension URI (ADR-0015). Opens the referenced canonical file in its OS
 * default application through env.openExternal (requirements Phase 4). The
 * handler validates trust, supported format, and real workspace containment.
 */
async function openEmbedSource(sourcePath: unknown): Promise<void> {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    void vscode.window.showErrorMessage('MMI: Open Embed Source requires a file path argument.');
    return;
  }

  try {
    if (!vscode.workspace.isTrusted || vscode.env.remoteName) {
      throw new Error('外部アプリで開く操作は、信頼済みのローカルワークスペースで利用してください。');
    }
    const roots = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath);
    const safePath = await validateOpenSourcePath(sourcePath, roots);
    if (!await vscode.env.openExternal(vscode.Uri.file(safePath))) throw new Error('既定のアプリで開けませんでした。');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MMI: Failed to open ${sourcePath}: ${reason}`);
  }
}

/**
 * `MMI: Insert Embed by Content Match` -- issue-0114 作業D's content-matching
 * path, for when a paste carries no recoverable file path at all. A real
 * Excel range copy's clipboard `text/html`/`text/plain` was confirmed
 * (2026-09-11, `input-assistance-paste-provenance.md` §2) to never contain the
 * source workbook's own path, so `suggestEmbedFromClipboardHtml`'s existing
 * automatic paste path (`registerNativePasteProvider`) can never produce a
 * suggestion for that case -- it can only ever emit `![[file.xlsx]]` when a
 * path happens to be recoverable (a dropped file, or a plain-text path).
 *
 * Deliberately a SEPARATE, explicitly-invoked command rather than folded into
 * the automatic paste provider: searching every workbook in the workspace is
 * real, non-trivial work (loading and indexing each file), and running it
 * silently on every Ctrl+V would be a background-scanning behavior change to
 * every paste that nobody asked for. The workspace file-discovery scope here
 * is not a new policy -- it reuses the exact glob and exclusion already used
 * by the autocomplete provider (`buildAutocompleteCandidateSets`).
 *
 * Never auto-inserts (design review R1): the result -- whether one match or
 * many -- is always routed through `showQuickPick`, VS Code's own explicit
 * multi-candidate picker, never inserted directly.
 *
 * Registered via `registerCommand`, not `registerTextEditorCommand` (bug
 * found 2026-09-17 via real Extension Host e2e verification): VS Code does
 * not support async callbacks with `registerTextEditorCommand` -- the
 * `editor`/`edit` arguments are only valid for the synchronous portion of the
 * callback, and `executeCommand` does not await the callback's returned
 * promise at all (microsoft/vscode#178931, #2933, #16814, #90834). With the
 * original registration, the very first `await` (`vscode.env.clipboard.
 * readText()`) silently orphaned the rest of this function -- `executeCommand`
 * resolved immediately, and the real work raced whatever ran next (observed
 * directly: the command never inserted anything and the process moved on
 * before the pending clipboard read even settled). This function instead
 * resolves `vscode.window.activeTextEditor` itself, once up front and again
 * immediately before the final edit -- focus could in principle change during
 * the clipboard read, the workspace file search, or while the pick is open.
 */
async function insertEmbedByContentMatch(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const documentUri = editor.document.uri;
  const selection = editor.selection;

  const clipboardText = await vscode.env.clipboard.readText();
  if (!clipboardText.trim()) {
    void vscode.window.showInformationMessage('MMI: Clipboard has no text to match against a workbook.');
    return;
  }

  const workspaceRoot = vscode.workspace.getWorkspaceFolder(documentUri)?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showInformationMessage('MMI: Content-match search requires the document to be inside a workspace folder.');
    return;
  }

  const workbooks = await loadWorkspaceWorkbooksForContentMatch(documentUri.fsPath, workspaceRoot);
  const matches = findWorkbookContentMatches(clipboardText, workbooks);

  if (matches.length === 0) {
    void vscode.window.showInformationMessage('MMI: No matching range found in this workspace\'s workbooks.');
    return;
  }

  const picked = await pickContentMatch(matches);
  if (!picked) {
    return; // cancelled (Esc) -- never insert without an explicit pick (R1)
  }

  const currentEditor = vscode.window.activeTextEditor;
  if (!currentEditor || currentEditor.document.uri.toString() !== documentUri.toString()) {
    void vscode.window.showInformationMessage('MMI: The active editor changed before a match could be inserted.');
    return;
  }

  await currentEditor.edit((editBuilder) => editBuilder.replace(selection, buildContentMatchMarkdown(picked)));
}

async function loadWorkspaceWorkbooksForContentMatch(
  markdownFilePath: string,
  workspaceRoot: string,
  token?: vscode.CancellationToken,
): Promise<WorkbookSheetsSource[]> {
  const uris = (await vscode.workspace.findFiles(WORKBOOK_FILE_GLOB, '**/{node_modules,dist}/**'))
    .filter((uri) => uri.fsPath.startsWith(workspaceRoot))
    .slice(0, MAX_CONTENT_MATCH_WORKSPACE_FILES);

  const workbooks: WorkbookSheetsSource[] = [];
  for (const uri of uris) {
    if (token?.isCancellationRequested) {
      break;
    }
    try {
      const workbook = loadWorkbook({ absolutePath: uri.fsPath });
      workbooks.push({ filepath: toRelativeSuggestion(markdownFilePath, uri.fsPath), sheets: workbook.sheets });
    } catch {
      continue; // unreadable/unsupported file -- skip it, don't abort the whole search
    }
  }
  return workbooks;
}

/**
 * Cheap pre-filter before touching the workspace at all: a paste of a single
 * scalar value (a word, a URL, a code snippet's first line) can never usefully
 * match a rectangle search, so it is not worth the cost of even listing
 * workspace files for. Requires at least a 1x2, 2x1, or larger shape.
 */
function looksLikeTabularClipboard(plainText: string): boolean {
  const needle = parseTsv(plainText);
  if (needle.length === 0) {
    return false;
  }
  const columnCount = needle.reduce((max, row) => Math.max(max, row.length), 0);
  return needle.length >= 2 || columnCount >= 2;
}

/**
 * Content-match candidates for the paste-provider's `PasteAs` trigger only
 * (`editor.action.pasteAs` / Ctrl+.) -- see `registerNativePasteProvider` for
 * why this never runs on a normal Ctrl+V.
 */
async function getContentMatchPasteEdits(
  document: vscode.TextDocument,
  dataTransfer: vscode.DataTransfer,
  token: vscode.CancellationToken,
): Promise<vscode.DocumentPasteEdit[]> {
  const plainText = await dataTransfer.get('text/plain')?.asString();
  if (!plainText || !looksLikeTabularClipboard(plainText)) {
    return [];
  }

  const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (!workspaceRoot) {
    return [];
  }

  const workbooks = await loadWorkspaceWorkbooksForContentMatch(document.uri.fsPath, workspaceRoot, token);
  if (token.isCancellationRequested) {
    return [];
  }

  const matches = findWorkbookContentMatches(plainText, workbooks);
  return matches.map((match) => {
    const title = `MMI: ${match.filepath}#${match.sheet} (${cellRangeToA1(match.range)})`;
    return new vscode.DocumentPasteEdit(buildContentMatchMarkdown(match), title, CONTENT_MATCH_PASTE_EDIT_KIND);
  });
}

interface ContentMatchPickItem extends vscode.QuickPickItem {
  match: WorkbookContentMatch;
}

async function pickContentMatch(matches: readonly WorkbookContentMatch[]): Promise<WorkbookContentMatch | undefined> {
  const items: ContentMatchPickItem[] = matches.map((match) => ({
    label: `${match.filepath}#${match.sheet}`,
    detail: cellRangeToA1(match.range),
    match,
  }));
  const placeHolder =
    matches.length === 1
      ? 'MMI: Insert this matching range as a reference? (Esc to cancel)'
      : `MMI: ${matches.length} matching ranges found — pick one (Esc to cancel)`;

  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  return picked?.match;
}

function registerNativePasteDropProviders(context: vscode.ExtensionContext, nativePasteDropState: NativePasteDropState): void {
  registerNativePasteProvider(context, nativePasteDropState);
  registerNativeDropProvider(context, nativePasteDropState);
}

function registerCompatibilityPasteDropCommands(): vscode.Disposable[] {
  return [
    // Compatibility path for older hosts or explicit command routing.
    vscode.commands.registerTextEditorCommand(
      FALLBACK_COMMAND_IDS[0],
      createCompatibilityPasteDropCommandHandler(getPasteInsertText),
    ),
    vscode.commands.registerTextEditorCommand(
      FALLBACK_COMMAND_IDS[1],
      createCompatibilityPasteDropCommandHandler(getDropInsertText),
    ),
  ];
}

function shouldRegisterTestCommands(context: vscode.ExtensionContext): boolean {
  return context.extensionMode === vscode.ExtensionMode.Test || process.env[ENABLE_TEST_COMMANDS_ENV_VAR] === '1';
}

function registerTestCommands(nativePasteDropState: NativePasteDropState): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer',
      (dataTransfer: vscode.DataTransfer) => getPasteInsertTextFromDataTransfer(dataTransfer),
    ),
    vscode.commands.registerCommand(
      'markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer',
      (dataTransfer: vscode.DataTransfer) => getDropInsertTextFromDataTransfer(dataTransfer),
    ),
    vscode.commands.registerCommand('markdownMatrixInjector.__test.insertEmbedFromPaste', (args?: PasteDropCommandArgs) =>
      insertEmbedIntoActiveEditor(getPasteInsertText(args)),
    ),
    vscode.commands.registerCommand('markdownMatrixInjector.__test.insertEmbedFromDrop', (args?: PasteDropCommandArgs) =>
      insertEmbedIntoActiveEditor(getDropInsertText(args)),
    ),
    vscode.commands.registerTextEditorCommand(DEV_EXPORT_QUERY_EVIDENCE_COMMAND_ID, exportQueryEvidenceForEditor),
    vscode.commands.registerCommand(DEV_INSERT_SCENARIO_TEMPLATE_COMMAND_ID, () =>
      insertEmbedIntoActiveEditor(SCENARIO_OBSERVATION_TEMPLATE),
    ),
    vscode.commands.registerCommand('markdownMatrixInjector.__test.getPasteDropIntegrationState', () => ({
      ...createPasteDropIntegrationTestMetadata(),
      ...nativePasteDropState,
    })),
  ];
}

async function exportQueryEvidenceForEditor(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  if (document.isUntitled) {
    void vscode.window.showWarningMessage('MMI: Save the Markdown file before exporting query evidence.');
    return;
  }

  const {
    sourceName,
    records,
    csvText,
    jsonText,
    markdownReportText,
    csvOutputPath,
    jsonOutputPath,
    markdownOutputPath,
  } = buildQueryEvidenceExportArtifacts(document.getText(), document.uri.fsPath);
  if (records.length === 0) {
    void vscode.window.showWarningMessage('MMI: No embed query evidence found in the current Markdown file.');
    return;
  }

  try {
    await Promise.all([
      fs.writeFile(csvOutputPath, `${csvText}\n`, 'utf8'),
      fs.writeFile(jsonOutputPath, `${jsonText}\n`, 'utf8'),
      fs.writeFile(markdownOutputPath, `${markdownReportText}\n`, 'utf8'),
    ]);
    void vscode.window.showInformationMessage(
      `MMI: Exported query evidence for ${sourceName} (${records.length}) -> ${csvOutputPath}, ${jsonOutputPath}, ${markdownOutputPath}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MMI: Failed to export query evidence: ${reason}`);
  }
}

function createCompatibilityPasteDropCommandHandler(
  getInsertText: (args?: PasteDropCommandArgs) => string | undefined,
): (
  editor: vscode.TextEditor,
  edit: vscode.TextEditorEdit,
  args?: PasteDropCommandArgs,
) => Promise<void> {
  return async (editor: vscode.TextEditor, _edit: vscode.TextEditorEdit, args?: PasteDropCommandArgs) => {
    await insertEmbedIntoEditor(editor, getInsertText(args));
  };
}

async function insertEmbedIntoActiveEditor(insertText: string | undefined): Promise<void> {
  await insertEmbedIntoEditor(vscode.window.activeTextEditor, insertText);
}

async function insertEmbedIntoEditor(editor: vscode.TextEditor | undefined, insertText: string | undefined): Promise<void> {
  if (!editor || !insertText) {
    return;
  }

  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, insertText);
  });
}

function registerNativePasteProvider(context: vscode.ExtensionContext, nativePasteDropState: NativePasteDropState): void {
  // Canonical path for hosts that support native paste providers.
  if (typeof vscode.languages.registerDocumentPasteEditProvider !== 'function') {
    return;
  }

  nativePasteDropState.registeredPasteProvider = true;

  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(
      MARKDOWN_SELECTOR,
      {
        async provideDocumentPasteEdits(document, _ranges, dataTransfer, context, token) {
          const edit = await getPasteEditFromDataTransfer(dataTransfer, {
            createEdit: (insertText) =>
              new vscode.DocumentPasteEdit(insertText, NATIVE_PASTE_DROP_COMMAND_NAME, NATIVE_PASTE_DROP_EDIT_KIND),
          });
          const edits = edit ? [edit] : [];

          // Content-match search only runs for the explicit `Paste As...` /
          // Ctrl+. trigger, never for a normal Ctrl+V. VS Code's own UX for
          // `PasteAs` is "choose from a dropdown, then insert" (explicit
          // selection before insertion); a normal paste instead inserts the
          // first returned edit immediately and only offers the rest via a
          // switch-afterward widget -- returning content-match guesses there
          // would risk auto-inserting an unconfirmed guess, violating R1
          // (design review: never auto-confirm). See "作業D: 自動貼り付けへの
          // 統合" in issue-0114 for the full reasoning.
          if (context.triggerKind === vscode.DocumentPasteTriggerKind.PasteAs) {
            edits.push(...(await getContentMatchPasteEdits(document, dataTransfer, token)));
          }

          return edits;
        },
      },
      createNativePasteProviderOptions(),
    ),
  );
}

function registerNativeDropProvider(context: vscode.ExtensionContext, nativePasteDropState: NativePasteDropState): void {
  // Canonical path for hosts that support native drop providers.
  if (typeof vscode.languages.registerDocumentDropEditProvider !== 'function') {
    return;
  }

  nativePasteDropState.registeredDropProvider = true;

  context.subscriptions.push(
    vscode.languages.registerDocumentDropEditProvider(
      MARKDOWN_SELECTOR,
      {
        async provideDocumentDropEdits(_document, _position, dataTransfer, _token) {
          return getDropEditFromDataTransfer(dataTransfer, {
            createEdit: (insertText) =>
              new vscode.DocumentDropEdit(insertText, NATIVE_PASTE_DROP_COMMAND_NAME, NATIVE_PASTE_DROP_EDIT_KIND),
          });
        },
      },
      createNativeDropProviderOptions(),
    ),
  );
}

function createCompletionProvider(): vscode.CompletionItemProvider {
  return {
    async provideCompletionItems(document, position) {
      const linePrefix = getTextBeforePosition(document.lineAt(position.line).text, position.character);

      if (linePrefix.includes('![[')) {
        const candidateSets = await buildAutocompleteCandidateSets(document, linePrefix);
        const candidates = buildCompletionItems(getAutocompleteCandidates(linePrefix, candidateSets));

        return candidates.map((candidate) => {
          const item = new vscode.CompletionItem(candidate.label, toCompletionKind(candidate.kind));
          item.insertText = candidate.insertText;
          return item;
        });
      }

      const templateCandidates = getScenarioTemplateCandidates(document.getText(), linePrefix);

      if (templateCandidates.length === 0) {
        return undefined;
      }

      return templateCandidates.map((candidate) => {
        const item = new vscode.CompletionItem(candidate.label, vscode.CompletionItemKind.Snippet);
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
    const workbook = XLSX.read(await fs.readFile(resolvedFilepath), { type: 'buffer', dense: true });
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
      const workbook = XLSX.read(await fs.readFile(filepath), { type: 'buffer', dense: true, bookSheets: true });
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
