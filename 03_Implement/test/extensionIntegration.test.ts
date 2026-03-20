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


test('native paste adapter prefers HTML/text clipboard parsing and does not fall back to dropped files when clipboard metadata is unsupported', async () => {
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
