import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompletionItems,
  createDiagnosticsForDocument,
  getDropEditFromDataTransfer,
  getDropInsertText,
  getDropInsertTextFromDataTransfer,
  getPasteEditFromDataTransfer,
  getPasteInsertText,
  getPasteInsertTextFromDataTransfer,
  resolveWorkbookReference,
} from '../src/dx/vscodeAdapters.js';

test('resolveWorkbookReference resolves the active embed filepath and target from markdown context', () => {
  assert.deepEqual(
    resolveWorkbookReference('prefix ![[../data/roles.csv#Sheet1|A1:B2?header=first', '/workspace/docs/spec.md', '/workspace'),
    {
      rawFilepath: '../data/roles.csv',
      resolvedFilepath: '/workspace/data/roles.csv',
      target: 'Sheet1',
    },
  );
});

test('buildCompletionItems preserves candidate labels and insert text for VS Code registration', () => {
  assert.deepEqual(
    buildCompletionItems([
      { label: './roles.csv', insertText: './roles.csv', kind: 'file' },
      { label: 'Sheet1', insertText: 'Sheet1', kind: 'sheet' },
      { label: 'A1:C3', insertText: 'A1:C3', kind: 'range' },
      { label: 'mode', insertText: 'mode=', kind: 'query-param' },
    ]),
    [
      { label: './roles.csv', insertText: './roles.csv', kind: 'file' },
      { label: 'Sheet1', insertText: 'Sheet1', kind: 'sheet' },
      { label: 'A1:C3', insertText: 'A1:C3', kind: 'range' },
      { label: 'mode', insertText: 'mode=', kind: 'query-param' },
    ],
  );
});

test('card and whole-sheet diagnostics exclude query parameters from file and sheet names', async () => {
  const paths: string[] = [];
  const diagnostics = await createDiagnosticsForDocument(
    '![[./design.xlsx?mode=card&caption=設計]]\n![[./design.xlsx#状態遷移?mode=table]]',
    '/workspace/spec.md', '/workspace', {
      fileExists: async (filepath) => { paths.push(filepath); return true; },
      readFile: async () => '',
      readWorkbookSheetNames: async () => ['状態遷移'],
    },
  );
  assert.deepEqual(diagnostics, []);
  assert.ok(paths.every(p => p.endsWith('design.xlsx')));
});

test('createDiagnosticsForDocument maps missing file, invalid xml, and missing sheet into line-aware ranges', async () => {
  const text = [
    'Before',
    '![[missing.xlsx#Sheet1|A1:B2]]',
    '![[invalid.xml#SheetA|A1:B2]]',
    '![[present.xlsx#SheetZ|A1:B2]]',
  ].join('\n');

  const items = await createDiagnosticsForDocument(text, '/workspace/docs/spec.md', '/workspace', {
    fileExists: async (filepath) => !filepath.endsWith('missing.xlsx'),
    readFile: async () => '<root></root>',
    readWorkbookSheetNames: async (filepath) => (filepath.endsWith('present.xlsx') ? ['SheetA'] : ['SheetA']),
  });

  assert.deepEqual(
    items.map(({ diagnostic }) => diagnostic.code),
    ['MMI_FILE_NOT_FOUND', 'MMI_INVALID_XML', 'MMI_SHEET_NOT_FOUND'],
  );
  assert.deepEqual(
    items.map(({ range }) => [range.start.line, range.start.character, range.end.line, range.end.character]),
    [
      [1, 3, 1, 15],
      [2, 3, 2, 14],
      [3, 16, 3, 22],
    ],
  );
});


test('createDiagnosticsForDocument maps an oversized forced-table range to a coded line-aware problem', async () => {
  const raw = '![[./huge.csv#Sheet1|A1:A100001?mode=table]]';
  const text = ['Before', raw, 'After'].join('\n');
  const rangeText = 'A1:A100001';

  const items = await createDiagnosticsForDocument(text, '/workspace/docs/spec.md', '/workspace', {
    fileExists: async () => true,
    readFile: async () => '',
    readWorkbookSheetNames: async () => ['Sheet1'],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].diagnostic.code, 'MMI_TABLE_TOO_LARGE');
  assert.equal(items[0].diagnostic.priority, 3);
  assert.match(items[0].diagnostic.message, /100001 cells exceeds the 100000-cell limit/);
  assert.deepEqual(
    [items[0].range.start.line, items[0].range.start.character, items[0].range.end.line, items[0].range.end.character],
    [1, raw.indexOf(rangeText), 1, raw.indexOf(rangeText) + rangeText.length],
  );
});

test('createDiagnosticsForDocument falls back to workspace-root relative path when markdown-relative path is missing', async () => {
  const text = '![[shared/data.xlsx#Sheet1|A1:B2]]';

  const calls: string[] = [];
  const items = await createDiagnosticsForDocument(text, '/workspace/docs/spec.md', '/workspace', {
    fileExists: async (filepath) => {
      calls.push(filepath);
      return filepath === '/workspace/shared/data.xlsx';
    },
    readFile: async () => '<Workbook></Workbook>',
    readWorkbookSheetNames: async () => ['Sheet1'],
  });

  assert.deepEqual(calls, ['/workspace/docs/shared/data.xlsx', '/workspace/shared/data.xlsx']);
  assert.deepEqual(items, []);
});

test('getPasteInsertText and getDropInsertText reuse pasteDrop suggestions through command-friendly adapters', () => {
  assert.equal(
    getPasteInsertText({ clipboardHtml: '<div data-sheet="Summary">file:///tmp/report.xlsx</div><table><tr><td>A</td></tr></table>' }),
    '![[/tmp/report.xlsx]]',
  );
  assert.equal(getDropInsertText({ droppedFiles: ['/tmp/report.csv'] }), '![[/tmp/report.csv]]');
  assert.equal(getPasteInsertText(), undefined);
});




test('command-friendly adapters return undefined for unsupported or empty paste/drop inputs without duplicating fallback behavior', () => {
  assert.equal(getPasteInsertText({ clipboardHtml: '<p>plain text only</p>' }), undefined);
  assert.equal(getPasteInsertText({ droppedFiles: ['/tmp/report.csv'] }), undefined);
  assert.equal(getDropInsertText({ clipboardHtml: '<div data-sheet="Summary">file:///tmp/report.xlsx</div>' }), undefined);
  assert.equal(getDropInsertText({ droppedFiles: [] }), undefined);
  assert.equal(getDropInsertText(), undefined);
});


test('native paste adapter reuses shared parsing and falls back to files only after unsupported clipboard metadata is exhausted', async () => {
  let filesRead = 0;
  const unsupportedClipboardTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/plain') {
        return {
          async asString() {
            return 'copied from unsupported source';
          },
        };
      }

      if (mimeType === 'files') {
        filesRead += 1;
        return {
          async asString() {
            return '';
          },
          asFile() {
            return {
              uri: {
                fsPath: '/tmp/fallback.csv',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.equal(await getPasteInsertTextFromDataTransfer(unsupportedClipboardTransfer), '![[/tmp/fallback.csv]]');
  assert.equal(filesRead, 1);

  const emptyTransfer = {
    get() {
      return undefined;
    },
  };

  assert.equal(await getPasteInsertTextFromDataTransfer(emptyTransfer), undefined);
  assert.equal(
    await getPasteEditFromDataTransfer(emptyTransfer, {
      createEdit() {
        assert.fail('createEdit should not be called when pasteDrop returns no suggestion');
      },
    }),
    undefined,
  );
});


test('native drop adapter reuses pasteDrop priority across uri-list, html, and file surfaces', async () => {
  const uriListTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return `# comment\n/tmp/notes.md\n/tmp/from-uri.csv`;
          },
        };
      }

      if (mimeType === 'text/html') {
        return {
          async asString() {
            return '<div data-sheet="Summary">file:///tmp/from-html.xlsx</div><table><tr><td>A</td></tr></table>';
          },
        };
      }

      if (mimeType === 'files') {
        return {
          async asString() {
            return '';
          },
          asFile() {
            return {
              uri: {
                fsPath: '/tmp/from-file.xml',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.equal(await getDropInsertTextFromDataTransfer(uriListTransfer), '![[/tmp/from-uri.csv]]');

  const htmlThenFileTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/html') {
        return {
          async asString() {
            return '<div data-sheet="Summary">file:///tmp/from-html.xlsx</div><table><tr><td>A</td></tr></table>';
          },
        };
      }

      if (mimeType === 'files') {
        return {
          async asString() {
            return '';
          },
          asFile() {
            return {
              uri: {
                fsPath: '/tmp/from-file.xml',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.equal(await getDropInsertTextFromDataTransfer(htmlThenFileTransfer), '![[/tmp/from-html.xlsx]]');

  const filesOnlyTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'files') {
        return undefined;
      }

      return {
        async asString() {
          return '';
        },
        asFile() {
          return {
            uri: {
              fsPath: '/tmp/from-file.xml',
            },
          };
        },
      };
    },
  };

  assert.equal(await getDropInsertTextFromDataTransfer(filesOnlyTransfer), '![[/tmp/from-file.xml]]');
  assert.equal(
    await getDropEditFromDataTransfer(
      {
        get() {
          return undefined;
        },
      },
      {
        createEdit() {
          assert.fail('createEdit should not be called when drop surfaces do not produce a reusable pasteDrop suggestion');
        },
      },
    ),
    undefined,
  );
});
test('native paste/drop adapters reuse pasteDrop logic from DataTransfer surfaces', async () => {
  const htmlTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/html') {
        return undefined;
      }

      return {
        async asString() {
          return '<div data-sheet="Summary">file:///tmp/report.xlsx</div><table><tr><td>A</td></tr></table>';
        },
      };
    },
  };

  const fileTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'files') {
        return undefined;
      }

      return {
        async asString() {
          return '';
        },
        asFile() {
          return {
            uri: {
              fsPath: '/tmp/report.csv',
            },
          };
        },
      };
    },
  };

  assert.equal(await getPasteInsertTextFromDataTransfer(htmlTransfer), '![[/tmp/report.xlsx]]');
  assert.equal(await getDropInsertTextFromDataTransfer(fileTransfer), '![[/tmp/report.csv]]');
  assert.deepEqual(
    await getPasteEditFromDataTransfer(htmlTransfer, { createEdit: (insertText) => ({ insertText, surface: 'paste' }) }),
    { insertText: '![[/tmp/report.xlsx]]', surface: 'paste' },
  );
  assert.deepEqual(
    await getDropEditFromDataTransfer(fileTransfer, { createEdit: (insertText) => ({ insertText, surface: 'drop' }) }),
    { insertText: '![[/tmp/report.csv]]', surface: 'drop' },
  );
});


test('extension integration boundaries keep canonical native providers and compatibility fallback commands separate', async () => {
  const [{ default: fs }, packageJsonModule] = await Promise.all([
    import('node:fs/promises'),
    import('../package.json', { with: { type: 'json' } }),
  ]);
  const packageJson = packageJsonModule.default;
  const source = await fs.readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');

  assert.match(source, /function registerCompatibilityPasteDropCommands\(\): vscode\.Disposable\[] \{/);
  assert.match(source, /Compatibility path for older hosts or explicit command routing\./);
  assert.match(source, /registerTextEditorCommand\(\s*FALLBACK_COMMAND_IDS\[0\],\s*createCompatibilityPasteDropCommandHandler\(getPasteInsertText\),/s);
  assert.match(source, /registerTextEditorCommand\(\s*FALLBACK_COMMAND_IDS\[1\],\s*createCompatibilityPasteDropCommandHandler\(getDropInsertText\),/s);
  assert.match(source, /if \(shouldRegisterTestCommands\(context\)\) \{\s*context\.subscriptions\.push\(\.\.\.registerTestCommands\(nativePasteDropState\)\);\s*\}/s);
  assert.match(
    source,
    /const ENABLE_TEST_COMMANDS_ENV_VAR = 'MMI_ENABLE_TEST_COMMANDS';/s,
  );
  assert.match(
    source,
    /function shouldRegisterTestCommands\(context: vscode\.ExtensionContext\): boolean \{\s*return context\.extensionMode === vscode\.ExtensionMode\.Test \|\| process\.env\[ENABLE_TEST_COMMANDS_ENV_VAR\] === '1';\s*\}/s,
  );
  assert.match(source, /function registerTestCommands\(nativePasteDropState: NativePasteDropState\): vscode\.Disposable\[] \{/);
  assert.match(source, /registerCommand\('markdownMatrixInjector\.__test\.insertEmbedFromPaste', \(args\?: PasteDropCommandArgs\) =>/s);
  assert.match(source, /registerCommand\('markdownMatrixInjector\.__test\.insertEmbedFromDrop', \(args\?: PasteDropCommandArgs\) =>/s);
  assert.match(source, /const DEV_EXPORT_QUERY_EVIDENCE_COMMAND_ID = 'markdownMatrixInjector\.__dev\.exportQueryEvidence';/);
  assert.match(source, /registerTextEditorCommand\(DEV_EXPORT_QUERY_EVIDENCE_COMMAND_ID, exportQueryEvidenceForEditor\),/);
  assert.match(source, /async function exportQueryEvidenceForEditor\(editor: vscode\.TextEditor\): Promise<void> \{/);
  assert.match(source, /if \(document\.isUntitled\) \{\s*void vscode\.window\.showWarningMessage\('MMI: Save the Markdown file before exporting query evidence\.'\);\s*return;\s*\}/s);
  assert.match(source, /buildQueryEvidenceExportArtifacts\(document\.getText\(\), document\.uri\.fsPath\)/);
  assert.match(source, /if \(records\.length === 0\) \{\s*void vscode\.window\.showWarningMessage\('MMI: No embed query evidence found in the current Markdown file\.'\);\s*return;\s*\}/s);
  assert.match(source, /MMI: Exported query evidence for \$\{sourceName\} \(\$\{records\.length\}\) ->/);
  assert.match(source, /csvText/);
  assert.match(source, /jsonText/);
  assert.match(source, /markdownReportText/);
  assert.match(source, /catch \(error\) \{\s*const reason = error instanceof Error \? error\.message : String\(error\);\s*void vscode\.window\.showErrorMessage\(`MMI: Failed to export query evidence: \$\{reason\}`\);\s*\}/s);
  assert.match(source, /const DEV_INSERT_SCENARIO_TEMPLATE_COMMAND_ID = 'markdownMatrixInjector\.__dev\.insertScenarioObservationTemplate';/);
  assert.match(source, /registerCommand\(DEV_INSERT_SCENARIO_TEMPLATE_COMMAND_ID, \(\) =>\s*insertEmbedIntoActiveEditor\(SCENARIO_OBSERVATION_TEMPLATE\),/s);
  assert.match(
    source,
    /function createCompatibilityPasteDropCommandHandler\([^]*insertEmbedIntoEditor\(editor, getInsertText\(args\)\);/s,
  );
  assert.match(source, /async function insertEmbedIntoActiveEditor\(insertText: string \| undefined\): Promise<void> \{/);
  assert.match(source, /async function insertEmbedIntoEditor\(editor: vscode\.TextEditor \| undefined, insertText: string \| undefined\): Promise<void> \{/);
  assert.match(source, /editBuilder\.replace\(editor\.selection, insertText\);/);
  assert.match(source, /\.\.\.registerCompatibilityPasteDropCommands\(\),/);
  assert.match(source, /Canonical path for hosts that support native paste providers\./);
  assert.match(source, /Canonical path for hosts that support native drop providers\./);
  assert.match(source, /registerNativePasteDropProviders\(context, nativePasteDropState\);/);
  assert.match(source, /registerNativePasteProvider\(context, nativePasteDropState\);\s*registerNativeDropProvider\(context, nativePasteDropState\);/s);
  assert.match(source, /const NATIVE_PASTE_DROP_COMMAND_NAME = 'Insert Markdown Matrix embed';/);
  assert.match(source, /function registerNativePasteProvider[^]*getPasteEditFromDataTransfer\(dataTransfer[^]*NATIVE_PASTE_DROP_COMMAND_NAME/s);
  assert.match(source, /function registerNativeDropProvider[^]*getDropEditFromDataTransfer\(dataTransfer[^]*NATIVE_PASTE_DROP_COMMAND_NAME/s);
  assert.doesNotMatch(source, /provideDocumentPasteEdits[^]*getPasteInsertText\(args\)/s);
  assert.doesNotMatch(source, /provideDocumentDropEdits[^]*getDropInsertText\(args\)/s);

  assert.deepEqual(
    packageJson.activationEvents,
    [
      'onUri',
      'onCommand:markdownMatrixInjector.renderEmbedForTest',
      'onCommand:markdownMatrixInjector.generateDeliveryManifest',
      'onCommand:markdownMatrixInjector.openSource',
      'onCommand:markdownMatrixInjector.insertEmbedFromPaste',
      'onCommand:markdownMatrixInjector.insertEmbedFromDrop',
      'onCommand:markdownMatrixInjector.insertEmbedByContentMatch',
      'onCommand:markdownMatrixInjector.authorEmbed',
      'onCommand:markdownMatrixInjector.findEmbedByDescription',
      'onCommand:markdownMatrixInjector.selectLocalSemanticModel',
      'onCommand:markdownMatrixInjector.clearSearchIndex',
      'onCommand:markdownMatrixInjector.summarizeSearchObservation',
      'onCommand:markdownMatrixInjector.clearSearchObservation',
      'onCommand:markdownMatrixInjector.importFromWorkbook',
      'onCommand:markdownMatrixInjector.reviewCandidates',
      'onCommand:markdownMatrixInjector.reviewHierarchyCandidates',
      'onView:markdownMatrixInjector.tableCatalog',
      'onLanguage:markdown',
      'onCommand:markdownMatrixInjector.reviewTabularHierarchyCandidates',
    ],
  );
  assert.deepEqual(
    packageJson.contributes.commands.map((command: { command: string }) => command.command),
    [
      'markdownMatrixInjector.renderEmbedForTest',
      'markdownMatrixInjector.generateDeliveryManifest',
      'markdownMatrixInjector.openSource',
      'markdownMatrixInjector.insertEmbedFromPaste',
      'markdownMatrixInjector.insertEmbedFromDrop',
      'markdownMatrixInjector.insertEmbedByContentMatch',
      'markdownMatrixInjector.authorEmbed',
      'markdownMatrixInjector.findEmbedByDescription',
      'markdownMatrixInjector.selectLocalSemanticModel',
      'markdownMatrixInjector.clearSearchIndex',
      'markdownMatrixInjector.summarizeSearchObservation',
      'markdownMatrixInjector.clearSearchObservation',
      'markdownMatrixInjector.importFromWorkbook',
      'markdownMatrixInjector.reviewCandidates',
      'markdownMatrixInjector.reviewHierarchyCandidates',
      'markdownMatrixInjector.reviewTabularHierarchyCandidates',
      'markdownMatrixInjector.catalog.refresh',
      'markdownMatrixInjector.catalog.insertTable',
      'markdownMatrixInjector.catalog.selectFromTable',
    ],
  );
});

test('local semantic model selector stays explicitly user-invoked and palette-visible', async () => {
  const [{ default: fs }, packageJsonModule] = await Promise.all([
    import('node:fs/promises'),
    import('../package.json', { with: { type: 'json' } }),
  ]);
  const source = await fs.readFile(
    new URL('../src/extension.ts', import.meta.url),
    'utf8',
  );
  const packageJson = packageJsonModule.default;

  assert.ok(
    packageJson.activationEvents.includes(
      'onCommand:markdownMatrixInjector.selectLocalSemanticModel',
    ),
  );
  assert.ok(
    packageJson.contributes.commands.some(
      (command: { command: string }) =>
        command.command === 'markdownMatrixInjector.selectLocalSemanticModel',
    ),
  );
  assert.match(
    source,
    /registerCommand\(\s*SELECT_LOCAL_SEMANTIC_MODEL_COMMAND_ID,\s*\(\) => selectLocalSemanticModel\(\),\s*\)/s,
  );
});

test('native provider metadata stays API-visible without collapsing command fallback visibility', async () => {
  const packageJsonModule = await import('../package.json', { with: { type: 'json' } });
  const packageJson = packageJsonModule.default;

  // Titles are localized (package.nls.json / package.nls.ja.json); the palette shows "MMI: <title>".
  const englishTitles: Record<string, string> = {
    renderEmbedForTest: 'Render Embed For Test',
    generateDeliveryManifest: 'Generate Delivery Manifest',
    openSource: 'Open Embed Source',
    insertEmbedFromPaste: 'Insert Embed From Paste',
    insertEmbedFromDrop: 'Insert Embed From Drop',
    insertEmbedByContentMatch: 'Insert Embed by Content Match (search workspace workbooks for the copied range)',
    authorEmbed: 'Create or Edit Embed (file, sheet, range, preview, confirm)',
    findEmbedByDescription: 'Find Table by Description (e.g. 状態遷移表のIDと操作を見せて)',
    selectLocalSemanticModel: 'Select Existing Local Semantic Model (Ollama / LM Studio)',
    clearSearchIndex: 'Clear Table Search Index',
    summarizeSearchObservation: 'Summarize Search Observation',
    clearSearchObservation: 'Clear Search Observation',
    importFromWorkbook: 'Import from Workbook (draft with live table references and extracted image assets)',
    reviewCandidates: 'Review Import Candidates (tables, images, trees, import state, provenance)',
    reviewHierarchyCandidates: 'Review Hierarchy Candidates from Explicit Table Columns',
    reviewTabularHierarchyCandidates: 'Review Tabular Hierarchy Candidates (choose sheet and explicit hierarchy columns)',
    'catalog.refresh': 'Refresh Table Catalog',
    'catalog.insertTable': 'Insert Reference to This Table',
    'catalog.selectFromTable': 'Choose Columns and Rows, Then Insert Reference',
  };
  // Table catalog commands carry an icon for the view's title and item buttons.
  const icons: Record<string, string> = { 'catalog.refresh': '$(refresh)', 'catalog.insertTable': '$(insert)', 'catalog.selectFromTable': '$(filter)' };
  assert.deepEqual(
    packageJson.contributes.commands,
    Object.keys(englishTitles).map((id) => ({
      command: `markdownMatrixInjector.${id}`,
      title: `%mmi.command.${id}%`,
      category: 'MMI',
      ...(icons[id] ? { icon: icons[id] } : {}),
    })),
  );
  const nlsModule = await import('../package.nls.json', { with: { type: 'json' } });
  const nls = nlsModule.default as Record<string, string>;
  for (const [id, title] of Object.entries(englishTitles)) assert.equal(nls[`mmi.command.${id}`], title, id);
  assert.deepEqual(
    packageJson.activationEvents.filter((event: string) => event.startsWith('onCommand:markdownMatrixInjector.insertEmbedFrom')),
    [
      'onCommand:markdownMatrixInjector.insertEmbedFromPaste',
      'onCommand:markdownMatrixInjector.insertEmbedFromDrop',
    ],
  );
});

test('extension integration state remains source-visible for native edit kind mime types and capability flags', async () => {
  const { default: fs } = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');

  assert.match(source, /interface PasteDropIntegrationTestMetadata \{/);
  assert.match(source, /function createPasteDropIntegrationTestMetadata\(\): PasteDropIntegrationTestMetadata \{/);
  assert.match(source, /fallbackCommandIds: \[\.\.\.FALLBACK_COMMAND_IDS\]/);
  assert.match(source, /nativeEditKind: NATIVE_PASTE_DROP_EDIT_KIND\.value/);
  assert.match(source, /contentMatchPasteEditKind: CONTENT_MATCH_PASTE_EDIT_KIND\.value/);
  assert.match(source, /pasteMimeTypes: \[\.\.\.PASTE_MIME_TYPES\]/);
  assert.match(source, /dropMimeTypes: \[\.\.\.DROP_MIME_TYPES\]/);
  assert.match(source, /vscode\.commands\.registerCommand\('markdownMatrixInjector\.__test\.getPasteDropIntegrationState', \(\) => \(\{\s*\.\.\.createPasteDropIntegrationTestMetadata\(\),\s*\.\.\.nativePasteDropState,\s*\}\)\)/s);
  assert.match(source, /const NATIVE_PASTE_DROP_EDIT_KIND = vscode\.DocumentDropOrPasteEditKind\.Text\.append\('markdownMatrixInjector', 'embed'\);/);
  assert.match(source, /const PASTE_MIME_TYPES = \['text\/html', 'text\/plain', 'files'\] as const;/);
  assert.match(source, /const DROP_MIME_TYPES = \['text\/html', 'text\/uri-list', 'files'\] as const;/);
  assert.match(source, /hostSupportsPasteProvider: typeof vscode\.languages\.registerDocumentPasteEditProvider === 'function'/);
  assert.match(source, /hostSupportsDropProvider: typeof vscode\.languages\.registerDocumentDropEditProvider === 'function'/);
  assert.match(source, /registeredPasteProvider: false/);
  assert.match(source, /registeredDropProvider: false/);
  assert.match(source, /providedPasteEditKinds: \[NATIVE_PASTE_DROP_EDIT_KIND, CONTENT_MATCH_PASTE_EDIT_KIND\],\s*pasteMimeTypes: \[\.\.\.PASTE_MIME_TYPES\]/s);
  assert.match(source, /providedDropEditKinds: \[NATIVE_PASTE_DROP_EDIT_KIND\],\s*dropMimeTypes: \[\.\.\.DROP_MIME_TYPES\]/s);
});

// issue-0114 作業D: content-matching command wiring. The explicit command
// path has real Extension Host coverage (2026-09-17), and the built-in Paste
// As host-dispatch path has an automated E2E stage as of 2026-10-01. This
// source-level test remains useful as a fast structural guard for the thin VS
// Code glue even when the Extension Host lane cannot be entered.
test('standalone content-match command exists and never auto-inserts', async () => {
  const { default: fs } = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');

  assert.match(source, /const CONTENT_MATCH_PASTE_COMMAND_ID = 'markdownMatrixInjector\.insertEmbedByContentMatch';/);
  // registerCommand, not registerTextEditorCommand: the latter does not
  // support async callbacks (microsoft/vscode#178931 et al.) -- confirmed via
  // real Extension Host e2e (2026-09-17), where the original
  // registerTextEditorCommand registration silently orphaned the whole
  // function body after its first `await`.
  assert.match(
    source,
    /registerCommand\(CONTENT_MATCH_PASTE_COMMAND_ID, \(\) => insertEmbedByContentMatch\(\)\),/,
  );
  assert.match(source, /async function insertEmbedByContentMatch\(\): Promise<void> \{\s*const editor = vscode\.window\.activeTextEditor;/s);

  // Uses the shared P4 containment helper rather than string-prefix matching,
  // then applies the existing bounded search budget.
  assert.match(
    source,
    /selectContainedWorkbookFilesDetailed\(\s*markdownFilePath,\s*workspaceRoot,\s*await vscode\.workspace\.findFiles\(WORKBOOK_FILE_GLOB, '\*\*\/\{node_modules,dist\}\/\*\*'\),\s*MAX_CONTENT_MATCH_WORKSPACE_FILES,\s*\)/s,
  );

  // Every result -- one match or many -- is routed through showQuickPick and
  // the edit only happens if the user actually picked something (R1: no
  // auto-confirm).
  assert.match(source, /Some workbook data could not be searched\. The candidate list may be incomplete/);
  assert.match(source, /MMI: Content-match search failed:/);
  assert.match(source, /const picked = await pickContentMatch\(matches\);\s*if \(!picked\) \{/s);
  assert.match(source, /await vscode\.window\.showQuickPick\(items, \{ placeHolder \}\);/);
  // Revalidates the chosen source range and the destination document/selection
  // immediately before insertion instead of trusting state captured before
  // the async search and QuickPick gaps.
  assert.match(source, /const documentVersion = editor\.document\.version;/);
  assert.match(source, /contentMatchSourceStillExact\(documentUri\.fsPath, clipboardText, picked\)/);
  assert.match(
    source,
    /currentEditor\.document\.version !== documentVersion[\s\S]*!currentEditor\.selection\.isEqual\(selection\)/,
  );
  assert.match(
    source,
    /await currentEditor\.edit\(\(editBuilder\) => editBuilder\.replace\(selection, buildContentMatchMarkdown\(picked\)\)\);/,
  );
});

// issue-0114 作業D続き（2026-09-16）: automatic-paste integration. The user's
// stated intent for content-matching was to integrate it into paste itself,
// not to live only behind a separate command. Folding it into every normal
// Ctrl+V would risk auto-inserting an unconfirmed guess (VS Code's own paste
// widget behavior: "the first edit is applied immediately, the rest become a
// switch-afterward option" -- an insert-then-offer-undo flow, not an R1-safe
// choose-before-insert flow). `editor.action.pasteAs` / Ctrl+. is different:
// VS Code's documented UX for it is "a dropdown to choose the paste behavior
// BEFORE the content is inserted" -- genuinely choose-then-insert. Gating on
// `context.triggerKind === vscode.DocumentPasteTriggerKind.PasteAs` gets
// automatic-paste integration (no separate command needed for the common
// case) without weakening R1, using only VS Code's built-in paste-picker UI.
test('content-match search integrates into paste via the PasteAs trigger only, never a normal Ctrl+V', async () => {
  const { default: fs } = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');

  assert.match(source, /const CONTENT_MATCH_PASTE_EDIT_KIND = NATIVE_PASTE_DROP_EDIT_KIND\.append\('contentMatch'\);/);
  assert.match(
    source,
    /if \(context\.triggerKind === vscode\.DocumentPasteTriggerKind\.PasteAs\) \{\s*edits\.push\(\.\.\.\(await getContentMatchPasteEdits\(document, dataTransfer, token\)\)\);\s*\}/s,
  );
  // The gate reads context.triggerKind, so provideDocumentPasteEdits must
  // actually receive (not discard) document/context/token -- confirms the
  // gate can genuinely distinguish Automatic from PasteAs, not just always-on
  // or always-off by construction.
  assert.match(source, /async provideDocumentPasteEdits\(document, _ranges, dataTransfer, context, token\)/);
  assert.match(
    source,
    /const hasDirectEmbedSource = dataTransfer\.get\('text\/html'\) !== undefined \|\| dataTransfer\.get\('files'\) !== undefined;/,
  );
  assert.match(
    source,
    /const edit = hasDirectEmbedSource\s*\? await getPasteEditFromDataTransfer\(dataTransfer,/s,
  );

  assert.match(
    source,
    /async function getContentMatchPasteEdits\(\s*document: vscode\.TextDocument,\s*dataTransfer: vscode\.DataTransfer,\s*token: vscode\.CancellationToken,\s*\): Promise<vscode\.DocumentPasteEdit\[\]> \{/s,
  );
  // A bare scalar paste (a word, a URL) never reaches findFiles/loadWorkbook at
  // all -- the workspace is not touched for content clearly too small to match.
  assert.match(
    source,
    /if \(!plainText \|\| !looksLikeTabularClipboard\(plainText\)\) \{\s*return \[\];\s*\}/s,
  );
  assert.match(source, /function looksLikeTabularClipboard\(plainText: string\): boolean \{/);
  assert.match(source, /summarizeContentMatchContext\(match, 72\)/);
  // Cancellation is honoured mid-search (VS Code can cancel a PasteAs request,
  // e.g. the user pressing Escape or starting another edit).
  assert.match(source, /if \(token\?\.isCancellationRequested\) \{\s*cancelled = true;\s*break;\s*\}/s);
  assert.match(source, /if \(token\.isCancellationRequested \|\| loadResult\.cancelled\) \{\s*return \[\];\s*\}/s);
  // A zero-result search must not claim completeness when workbook loads or
  // sheet indexing were skipped.
  assert.match(source, /findWorkbookContentMatchesDetailed\(plainText, loadResult\.workbooks\)/);
  assert.match(source, /Content-match Paste As found no match in the sheets that could be searched/);
  assert.match(source, /MMI: Content-match Paste As failed:/);
  assert.match(source, /候補上限に達したシート/);
  assert.match(source, /探索対象ブックが上限/);
  assert.match(source, /const completeness = incomplete \? '（検索不完全）' : '';/);
  // Paste As gets a second validation hook after the user has chosen an edit,
  // immediately before VS Code applies it.
  assert.match(source, /async resolveDocumentPasteEdit\(pasteEdit, token\)/);
  assert.match(source, /return resolveValidatedPasteEdit\(pasteEdit as ValidatedDocumentPasteEdit, token\);/);
  assert.match(source, /document\.version !== validation\.documentVersion/);
  assert.match(source, /contentMatchSourceStillExact\(validation\.markdownFilePath, validation\.clipboardText, validation\.match\)/);
  assert.match(source, /edit\.insertText = '';/);
});

test('e2e lane keeps paste/drop observation ahead of autocomplete to isolate known completion instability', async () => {
  const { default: fs } = await import('node:fs/promises');
  const source = await fs.readFile(new URL('./e2e/suite/extensionHost.test.ts', import.meta.url), 'utf8');

  assert.match(source, /runStage\('paste-drop-observation', \(\) => observePasteDropBoundary\(\)\);\s*await runStage\('paste-drop-boundary'/s);
  // Both content-match stages (standalone command and the real built-in
  // editor.action.pasteAs dispatch) run after paste-drop-boundary but still
  // ahead of autocomplete-boundary, so they do not disturb this isolation.
  assert.match(
    source,
    /await runStage\('paste-drop-boundary', \(\) => verifyPasteDropCoverage\(markdownFilePath, pasteDropBoundary\)\);\s*await runStage\('content-match-standalone-command', \(\) => verifyContentMatchStandaloneCommand\(markdownFilePath\)\);\s*await runStage\('content-match-paste-as-host-command',[\s\S]*?verifyContentMatchPasteAsHostCommand\(markdownFilePath, pasteDropBoundary\.integrationState\),\s*\);\s*const autocompleteResult = await runStage\('autocomplete-boundary'/s,
  );
  assert.match(source, /vscode\.commands\.executeCommand\('editor\.action\.pasteAs', \{\s*preferences: \[integrationState\.contentMatchPasteEditKind\],\s*\}\)/s);
  assert.match(source, /vscode\.commands\.executeCommand\('editor\.action\.clipboardPasteAction'\)/);
  assert.match(source, /markdownMatrixInjector\.__test\.getPasteInsertTextFromDataTransfer/);
  assert.match(source, /markdownMatrixInjector\.__test\.getDropInsertTextFromDataTransfer/);
  assert.match(source, /markdownMatrixInjector\.__test\.getPasteDropIntegrationState/);
  assert.match(source, /Paste\/drop acceptance is observed before autocomplete so the provider lane stays independent from known completion instability\./);
});


test('extension adapters preserve shared paste/drop boundaries across command and native entry points', async () => {
  const html = '<div data-sheet="Summary">file:///tmp/shared.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
  const droppedFiles = ['/tmp/shared.csv'];

  assert.equal(getPasteInsertText({ clipboardHtml: html }), '![[/tmp/shared.xlsx]]');
  assert.equal(await getPasteInsertTextFromDataTransfer({
    get(mimeType: string) {
      if (mimeType !== 'text/html') {
        return undefined;
      }

      return {
        async asString() {
          return html;
        },
      };
    },
  }), '![[/tmp/shared.xlsx]]');

  assert.equal(getDropInsertText({ droppedFiles }), '![[/tmp/shared.csv]]');
  assert.equal(await getDropInsertTextFromDataTransfer({
    get(mimeType: string) {
      if (mimeType !== 'files') {
        return undefined;
      }

      return {
        async asString() {
          return '';
        },
        asFile() {
          return {
            uri: {
              fsPath: droppedFiles[0],
            },
          };
        },
      };
    },
  }), '![[/tmp/shared.csv]]');
});

test('native adapter regressions keep shared drop priority source-visible from uri-list to html to files', async () => {
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return `# comment\n/tmp/ignore.txt\nfile:///tmp/from-uri.xml`;
          },
        };
      }

      if (mimeType === 'text/html') {
        return {
          async asString() {
            return '<div data-sheet="Summary">file:///tmp/from-html.xlsx</div><table><tr><td>A</td></tr></table>';
          },
        };
      }

      if (mimeType === 'files') {
        return {
          async asString() {
            return '';
          },
          asFile() {
            return {
              uri: {
                fsPath: '/tmp/from-file.csv',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.equal(await getDropInsertTextFromDataTransfer(transfer), '![[/tmp/from-uri.xml]]');
  assert.deepEqual(
    await getDropEditFromDataTransfer(transfer, { createEdit: (insertText) => ({ insertText, via: 'native-drop' }) }),
    { insertText: '![[/tmp/from-uri.xml]]', via: 'native-drop' },
  );
});


test('shared paste/drop boundaries keep fallback commands and native adapters behaviorally identical for supported, unsupported, and empty payloads', async () => {
  const sharedPasteHtml = '<div data-sheet="Summary">file:///tmp/shared-proof.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
  const nativePasteTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/html') {
        return undefined;
      }

      return {
        async asString() {
          return sharedPasteHtml;
        },
      };
    },
  };
  assert.equal(
    await getPasteInsertTextFromDataTransfer(nativePasteTransfer),
    getPasteInsertText({ clipboardHtml: sharedPasteHtml }),
  );

  const sharedDropFiles = ['file:///tmp/shared-proof.csv'];
  const nativeDropTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'files') {
        return undefined;
      }

      return {
        async asString() {
          return '';
        },
        asFile() {
          return {
            uri: {
              fsPath: sharedDropFiles[0],
            },
          };
        },
      };
    },
  };
  assert.equal(
    await getDropInsertTextFromDataTransfer(nativeDropTransfer),
    getDropInsertText({ droppedFiles: sharedDropFiles }),
  );

  const unsupportedPasteTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/plain') {
        return undefined;
      }

      return {
        async asString() {
          return 'unsupported clipboard text';
        },
      };
    },
  };
  assert.equal(getPasteInsertText({ clipboardHtml: '<p>unsupported clipboard text</p>' }), undefined);
  assert.equal(await getPasteInsertTextFromDataTransfer(unsupportedPasteTransfer), undefined);

  const unsupportedDropTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/html') {
        return {
          async asString() {
            return '<div>unsupported host payload</div>';
          },
        };
      }
      if (mimeType === 'files') {
        return {
          async asString() {
            return '';
          },
          asFile() {
            return {
              uri: {
                fsPath: '/tmp/readme.md',
              },
            };
          },
        };
      }

      return undefined;
    },
  };
  assert.equal(getDropInsertText({ droppedFiles: ['/tmp/readme.md'] }), undefined);
  assert.equal(await getDropInsertTextFromDataTransfer(unsupportedDropTransfer), undefined);

  const emptyTransfer = {
    get() {
      return undefined;
    },
  };
  assert.equal(getPasteInsertText(), undefined);
  assert.equal(getDropInsertText(), undefined);
  assert.equal(await getPasteInsertTextFromDataTransfer(emptyTransfer), undefined);
  assert.equal(await getDropInsertTextFromDataTransfer(emptyTransfer), undefined);
});

test('every localized manifest string exists in English and Japanese, and walkthrough media ship', async () => {
  const [{ default: fs }, packageJsonModule, enModule, jaModule] = await Promise.all([
    import('node:fs'),
    import('../package.json', { with: { type: 'json' } }),
    import('../package.nls.json', { with: { type: 'json' } }),
    import('../package.nls.ja.json', { with: { type: 'json' } }),
  ]);
  const placeholders = [...JSON.stringify(packageJsonModule.default).matchAll(/"%([^%"]+)%"/gu)].map((match) => match[1]);
  assert.ok(placeholders.length > 0);
  for (const key of placeholders) {
    assert.ok((enModule.default as Record<string, string>)[key], `package.nls.json lacks ${key}`);
    assert.ok((jaModule.default as Record<string, string>)[key], `package.nls.ja.json lacks ${key}`);
  }
  assert.deepEqual(Object.keys(enModule.default).sort(), Object.keys(jaModule.default).sort());
  for (const walkthrough of packageJsonModule.default.contributes.walkthroughs) {
    for (const step of walkthrough.steps) {
      assert.ok(fs.existsSync(new URL(`../${step.media.markdown}`, import.meta.url)), step.media.markdown);
    }
  }
  const menu = packageJsonModule.default.contributes.menus['editor/context'].map((item: { command: string }) => item.command);
  assert.deepEqual(menu, [
    'markdownMatrixInjector.authorEmbed',
    'markdownMatrixInjector.findEmbedByDescription',
    'markdownMatrixInjector.insertEmbedByContentMatch',
  ]);
});
