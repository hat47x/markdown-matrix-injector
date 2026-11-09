import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';

// CP932 bytes are spelled out because Node has no Shift_JIS encoder: ID,名前 / 1,山田 / 2,鈴木.
const CP932_NAME = Buffer.from([0x96, 0xbc, 0x91, 0x4f]); // 名前
const CP932_YAMADA = Buffer.from([0x8e, 0x52, 0x93, 0x63]); // 山田
const CP932_SUZUKI = Buffer.from([0x97, 0xe9, 0x96, 0xd8]); // 鈴木

function cp932Csv(): Buffer {
  return Buffer.concat([
    Buffer.from('ID,'), CP932_NAME, Buffer.from('\n1,'), CP932_YAMADA, Buffer.from('\n2,'), CP932_SUZUKI, Buffer.from('\n'),
  ]);
}

const UTF8_TEXT = 'ID,名前\n1,山田\n2,鈴木\n';

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-csv-enc-'));
  fs.writeFileSync(path.join(root, 'utf8.csv'), UTF8_TEXT, 'utf8');
  fs.writeFileSync(path.join(root, 'bom.csv'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(UTF8_TEXT, 'utf8')]));
  fs.writeFileSync(path.join(root, 'cp932.csv'), cp932Csv());
  // ASCII-only bytes are valid UTF-8 and valid CP932: the decoder order makes them UTF-8.
  fs.writeFileSync(path.join(root, 'ascii.csv'), 'ID,Name\n1,A\n2,B\n', 'utf8');
  return root;
}

async function callMcp(root: string, name: string, args: unknown): Promise<any> {
  const server = createMcpServer({ root, version: 'csv-encoding-test' });
  await server.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'csv-encoding', version: '0' } },
  }));
  const response = await server.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args },
  }));
  const parsed = JSON.parse(response ?? '{}');
  if (parsed.error) throw new Error(`MCP ${name} failed: ${parsed.error.message}`);
  if (parsed.result.isError) throw new Error(`MCP ${name} failed: ${parsed.result.content?.[0]?.text}`);
  return JSON.parse(parsed.result.content[0].text);
}

const EXPECTED: ReadonlyArray<readonly [string, string]> = [
  ['utf8.csv', 'utf-8'],
  ['bom.csv', 'utf-8-bom'],
  ['cp932.csv', 'cp932'],
  ['ascii.csv', 'utf-8'],
];

test('inspect reports the adopted CSV encoding in every Candidate locator', async () => {
  const root = makeRoot();
  for (const [file, encoding] of EXPECTED) {
    const inspected = await callMcp(root, 'inspect', { source: file });
    assert.ok(inspected.candidates.length > 0, file);
    for (const candidate of inspected.candidates) {
      assert.equal(candidate.locator.sourceEncoding, encoding, file);
    }
  }
});

test('select and find report the adopted CSV encoding next to sourceDigest', async () => {
  const root = makeRoot();
  for (const [file, encoding] of EXPECTED) {
    const inspected = await callMcp(root, 'inspect', { source: file });
    const { sheet, range, sourceDigest } = inspected.candidates[0].locator;
    const selected = await callMcp(root, 'select', { source: file, table: `${sheet}!${range}` });
    assert.equal(selected.sourceEncoding, encoding, file);
    assert.equal(selected.sourceDigest, sourceDigest, file);
  }
  const found = await callMcp(root, 'find', { query: 'ID 名前' });
  const byBook = new Map<string, { sourceEncoding?: string }>();
  for (const candidate of found.candidates) {
    const file = EXPECTED.map(([name]) => name).find((name) => candidate.reference.includes(name));
    if (file) byBook.set(file, candidate);
  }
  assert.ok(byBook.size > 0);
  for (const [file, candidate] of byBook) {
    assert.equal(candidate.sourceEncoding, EXPECTED.find(([name]) => name === file)?.[1], file);
  }
});

test('the decoded CP932 values are the same text as the UTF-8 file', async () => {
  const root = makeRoot();
  const read = async (file: string) => {
    const inspected = await callMcp(root, 'inspect', { source: file, values: 3 });
    return JSON.stringify(inspected.candidates[0].claims.find((claim: { aspect: string }) => claim.aspect === 'header')?.value);
  };
  assert.equal(await read('cp932.csv'), await read('utf8.csv'));
});

test('xlsx candidates carry no sourceEncoding', async () => {
  const kit = path.resolve(import.meta.dirname, '../../04_Documentation/kits/basic-design');
  const inspected = await callMcp(kit, 'inspect', { source: 'masters/基本設計.xlsx' });
  assert.ok(inspected.candidates.length > 0);
  for (const candidate of inspected.candidates) assert.equal('sourceEncoding' in candidate.locator, false);
});
