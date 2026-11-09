import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renderDocumentMarkdown } from '../src/cli/render.js';

// #814: how `grep=` treats full-width / half-width letters and half-width kana.
// The fixed table below is the evidence; the spec (§6 の 5) and the user manual state the same rules.
const TABLE = [
  'ID,名称',
  '1,ＡＵＴＨ-1', // full-width Latin letters
  '2,ﾃｽﾄ', // half-width katakana
  '3,auth-2',
  '4,テスト',
  '5,Auth-3',
  '',
].join('\n');

function rowsFor(grep: string): string[] {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-grep-width-'));
  fs.writeFileSync(path.join(root, 'data.csv'), TABLE, 'utf8');
  const documentPath = path.join(root, 'doc.md');
  fs.writeFileSync(documentPath, `![[./data.csv#Sheet1|A1:B6?header=first&grep=${grep}]]\n`, 'utf8');
  const output = renderDocumentMarkdown({ markdownFilePath: documentPath, workspaceRoot: root });
  return output.split(/\r?\n/).filter((line) => /^\|\s*\d+\s*\|/.test(line)).map((line) => line.split('|')[1].trim());
}

test('grep ignores ASCII case only', () => {
  assert.deepEqual(rowsFor('AUTH'), ['3', '5']);
  assert.deepEqual(rowsFor('auth'), ['3', '5']);
});

test('grep does not match full-width letters with half-width input, and the reverse', () => {
  assert.deepEqual(rowsFor('AUTH'), ['3', '5']); // not 1
  assert.deepEqual(rowsFor('ＡＵＴＨ'), ['1']); // not 3, 5
});

test('grep does not match half-width kana with full-width kana, and the reverse', () => {
  assert.deepEqual(rowsFor('テスト'), ['4']); // not 2
  assert.deepEqual(rowsFor('ﾃｽﾄ'), ['2']); // not 4
});

test('a grep with no match is an empty body, not an error', () => {
  assert.deepEqual(rowsFor('存在しない語'), []);
});

// `find` searches table descriptions (headers and the like), not cell values. It folds width
// (NFKC) in its query lexer, so a query written in the other width still reaches the table.
test('find reaches a table whose header is written in the other width', async () => {
  const { createMcpServer, MCP_PROTOCOL_VERSION } = await import('../src/cli/mcp.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-find-width-'));
  fs.writeFileSync(path.join(root, 'auth.csv'), 'AUTH,状態\n1,有効\n2,無効\n', 'utf8');
  fs.writeFileSync(path.join(root, 'billing.csv'), '請求番号,金額\n1,100\n2,200\n', 'utf8');
  const server = createMcpServer({ root, version: 'grep-width-test' });
  await server.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'grep-width', version: '0' } },
  }));
  const statusOf = async (query: string): Promise<{ status: string; files: string[] }> => {
    const response = await server.handleLine(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'find', arguments: { query } },
    }));
    const parsed = JSON.parse(response ?? '{}');
    const body = JSON.parse(parsed.result.content[0].text);
    return { status: body.status, files: body.candidates.map((c: { reference: string }) => /(auth|billing).csv/.exec(c.reference)?.[1] ?? c.reference) };
  };
  const half = await statusOf('AUTH');
  const full = await statusOf('ＡＵＴＨ');
  console.log(JSON.stringify({ half, full }));
  assert.equal(half.status, full.status);
  assert.deepEqual(half.files[0], 'auth');
  assert.deepEqual(full.files, half.files);
});
