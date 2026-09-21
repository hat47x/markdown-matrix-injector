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
  extractHtmlTableShape,
  parseTsv,
  readTransferValuesFromDataTransfer,
  isSupportedWorkbookPath,
  suggestEmbedFromDataTransfer,
  suggestEmbedFromClipboardHtml,
  suggestEmbedFromDroppedFiles,
  suggestEmbedFromPasteDrop,
  suggestEmbedFromTransferValues,
} from '../src/dx/pasteDrop.js';

test('suggestEmbedFromClipboardHtml returns null when HTML does not expose a supported workbook path', () => {
  const html = '<table><tr><td>Copied from Google Sheets</td></tr></table>';
  assert.equal(suggestEmbedFromClipboardHtml(html), null);
});

// `sheet` and `range` are never inferred from clipboard HTML (see the doc
// comment on `suggestEmbedFromClipboardHtml`): a real Excel capture has
// neither a `<title>`/`data-sheet` sheet name nor its own file path anywhere
// in the HTML, so guessing either from HTML metadata would fabricate
// provenance MMI cannot verify. Only a real file path -- when one genuinely
// appears in the HTML body -- produces a (file-only) suggestion.

test('suggestEmbedFromClipboardHtml extracts only the filepath from workbook HTML, never a sheet or range', () => {
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
    markdown: '![[C:/docs/spec.xlsx]]',
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
    markdown: '![[/tmp/My Report.xlsx]]',
  });
});

// ── Real Excel clipboard HTML (issue-0114 "Cの完了内容", 2026-09-11) ─────────
//
// A genuine Excel range copy was captured (via 03_Implement/scripts/
// clipboard-probe) and replayed through the shipped extraction functions.
// Real Excel HTML places two <link> elements in <head>, both pointing at a
// *temporary* HTML-clip staging folder (`...\msohtmlclip<N>\...`) rather than
// the source workbook -- and never contains the real workbook path anywhere
// else. Before the fix below, `<link rel=File-List href="...clip_filelist.
// xml">` was matched because it ends in `.xml` (a supported extension),
// producing `![[C:/.../msohtmlclip1/01/clip_filelist.xml|A1:D8]]` -- a
// reference to a transient staging file, not the user's workbook. The
// fixture here reproduces that exact <head> shape (CSS/style trimmed for
// readability; everything load-bearing for the bug is kept verbatim).

const REAL_EXCEL_CLIPBOARD_HTML = [
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:x="urn:schemas-microsoft-com:office:excel"',
  'xmlns="http://www.w3.org/TR/REC-html40">',
  '<head>',
  '<meta http-equiv=Content-Type content="text/html; charset=utf-8">',
  '<meta name=ProgId content=Excel.Sheet>',
  '<meta name=Generator content="Microsoft Excel 15">',
  '<link id=Main-File rel=Main-File',
  'href="file:///C:/Users/mbs0267/AppData/Local/Temp/msohtmlclip1/01/clip.htm">',
  '<link rel=File-List',
  'href="file:///C:/Users/mbs0267/AppData/Local/Temp/msohtmlclip1/01/clip_filelist.xml">',
  '</head>',
  '<body>',
  '<table border=0 cellpadding=0 cellspacing=0 width=300>',
  '<!--StartFragment-->',
  '<tr><td>ID</td><td>操作</td></tr>',
  '<tr><td>ST-001</td><td>申請</td></tr>',
  '<!--EndFragment-->',
  '</table>',
  '</body>',
  '</html>',
].join('\r\n');

test('suggestEmbedFromClipboardHtml does not mistake Excel\'s HTML-clip staging <link> for the workbook path (real capture)', () => {
  // No suggestion is the correct outcome: the real workbook path is not
  // present anywhere in genuine Excel clipboard HTML (confirmed by
  // exhaustively scanning an actual capture), so guessing at the staging
  // file -- or any other guess -- would be wrong. Falling through to the
  // host's normal paste behaviour is the safe degradation.
  assert.equal(suggestEmbedFromClipboardHtml(REAL_EXCEL_CLIPBOARD_HTML), null);
});

test('suggestEmbedFromClipboardHtml ignores Main-File/File-List staging links even when a real workbook path is also present', () => {
  const html = REAL_EXCEL_CLIPBOARD_HTML.replace(
    '<body>',
    '<body><div data-sheet="状態遷移">file:///C:/data/設計.xlsx</div>',
  );

  const suggestion = suggestEmbedFromClipboardHtml(html);

  assert.equal(suggestion?.filepath, 'C:/data/設計.xlsx');
  assert.doesNotMatch(suggestion?.filepath ?? '', /msohtmlclip|clip_filelist/);
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
      markdown: '![[/tmp/report.xlsx]]',
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

test('extractHtmlTableShape counts rows and same-row colspan', () => {
  const html = [
    '<table>',
    '<tr><th colspan="2">Header</th><th>State</th></tr>',
    '<tr><td>1</td><td>Auth</td><td>Done</td></tr>',
    '<tr><td>2</td><td>Billing</td><td>Todo</td></tr>',
    '</table>',
  ].join('');

  assert.deepEqual(extractHtmlTableShape(html), { rowCount: 3, columnCount: 3 });
});

test('extractHtmlTableShape counts a wide table and returns undefined for a table with no cells', () => {
  const wideCells = Array.from({ length: 28 }, (_, index) => `<td>${index + 1}</td>`).join('');
  assert.deepEqual(
    extractHtmlTableShape(`<table><tr>${wideCells}</tr><tr>${wideCells}</tr></table>`),
    { rowCount: 2, columnCount: 28 },
  );
  assert.equal(extractHtmlTableShape('<table><tr></tr></table>'), undefined);
  assert.equal(extractHtmlTableShape('<p>no table here</p>'), undefined);
});

test('extractHtmlTableShape accounts for rowspan when a per-row cell count alone would under-report width', () => {
  // Row 1: A(rowspan=2), B -- 2 <td>s. Row 2: C, D -- 2 <td>s (a cell covered
  // by A's rowspan is never re-emitted). A naive max-per-row count gives 2,
  // but C/D are pushed one column right by A's rowspan, so the true width is
  // 3. This is the exact review R2 counterexample.
  const html = [
    '<table>',
    '<tr><td rowspan="2">A</td><td>B</td></tr>',
    '<tr><td>C</td><td>D</td></tr>',
    '</table>',
  ].join('');

  assert.deepEqual(extractHtmlTableShape(html), { rowCount: 2, columnCount: 3 });
});

test('extractHtmlTableShape counts a single-row copy whose <tr> sits outside the fragment markers', () => {
  // Observed in a real Excel capture (input-assistance-paste-provenance.md
  // §1.5): Excel places the sole <tr> of a single-row copy *outside*
  // <!--StartFragment-->...<!--EndFragment-->. Counting from the whole
  // <table> (not just inside the fragment markers) is what makes this work.
  const html = [
    '<table>',
    '<!--StartFragment-->',
    '<!--EndFragment-->',
    '<tr><td>ID</td><td>操作</td></tr>',
    '</table>',
  ].join('');

  assert.deepEqual(extractHtmlTableShape(html), { rowCount: 1, columnCount: 2 });
});

// ── parseTsv: Excel's plain-text clipboard payload (issue-0114 "作業D",
// 2026-09-14). Quoting rules confirmed against real Excel TSV output (see
// the function's own doc comment) -- not assumed by analogy with CSV.

test('parseTsv splits on tabs and CRLF row breaks', () => {
  assert.deepEqual(parseTsv('ID\t操作\r\nST-001\t申請\r\n'), [
    ['ID', '操作'],
    ['ST-001', '申請'],
  ]);
});

test('parseTsv reproduces a real captured Excel TSV payload verbatim, including the mid-table blank row', () => {
  // Exact bytes captured from a real Excel range copy (状態遷移!C5:F12,
  // issue-0114 "Cの完了内容"): a blank row 9 becomes a row of empty cells,
  // not a dropped row.
  const real = 'ID\t操作\t遷移後状態\t判定\r\n'
    + 'ST-001\t申請\t審査中\t要確認\r\n'
    + 'ST-002\t承認\t承認済\t合格\r\n'
    + 'ST-003\t差戻\t記入中\t要確認\r\n'
    + '\t\t\t\r\n'
    + 'ST-004\t取消\t取消済\t合格\r\n'
    + '007\t2026/04/03\tST-002\t#DIV/0!\r\n'
    + 'ST-006\t\t完了\t合格\r\n';

  assert.deepEqual(parseTsv(real), [
    ['ID', '操作', '遷移後状態', '判定'],
    ['ST-001', '申請', '審査中', '要確認'],
    ['ST-002', '承認', '承認済', '合格'],
    ['ST-003', '差戻', '記入中', '要確認'],
    ['', '', '', ''],
    ['ST-004', '取消', '取消済', '合格'],
    ['007', '2026/04/03', 'ST-002', '#DIV/0!'],
    ['ST-006', '', '完了', '合格'],
  ]);
});

test('parseTsv keeps a tab embedded in a quoted cell as one field', () => {
  // Real Excel output for a cell containing a literal tab: `"a<TAB>b"`.
  assert.deepEqual(parseTsv('Plain\tHasTab\r\nx\t"a\tb"\r\n'), [
    ['Plain', 'HasTab'],
    ['x', 'a\tb'],
  ]);
});

test('parseTsv keeps an embedded newline in a quoted cell as one logical row', () => {
  // Real Excel output for an Alt+Enter line break: `"line1<LF>line2"` -- the
  // embedded newline is a bare LF, never CRLF, inside the quotes.
  assert.deepEqual(parseTsv('A\tB\r\n1\t"line1\nline2"\r\n2\tplain\r\n'), [
    ['A', 'B'],
    ['1', 'line1\nline2'],
    ['2', 'plain'],
  ]);
});

test('parseTsv unescapes a doubled quote inside a quoted cell', () => {
  // Real Excel output for a cell needing quoting (it has a tab) that also
  // contains a literal quote: `"a<TAB>b say ""hi"""`.
  assert.deepEqual(parseTsv('"a\tb say ""hi"""\r\n'), [['a\tb say "hi"']]);
});

test('parseTsv leaves a bare quote unescaped when nothing forces quoting', () => {
  // Confirmed real Excel behaviour: a cell containing only a quote (no tab,
  // no newline) is NOT wrapped in quotes at all -- looser than strict
  // RFC4180. `say "hi"` must round-trip as plain text, not be mistaken for
  // the start of a quoted field.
  assert.deepEqual(parseTsv('A\tB\r\nx\tsay "hi"\r\n'), [
    ['A', 'B'],
    ['x', 'say "hi"'],
  ]);
});

test('parseTsv trims unquoted cells but preserves whitespace inside quoted cells', () => {
  assert.deepEqual(parseTsv('A\tB\r\n" padded "\t unquoted \r\n'), [
    ['A', 'B'],
    [' padded ', 'unquoted'],
  ]);
});

test('parseTsv returns an empty matrix for blank input', () => {
  assert.deepEqual(parseTsv(''), []);
  assert.deepEqual(parseTsv('   \r\n  '), []);
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
    markdown: '![[/tmp/report.xlsx]]',
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

test('suggestEmbedFromTransferValues centralizes paste/drop priority and normalization for shared adapters', () => {
  const unsupportedPasteClipboardValues = {
    'text/html': '<div>unsupported html payload</div>',
    'text/plain': 'file:///tmp/Paste%20Fallback.csv',
  } as const;

  assert.deepEqual(
    suggestEmbedFromTransferValues('paste', {
      clipboardValues: unsupportedPasteClipboardValues,
      droppedFiles: ['/tmp/ignored.xml'],
    }),
    {
      source: 'clipboard-html',
      filepath: '/tmp/Paste Fallback.csv',
      markdown: '![[/tmp/Paste Fallback.csv]]',
    },
  );
  assert.equal(
    suggestEmbedFromTransferValues('paste', {
      clipboardValues: unsupportedPasteClipboardValues,
      droppedFiles: ['/tmp/ignored.xml'],
    })?.markdown,
    suggestEmbedFromPasteDrop({
      clipboardHtml: unsupportedPasteClipboardValues['text/html'],
      droppedFiles: ['/tmp/Paste Fallback.csv'],
    })?.markdown,
  );

  const nativeDropClipboardValues = {
    'text/uri-list': '# comment\nfile:///tmp/Drop%20Priority.xlsx',
    'text/html': '<div data-sheet="Ignored">file:///tmp/ignored.csv</div><table><tr><td>A</td></tr></table>',
  } as const;

  assert.deepEqual(
    suggestEmbedFromTransferValues('drop', {
      clipboardValues: nativeDropClipboardValues,
      droppedFiles: ['/tmp/from-files.xml'],
    }),
    {
      source: 'file-drop',
      filepath: '/tmp/Drop Priority.xlsx',
      markdown: '![[/tmp/Drop Priority.xlsx]]',
    },
  );
  assert.deepEqual(
    suggestEmbedFromTransferValues('drop', {
      clipboardValues: nativeDropClipboardValues,
      droppedFiles: ['/tmp/from-files.xml'],
    }),
    suggestEmbedFromDroppedFiles(['/tmp/Drop Priority.xlsx', '/tmp/from-files.xml']),
  );

  const unsupportedDropClipboardValues = {
    'text/html': '<p>unsupported</p>',
    'text/plain': 'still unsupported',
  } as const;

  assert.equal(
    suggestEmbedFromTransferValues('drop', {
      clipboardValues: unsupportedDropClipboardValues,
      droppedFiles: ['/tmp/readme.md'],
    }),
    null,
  );
  assert.equal(
    suggestEmbedFromTransferValues('drop', {
      clipboardValues: unsupportedDropClipboardValues,
      droppedFiles: [],
    }),
    suggestEmbedFromDroppedFiles([]),
  );
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
    markdown: '![[/tmp/spec.xlsx]]',
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

test('readTransferValuesFromDataTransfer feeds the same shared transfer parser used by command fallback and native paste', async () => {
  const clipboardHtml = '<div data-sheet="Architecture">file:///tmp/shared-native.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
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

  const transferValues = await readTransferValuesFromDataTransfer(transfer, 'paste');
  assert.deepEqual(transferValues, {
    clipboardValues: { 'text/html': clipboardHtml },
    droppedFiles: [],
  });
  assert.equal(
    suggestEmbedFromTransferValues('paste', transferValues)?.markdown,
    getPasteInsertText({ clipboardHtml }),
  );
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
  const reads: string[] = [];
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/html') {
        return {
          async asString() {
            reads.push('text/html');
            return '<div data-sheet="Summary">file:///tmp/from-html.xlsx</div><table><tr><td>A</td></tr></table>';
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

      return undefined;
    },
  };

  assert.deepEqual(await suggestEmbedFromDataTransfer(transfer, 'paste'), {
    source: 'clipboard-html',
    filepath: '/tmp/from-html.xlsx',
    markdown: '![[/tmp/from-html.xlsx]]',
  });
  assert.deepEqual(
    suggestEmbedFromTransferValues('paste', await readTransferValuesFromDataTransfer(transfer, 'paste')),
    await suggestEmbedFromDataTransfer(transfer, 'paste'),
  );
  assert.ok(reads.includes('text/html'));
  assert.ok(reads.includes('text/plain'));
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
    markdown: '![[/tmp/from-html.xlsx]]',
  });
  assert.deepEqual(
    suggestEmbedFromTransferValues('drop', await readTransferValuesFromDataTransfer(transfer, 'drop')),
    await suggestEmbedFromDataTransfer(transfer, 'drop'),
  );
  assert.ok(reads.includes('text/uri-list'));
  assert.ok(reads.includes('text/html'));
  assert.ok(reads.includes('text/plain'));
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

  assert.equal(fallbackInsertText, '![[/tmp/adapter.xlsx]]');
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

test('native drop adapters reuse readTransferValuesFromDataTransfer plus suggestEmbedFromTransferValues instead of a dedicated parser', async () => {
  const transfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return 'file:///tmp/Shared%20Reuse.csv';
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
                fsPath: '/tmp/ignored.xml',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  const transferValues = await readTransferValuesFromDataTransfer(transfer, 'drop');
  assert.deepEqual(transferValues, {
    clipboardValues: { 'text/uri-list': 'file:///tmp/Shared%20Reuse.csv' },
    droppedFiles: ['/tmp/ignored.xml'],
  });
  assert.equal(
    suggestEmbedFromTransferValues('drop', transferValues)?.markdown,
    await getDropInsertTextFromDataTransfer(transfer),
  );
});


test('command fallback and native adapters return the same markdown for equivalent paste and drop payloads', async () => {
  const pasteArgs = {
    clipboardHtml: '<div data-sheet="Summary">file:///tmp/Shared%20Paste.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>',
  };
  const pasteTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/html') {
        return undefined;
      }

      return {
        async asString() {
          return pasteArgs.clipboardHtml ?? '';
        },
      };
    },
  };

  assert.equal(await getPasteInsertTextFromDataTransfer(pasteTransfer), getPasteInsertText(pasteArgs));

  const dropArgs = {
    droppedFiles: ['file:///tmp/Shared%20Drop.csv'],
  };
  const dropTransfer = {
    get(mimeType: string) {
      if (mimeType === 'text/uri-list') {
        return {
          async asString() {
            return 'file:///tmp/Shared%20Drop.csv';
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
                fsPath: '/tmp/ignored.xml',
              },
            };
          },
        };
      }

      return undefined;
    },
  };

  assert.equal(await getDropInsertTextFromDataTransfer(dropTransfer), getDropInsertText(dropArgs));
});

test('command fallback and native adapters preserve empty failures without over-editing', async () => {
  assert.equal(getPasteInsertText({ clipboardHtml: '<div>unsupported</div>' }), undefined);
  assert.equal(getDropInsertText({ droppedFiles: ['/tmp/readme.md'] }), undefined);

  const unsupportedTransfer = {
    get() {
      return undefined;
    },
  };

  assert.equal(await getPasteInsertTextFromDataTransfer(unsupportedTransfer), undefined);
  assert.equal(await getDropInsertTextFromDataTransfer(unsupportedTransfer), undefined);
});


test('shared parsing keeps equivalent supported, unsupported, and empty payload outcomes aligned across fallback and native surfaces', async () => {
  const html = '<div data-sheet="Summary">file:///tmp/Shared%20Boundary.xlsx</div><table><tr><td>A</td><td>B</td></tr></table>';
  const fallbackPasteArgs = { clipboardHtml: html };
  const nativePasteTransfer = {
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
  };
  assert.equal(await getPasteInsertTextFromDataTransfer(nativePasteTransfer), getPasteInsertText(fallbackPasteArgs));

  const fallbackDropArgs = { droppedFiles: ['/tmp/Shared Boundary.csv'] };
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
              fsPath: fallbackDropArgs.droppedFiles[0],
            },
          };
        },
      };
    },
  };
  assert.equal(await getDropInsertTextFromDataTransfer(nativeDropTransfer), getDropInsertText(fallbackDropArgs));

  const unsupportedPasteTransfer = {
    get(mimeType: string) {
      if (mimeType !== 'text/plain') {
        return undefined;
      }

      return {
        async asString() {
          return 'unsupported clipboard';
        },
      };
    },
  };
  assert.equal(getPasteInsertText({ clipboardHtml: '<p>unsupported clipboard</p>' }), undefined);
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
