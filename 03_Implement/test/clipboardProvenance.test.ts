import test from 'node:test';
import assert from 'node:assert/strict';

import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import {
  decodeCopySource,
  parseObjectDescriptor,
  parseSrcOfCopy,
  r1c1ToA1,
  sourcePathFromHtml,
  verifyCopySource,
  jaClipboardRejectionPhrases,
  type RawClipboard,
} from '../src/dx/clipboardProvenance.js';

/** OBJECTDESCRIPTOR as Excel writes it: 52-byte struct, then UTF-16 strings at the declared offsets. */
function objectDescriptor(userType: string, srcOfCopy: string): Uint8Array {
  const a = Buffer.from(`${userType}\0`, 'utf16le');
  const b = Buffer.from(`${srcOfCopy}\0`, 'utf16le');
  const bytes = Buffer.alloc(52 + a.length + b.length);
  bytes.writeUInt32LE(bytes.length, 0);
  bytes.writeUInt32LE(52, 44);
  bytes.writeUInt32LE(52 + a.length, 48);
  a.copy(bytes, 52);
  b.copy(bytes, 52 + a.length);
  return Uint8Array.from(bytes);
}

function cfHtml(sourceUrl: string): Uint8Array {
  return Uint8Array.from(
    Buffer.from(`Version:1.0\r\nStartHTML:0000000193\r\nSourceURL:${sourceUrl}\r\n\r\n<html><body><table><tr><td>ID</td></tr></table></body></html>`, 'utf8'),
  );
}

const ROWS = [
  ['ID', '現在状態', '操作', '遷移先'],
  ['1', '受付', '引当', '引当済'],
  ['2', '', '出荷', '出荷済'],
];
const PASTED = ROWS.map((row) => row.join('\t')).join('\r\n') + '\r\n';
const BOOK = 'C:\\ws\\data\\設計_한글.xlsx';

function raw(overrides: Partial<RawClipboard> = {}): RawClipboard {
  return {
    html: cfHtml('file:///C:/ws/data/設計_한글.xlsx'),
    objectDescriptor: objectDescriptor('Microsoft Excel ワークシート', '状態遷移!R5C3:R7C6'),
    unicodeText: PASTED,
    ...overrides,
  };
}

/** The sheet with ROWS placed at C5 (0-based row 4, column 2). */
function sheetAtC5(rows: string[][] = ROWS) {
  const padded = [...Array(4).fill([]), ...rows.map((row) => ['', '', ...row])];
  return sheetSourceFromMatrix(padded);
}

const deps = (overrides: Partial<Parameters<typeof verifyCopySource>[2]> = {}) => ({
  workspaceRoots: ['C:\\ws'],
  platform: 'win32' as NodeJS.Platform,
  loadSheet: (path: string, sheet: string) => (path === BOOK && sheet === '状態遷移' ? sheetAtC5() : undefined),
  ...overrides,
});

test('decode: Object Descriptor gives sheet and address; SourceURL gives the path (UTF-8, non-ASCII intact)', () => {
  assert.deepEqual(parseObjectDescriptor(objectDescriptor('Microsoft Excel ワークシート', '状態遷移!R5C3:R12C6')), {
    userType: 'Microsoft Excel ワークシート',
    srcOfCopy: '状態遷移!R5C3:R12C6',
  });
  assert.equal(sourcePathFromHtml(cfHtml('file:///C:/ws/data/設計_한글.xlsx'), 'win32'), BOOK);
  assert.equal(sourcePathFromHtml(cfHtml('file:///C:/ws/data/%E8%A8%AD%E8%A8%88.xlsx'), 'win32'), 'C:\\ws\\data\\設計.xlsx');
  assert.deepEqual(decodeCopySource(raw(), 'win32'), { path: BOOK, sheet: '状態遷移', range: 'C5:F7' });
});

test('decode: sheet names with "!" split at the last one; unsafe R1C1 forms are refused', () => {
  assert.deepEqual(parseSrcOfCopy('A!B!R1C1:R2C2'), { sheet: 'A!B', range: 'A1:B2' });
  assert.equal(r1c1ToA1('R5C3'), 'C5');
  assert.equal(r1c1ToA1('C3:C4'), undefined); // column-only: must not read as the A1 range C3:C4
  assert.equal(r1c1ToA1('R5:R7'), undefined);
  assert.equal(r1c1ToA1('R7C3:R5C6'), undefined); // reversed
  assert.equal(r1c1ToA1('R1048577C1'), undefined);
});

test('decode: truncated or out-of-bounds descriptors are rejected, not trusted', () => {
  assert.equal(parseObjectDescriptor(new Uint8Array(20)), undefined);
  const bad = Buffer.from(objectDescriptor('X', 'S!R1C1'));
  bad.writeUInt32LE(9999, 48);
  assert.equal(parseObjectDescriptor(Uint8Array.from(bad))?.srcOfCopy, undefined);
  assert.equal(decodeCopySource(raw({ html: cfHtml('https://example.com/a.xlsx') }), 'win32'), undefined);
});

test('verify: the same copy, identical saved values, inside the workspace -> confirmed', () => {
  assert.deepEqual(verifyCopySource(raw(), PASTED, deps()), { ok: true, source: { path: BOOK, sheet: '状態遷移', range: 'C5:F7' } });
});

test('verify: a later copy, an unsaved edit, a filtered copy or a book outside the workspace are rejected', () => {
  assert.match(verifyCopySource(raw({ unicodeText: 'other' }), PASTED, deps()).ok ? '' : 'rejected', /rejected/u);
  const unsaved = PASTED.replace('引当済', '変更後');
  assert.equal(verifyCopySource(raw({ unicodeText: unsaved }), unsaved, deps()).ok, false);
  const filtered = [ROWS[0], ROWS[2]].map((row) => row.join('\t')).join('\r\n');
  assert.equal(verifyCopySource(raw({ unicodeText: filtered }), filtered, deps()).ok, false);
  const outside = verifyCopySource(raw(), PASTED, deps({ reasons: jaClipboardRejectionPhrases, workspaceRoots: ['C:\\other'] }));
  assert.deepEqual(outside, { ok: false, reason: jaClipboardRejectionPhrases.outsideWorkspace() });
  // Case-insensitive on Windows, but a sibling folder with a shared prefix is still outside.
  assert.equal(verifyCopySource(raw(), PASTED, deps({ workspaceRoots: ['c:\\WS'] })).ok, true);
  assert.equal(verifyCopySource(raw(), PASTED, deps({ workspaceRoots: ['C:\\w'] })).ok, false);
  assert.equal(verifyCopySource(raw(), PASTED, deps({ loadSheet: () => undefined })).ok, false);
});
