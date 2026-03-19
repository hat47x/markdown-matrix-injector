import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferRangeFromHtmlTable,
  isSupportedWorkbookPath,
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

test('isSupportedWorkbookPath only accepts workbook-like extensions', () => {
  assert.equal(isSupportedWorkbookPath('C:\\docs\\table.xlsx'), true);
  assert.equal(isSupportedWorkbookPath('/tmp/table.csv'), true);
  assert.equal(isSupportedWorkbookPath('/tmp/table.md'), false);
});
