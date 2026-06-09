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
    '![[/tmp/report.xlsx#Summary|A1:A1]]',
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

  assert.equal(await getDropInsertTextFromDataTransfer(htmlThenFileTransfer), '![[/tmp/from-html.xlsx#Summary|A1:A1]]');

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

  assert.equal(await getPasteInsertTextFromDataTransfer(htmlTransfer), '![[/tmp/report.xlsx#Summary|A1:A1]]');
  assert.equal(await getDropInsertTextFromDataTransfer(fileTransfer), '![[/tmp/report.csv]]');
  assert.deepEqual(
    await getPasteEditFromDataTransfer(htmlTransfer, { createEdit: (insertText) => ({ insertText, surface: 'paste' }) }),
    { insertText: '![[/tmp/report.xlsx#Summary|A1:A1]]', surface: 'paste' },
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
      'onCommand:markdownMatrixInjector.renderEmbedForTest',
      'onCommand:markdownMatrixInjector.generateDeliveryManifest',
      'onCommand:markdownMatrixInjector.insertEmbedFromPaste',
      'onCommand:markdownMatrixInjector.insertEmbedFromDrop',
      'onLanguage:markdown',
    ],
  );
  assert.deepEqual(
    packageJson.contributes.commands.map((command: { command: string }) => command.command),
    [
      'markdownMatrixInjector.renderEmbedForTest',
      'markdownMatrixInjector.generateDeliveryManifest',
      'markdownMatrixInjector.insertEmbedFromPaste',
      'markdownMatrixInjector.insertEmbedFromDrop',
    ],
  );
});

test('native provider metadata stays API-visible without collapsing command fallback visibility', async () => {
  const packageJsonModule = await import('../package.json', { with: { type: 'json' } });
  const packageJson = packageJsonModule.default;

  assert.deepEqual(
    packageJson.contributes.commands,
    [
      {
        command: 'markdownMatrixInjector.renderEmbedForTest',
        title: 'MMI: Render Embed For Test',
      },
      {
        command: 'markdownMatrixInjector.generateDeliveryManifest',
        title: 'MMI: Generate Delivery Manifest',
      },
      {
        command: 'markdownMatrixInjector.insertEmbedFromPaste',
        title: 'MMI: Insert Embed From Paste',
      },
      {
        command: 'markdownMatrixInjector.insertEmbedFromDrop',
        title: 'MMI: Insert Embed From Drop',
      },
    ],
  );
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
  assert.match(source, /pasteMimeTypes: \[\.\.\.PASTE_MIME_TYPES\]/);
  assert.match(source, /dropMimeTypes: \[\.\.\.DROP_MIME_TYPES\]/);
  assert.match(source, /vscode\.commands\.registerCommand\('markdownMatrixInjector\.__test\.getPasteDropIntegrationState', \(\) => \(\{\s*\.\.\.createPasteDropIntegrationTestMetadata\(\),\s*\.\.\.nativePasteDropState,\s*\}\)\)/s);
  assert.match(source, /const NATIVE_PASTE_DROP_EDIT_KIND = vscode\.DocumentDropOrPasteEditKind\.Text\.append\('markdownMatrixInjector', 'embed'\);/);
  assert.match(source, /const PASTE_MIME_TYPES = \['text\/html', 'files'\] as const;/);
  assert.match(source, /const DROP_MIME_TYPES = \['text\/html', 'text\/uri-list', 'files'\] as const;/);
  assert.match(source, /hostSupportsPasteProvider: typeof vscode\.languages\.registerDocumentPasteEditProvider === 'function'/);
  assert.match(source, /hostSupportsDropProvider: typeof vscode\.languages\.registerDocumentDropEditProvider === 'function'/);
  assert.match(source, /registeredPasteProvider: false/);
  assert.match(source, /registeredDropProvider: false/);
  assert.match(source, /providedPasteEditKinds: \[NATIVE_PASTE_DROP_EDIT_KIND\],\s*pasteMimeTypes: \[\.\.\.PASTE_MIME_TYPES\]/s);
  assert.match(source, /providedDropEditKinds: \[NATIVE_PASTE_DROP_EDIT_KIND\],\s*dropMimeTypes: \[\.\.\.DROP_MIME_TYPES\]/s);
});

test('e2e lane keeps paste/drop observation ahead of autocomplete to isolate known completion instability', async () => {
  const { default: fs } = await import('node:fs/promises');
  const source = await fs.readFile(new URL('./e2e/suite/extensionHost.test.ts', import.meta.url), 'utf8');

  assert.match(source, /runStage\('paste-drop-observation', \(\) => observePasteDropBoundary\(\)\);\s*await runStage\('paste-drop-boundary'/s);
  assert.match(source, /await runStage\('paste-drop-boundary', \(\) => verifyPasteDropCoverage\(markdownFilePath, pasteDropBoundary\)\);\s*const autocompleteResult = await runStage\('autocomplete-boundary'/s);
  assert.match(source, /markdownMatrixInjector\.__test\.getPasteInsertTextFromDataTransfer/);
  assert.match(source, /markdownMatrixInjector\.__test\.getDropInsertTextFromDataTransfer/);
  assert.match(source, /markdownMatrixInjector\.__test\.getPasteDropIntegrationState/);
  assert.match(source, /Paste\/drop acceptance is observed before autocomplete so the provider lane stays independent from known completion instability\./);
});


test('extension adapters preserve shared paste/drop boundaries across command and native entry points', async () => {
  const html = '<div data-sheet="Summary">file:///tmp/shared.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
  const droppedFiles = ['/tmp/shared.csv'];

  assert.equal(getPasteInsertText({ clipboardHtml: html }), '![[/tmp/shared.xlsx#Summary|A1:B1]]');
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
  }), '![[/tmp/shared.xlsx#Summary|A1:B1]]');

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
