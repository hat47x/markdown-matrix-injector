import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDropEditFromDataTransfer,
  getDropInsertText,
  getDropInsertTextFromDataTransfer,
  getPasteEditFromDataTransfer,
  getPasteInsertText,
  getPasteInsertTextFromDataTransfer,
} from '../src/dx/vscodeAdapters.js';
import {
  inferRangeFromHtmlTable,
  isSupportedWorkbookPath,
  suggestEmbedFromDataTransfer,
  suggestEmbedFromClipboardHtml,
  suggestEmbedFromDroppedFiles,
  suggestEmbedFromPasteDrop,
} from '../src/dx/pasteDrop.js';

test('suggestEmbedFromClipboardHtml returns null when HTML does not expose a supported workbook path', () => {
  const html = '<table><tr><td>Copied from Google Sheets</td></tr></table>';
  assert.equal(suggestEmbedFromClipboardHtml(html), null);
});

test('suggestEmbedFromClipboardHtml extracts filepath, sheet, and inferred range from workbook HTML metadata', () => {
  const html = [
    '<html>',
    '<head><title>Architecture</title></head>',
    '<body>',
    '<div data-sheet="Architecture">file:///C:/docs/spec.xlsx</div>',
    '<table>',
    '<tr><td>ID</td><td>Name</td><td>Status</td></tr>',
    '<tr><td>1</td><td>Auth</td><td>Done</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');

  assert.deepEqual(suggestEmbedFromClipboardHtml(html), {
    source: 'clipboard-html',
    filepath: 'C:/docs/spec.xlsx',
    sheet: 'Architecture',
    range: 'A1:C2',
    markdown: '![[C:/docs/spec.xlsx#Architecture|A1:C2]]',
  });
});

test('suggestEmbedFromClipboardHtml normalizes encoded workbook paths from clipboard html metadata', () => {
  const html = [
    '<div data-sheet="Summary">file:///tmp/My%20Report.xlsx</div>',
    '<table><tr><td>A</td></tr></table>',
  ].join('');

  assert.deepEqual(suggestEmbedFromClipboardHtml(html), {
    source: 'clipboard-html',
    filepath: '/tmp/My Report.xlsx',
    sheet: 'Summary',
    range: 'A1:A1',
    markdown: '![[/tmp/My Report.xlsx#Summary|A1:A1]]',
  });
});

test('suggestEmbedFromDroppedFiles returns the first supported file and ignores unsupported entries', () => {
  assert.deepEqual(
    suggestEmbedFromDroppedFiles(['/tmp/readme.md', 'C:\\docs\\matrix.xml', '/tmp/another.csv']),
    {
      source: 'file-drop',
      filepath: 'C:/docs/matrix.xml',
      markdown: '![[C:/docs/matrix.xml]]',
    },
  );
});

test('suggestEmbedFromDroppedFiles normalizes encoded file URIs before building markdown', () => {
  assert.deepEqual(suggestEmbedFromDroppedFiles([' file:///tmp/Design%20Matrix.csv ']), {
    source: 'file-drop',
    filepath: '/tmp/Design Matrix.csv',
    markdown: '![[/tmp/Design Matrix.csv]]',
  });
});

test('suggestEmbedFromPasteDrop prefers clipboard-derived suggestions before falling back to dropped files', () => {
  const html = '<div data-sheet="Summary">file:///tmp/report.xlsx</div><table><tr><td>A</td></tr></table>';

  assert.deepEqual(
    suggestEmbedFromPasteDrop({
      clipboardHtml: html,
      droppedFiles: ['/tmp/fallback.csv'],
    }),
    {
      source: 'clipboard-html',
      filepath: '/tmp/report.xlsx',
      sheet: 'Summary',
      range: 'A1:A1',
      markdown: '![[/tmp/report.xlsx#Summary|A1:A1]]',
    },
  );
});

test('suggestEmbedFromPasteDrop falls back to dropped files and otherwise returns null', () => {
  assert.deepEqual(suggestEmbedFromPasteDrop({ droppedFiles: ['/tmp/report.csv'] }), {
    source: 'file-drop',
    filepath: '/tmp/report.csv',
    markdown: '![[/tmp/report.csv]]',
  });

  assert.equal(suggestEmbedFromPasteDrop({ droppedFiles: ['/tmp/readme.md'] }), null);
});

test('inferRangeFromHtmlTable counts rows and colspan to infer an A1 range', () => {
  const html = [
    '<table>',
    '<tr><th colspan="2">Header</th><th>State</th></tr>',
    '<tr><td>1</td><td>Auth</td><td>Done</td></tr>',
    '<tr><td>2</td><td>Billing</td><td>Todo</td></tr>',
    '</table>',
  ].join('');

  assert.equal(inferRangeFromHtmlTable(html), 'A1:C3');
});

test('inferRangeFromHtmlTable expands beyond column Z and returns undefined for cell-less rows', () => {
  const wideCells = Array.from({ length: 28 }, (_, index) => `<td>${index + 1}</td>`).join('');
  assert.equal(inferRangeFromHtmlTable(`<table><tr>${wideCells}</tr><tr>${wideCells}</tr></table>`), 'A1:AB2');
  assert.equal(inferRangeFromHtmlTable('<table><tr></tr></table>'), undefined);
});

test('isSupportedWorkbookPath only accepts workbook-like extensions', () => {
  assert.equal(isSupportedWorkbookPath('C:\\docs\\table.xlsx'), true);
  assert.equal(isSupportedWorkbookPath('/tmp/table.csv'), true);
  assert.equal(isSupportedWorkbookPath('/tmp/table.md'), false);
});


test('suggestEmbedFromClipboardHtml returns a supported file path even when HTML includes unsupported paths first', () => {
  const html = [
    '<div>file:///tmp/readme.md</div>',
    '<div data-sheet="Summary">file:///tmp/report.xlsx</div>',
    '<table><tr><td>A</td><td>B</td></tr></table>',
  ].join('');

  assert.deepEqual(suggestEmbedFromClipboardHtml(html), {
    source: 'clipboard-html',
    filepath: '/tmp/report.xlsx',
    sheet: 'Summary',
    range: 'A1:B1',
    markdown: '![[/tmp/report.xlsx#Summary|A1:B1]]',
  });
});

test('suggestEmbedFromDroppedFiles returns null for empty or unsupported dropped file variations', () => {
  assert.equal(suggestEmbedFromDroppedFiles([]), null);
  assert.equal(suggestEmbedFromDroppedFiles(['/tmp/readme.md', '/tmp/diagram.png']), null);
});

test('suggestEmbedFromPasteDrop falls back to supported dropped files when clipboard HTML is unsupported or empty', () => {
  assert.deepEqual(
    suggestEmbedFromPasteDrop({
      clipboardHtml: '<div>Copied from unsupported source</div>',
      droppedFiles: ['/tmp/readme.md', '/tmp/report.xml'],
    }),
    {
      source: 'file-drop',
      filepath: '/tmp/report.xml',
      markdown: '![[/tmp/report.xml]]',
    },
  );

  assert.equal(suggestEmbedFromPasteDrop({ clipboardHtml: '', droppedFiles: [] }), null);
});

test('suggestEmbedFromDataTransfer reuses clipboard HTML parsing for native paste surfaces', async () => {
  const transfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/html') {
        return undefined;
      }

      return {
        async asString() {
          return '<div data-sheet="Architecture">file:///tmp/spec.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
        },
      };
    },
  };

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'paste'), {
    source: 'clipboard-html',
    filepath: '/tmp/spec.xlsx',
    sheet: 'Architecture',
    range: 'A1:B1',
    markdown: '![[/tmp/spec.xlsx#Architecture|A1:B1]]',
  });
});

test('suggestEmbedFromDataTransfer reuses dropped file parsing when paste clipboard metadata is unsupported', async () => {
  let filesRead = 0;
  const transfer = {
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

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'paste'), {
    source: 'file-drop',
    filepath: '/tmp/fallback.csv',
    markdown: '![[/tmp/fallback.csv]]',
  });
  assert.equal(filesRead, 1);
});

test('suggestEmbedFromDataTransfer preserves native drop priority across uri-list, html, plain text, and file surfaces', async () => {
  const uriListTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return '# comment\n/tmp/readme.md\nfile:///tmp/from-uri.csv';
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

      if (mimeType === 'text/plain') {
        return {
          async asString() {
            return '/tmp/from-plain.xml';
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

  assert.deepEqual(await suggestEmbedFromDataTransfer(uriListTransfer, 'drop'), {
    source: 'file-drop',
    filepath: '/tmp/from-uri.csv',
    markdown: '![[/tmp/from-uri.csv]]',
  });

  const plainTextThenFileTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/plain') {
        return {
          async asString() {
            return 'file:///tmp/from-plain.xml';
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

  assert.deepEqual(await suggestEmbedFromDataTransfer(plainTextThenFileTransfer, 'drop'), {
    source: 'clipboard-html',
    filepath: '/tmp/from-plain.xml',
    markdown: '![[/tmp/from-plain.xml]]',
  });
});

test('suggestEmbedFromDataTransfer normalizes encoded uri-list paths before falling back to file items', async () => {
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return 'file:///tmp/Encoded%20Matrix.xlsx';
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

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'drop'), {
    source: 'file-drop',
    filepath: '/tmp/Encoded Matrix.xlsx',
    markdown: '![[/tmp/Encoded Matrix.xlsx]]',
  });
});

test('paste/drop edit adapters create edits only when shared parsing resolves a suggestion', async () => {
  const pasteTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/plain') {
        return undefined;
      }

      return {
        async asString() {
          return 'file:///tmp/Adapter%20Paste.xlsx';
        },
      };
    },
  };

  assert.deepEqual(
    await getPasteEditFromDataTransfer(pasteTransfer, {
      createEdit(insertText) {
        return { insertText, source: 'paste' };
      },
    }),
    { insertText: '![[/tmp/Adapter Paste.xlsx]]', source: 'paste' },
  );

  const unsupportedTransfer = {
    get() {
      return undefined;
    },
  };

  assert.equal(
    await getDropEditFromDataTransfer(unsupportedTransfer, {
      createEdit() {
        assert.fail('createEdit should not run for unsupported drop payloads');
      },
    }),
    undefined,
  );
});


test('suggestEmbedFromDataTransfer honors paste mime priority by preferring text/html over later text/plain payloads', async () => {
  let plainReads = 0;
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/html') {
        return {
          async asString() {
            return '<div data-sheet="Summary">file:///tmp/from-html.xlsx</div><table><tr><td>A</td></tr></table>';
          },
        };
      }

      if (mimeType === 'text/plain') {
        plainReads += 1;
        return {
          async asString() {
            return '<div data-sheet="Summary">file:///tmp/from-plain.csv</div><table><tr><td>A</td></tr></table>';
          },
        };
      }

      return undefined;
    },
  };

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'paste'), {
    source: 'clipboard-html',
    filepath: '/tmp/from-html.xlsx',
    sheet: 'Summary',
    range: 'A1:A1',
    markdown: '![[/tmp/from-html.xlsx#Summary|A1:A1]]',
  });
  assert.equal(plainReads, 0);
});

test('suggestEmbedFromDataTransfer skips unsupported clipboard payloads before falling back to files for paste', async () => {
  const mimeReads: string[] = [];
  const transfer = {
    get(mimeType: string) {
      mimeReads.push(mimeType);

      if (mimeType === 'text/html') {
        return {
          async asString() {
            return '<p>unsupported html payload</p>';
          },
        };
      }

      if (mimeType === 'text/plain') {
        return {
          async asString() {
            return 'plain text with no workbook reference';
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
                fsPath: '/tmp/fallback.xml',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'paste'), {
    source: 'file-drop',
    filepath: '/tmp/fallback.xml',
    markdown: '![[/tmp/fallback.xml]]',
  });
  assert.deepEqual(mimeReads, ['text/html', 'text/plain', 'files']);
});

test('suggestEmbedFromDataTransfer normalizes uri-list paths before file fallback on drop', async () => {
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return `# comment\nfile:///tmp/Notes.md\n file:///C:/docs/Shared%20Matrix.xlsx `;
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
                fsPath: '/tmp/fallback.csv',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'drop'), {
    source: 'file-drop',
    filepath: 'C:/docs/Shared Matrix.xlsx',
    markdown: '![[C:/docs/Shared Matrix.xlsx]]',
  });
});

test('suggestEmbedFromDataTransfer keeps drop priority ordered as uri-list, html, then files', async () => {
  const reads: string[] = [];
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            reads.push('text/uri-list');
            return `# only unsupported entries\n/tmp/readme.md`;
          },
        };
      }

      if (mimeType === 'text/html') {
        return {
          async asString() {
            reads.push('text/html');
            return '<div data-sheet="Summary">file:///tmp/from-html.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
          },
        };
      }

      if (mimeType === 'text/plain') {
        return {
          async asString() {
            reads.push('text/plain');
            return '<div data-sheet="Summary">file:///tmp/from-plain.csv</div><table><tr><td>A</td></tr></table>';
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

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'drop'), {
    source: 'clipboard-html',
    filepath: '/tmp/from-html.xlsx',
    sheet: 'Summary',
    range: 'A1:B1',
    markdown: '![[/tmp/from-html.xlsx#Summary|A1:B1]]',
  });
  assert.deepEqual(reads, ['text/uri-list', 'text/html']);
});


test('vscodeAdapters command fallback and native paste surface converge on the same shared paste logic', async () => {
  const clipboardHtml = '<div data-sheet="Summary">file:///tmp/adapter.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
  const transfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/html') {
        return undefined;
      }

      return {
        async asString() {
          return clipboardHtml;
        },
      };
    },
  };

  const fallbackInsertText = getPasteInsertText({ clipboardHtml });
  const nativeInsertText = await getPasteInsertTextFromDataTransfer(transfer);

  assert.equal(fallbackInsertText, '![[/tmp/adapter.xlsx#Summary|A1:B1]]');
  assert.equal(nativeInsertText, fallbackInsertText);
});

test('vscodeAdapters command fallback and native drop surface keep uri-list, file, and html priority aligned', async () => {
  const droppedFiles = ['/tmp/notes.md', 'file:///tmp/fallback.csv'];
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return `# comment
/tmp/notes.md
file:///tmp/fallback.csv`;
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

  const fallbackInsertText = getDropInsertText({ droppedFiles });
  const nativeInsertText = await getDropInsertTextFromDataTransfer(transfer);

  assert.equal(fallbackInsertText, '![[/tmp/fallback.csv]]');
  assert.equal(nativeInsertText, fallbackInsertText);
});

