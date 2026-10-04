import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeGenericXmlUtf8,
  isXmlSpreadsheet2003Bytes,
} from '../src/core/xmlFormat.js';

const spreadsheet =
  '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"></Workbook>';

test('XML byte classification distinguishes generic XML from Spreadsheet 2003', () => {
  assert.equal(
    isXmlSpreadsheet2003Bytes(
      Buffer.from('<settings><purpose>generic</purpose></settings>', 'utf8'),
    ),
    false,
  );
  assert.equal(
    isXmlSpreadsheet2003Bytes(Buffer.from(spreadsheet, 'utf8')),
    true,
  );
});

test('XML Spreadsheet 2003 classification handles UTF-16 BOMs without weakening generic XML UTF-8 policy', () => {
  const utf16le = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(spreadsheet, 'utf16le'),
  ]);
  const body = Buffer.from(spreadsheet, 'utf16le');
  const utf16beBody = Buffer.from(body);
  for (let index = 0; index < utf16beBody.length; index += 2) {
    const first = utf16beBody[index];
    utf16beBody[index] = utf16beBody[index + 1];
    utf16beBody[index + 1] = first;
  }
  const utf16be = Buffer.concat([
    Buffer.from([0xfe, 0xff]),
    utf16beBody,
  ]);

  assert.equal(isXmlSpreadsheet2003Bytes(utf16le), true);
  assert.equal(isXmlSpreadsheet2003Bytes(utf16be), true);
  assert.throws(
    () => decodeGenericXmlUtf8(utf16le),
    /valid UTF-8/u,
  );
});
