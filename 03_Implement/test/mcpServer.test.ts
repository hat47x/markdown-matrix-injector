import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';

import {
  MCP_MAX_LINE_BYTES,
  MCP_PROTOCOL_VERSION,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
  createMcpServer,
  redactHostPaths,
  runMcpServer,
  type McpServer,
} from '../src/cli/mcp.js';

interface Fixture {
  root: string;
  document: string;
  csv: string;
  outside: string;
}

function fixture(markdown = '# 仕様\n\n![[./data/roles.csv#Sheet1|A1:C3?header=first]]\n'): Fixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-mcp-'));
  const root = path.join(base, 'workspace');
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const csv = path.join(root, 'data', 'roles.csv');
  fs.writeFileSync(csv, 'ID,操作,備考\nOP-01,申請,a|b\nOP-02,承認,\n');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(document, markdown);
  const outside = path.join(base, 'outside.csv');
  fs.writeFileSync(outside, 'SECRET\n');
  return { root, document, csv, outside };
}

function server(root: string): McpServer {
  return createMcpServer({ root, version: 'test-version' });
}

async function send(instance: McpServer, message: unknown): Promise<any> {
  const response = await instance.handleLine(JSON.stringify(message));
  return response === undefined ? undefined : JSON.parse(response);
}

async function initialize(instance: McpServer, protocolVersion = MCP_PROTOCOL_VERSION): Promise<any> {
  return send(instance, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion, capabilities: {}, clientInfo: { name: 'test', version: '0' } },
  });
}

async function call(instance: McpServer, name: string, args: unknown, id = 9): Promise<any> {
  return send(instance, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

function resultText(response: any): string {
  return response?.result?.content?.[0]?.text;
}

test('initialize returns the fixed protocol version and records negotiation', async () => {
  const instance = server(fixture().root);
  const response = await send(instance, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'future', version: '1' } },
  });

  assert.equal(response.result.protocolVersion, '2024-11-05');
  assert.deepEqual(response.result.capabilities.tools, { listChanged: false });
  assert.equal(response.result.serverInfo.name, 'markdown-matrix-injector');
  assert.equal(response.result.serverInfo.version, 'test-version');
  assert.deepEqual(response.result._meta['mmi/protocolNegotiation'], {
    requested: '2025-06-18',
    selected: '2024-11-05',
    compatible: false,
  });

  const same = await initialize(server(fixture().root));
  assert.equal(same.result._meta['mmi/protocolNegotiation'].compatible, true);
});

test('notifications/initialized has no response and enables tools', async () => {
  const instance = server(fixture().root);
  assert.equal(
    await instance.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })),
    undefined,
  );
  const listed = await send(instance, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.result.tools.length, MCP_TOOL_NAMES.length);
});

test('tools/list exposes the read-only surface and no write tool', async () => {
  const instance = server(fixture().root);
  await initialize(instance);
  const response = await send(instance, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = response.result.tools.map((tool: { name: string }) => tool.name);

  for (const required of [
    'inspect',
    'check',
    'render',
    'select',
    'find',
    'handoff',
    'validate-proposal',
    'validate-selection',
    'validate-transformation',
    'schema',
  ]) {
    assert.equal(names.includes(required), true, `missing tool ${required}`);
  }
  for (const forbidden of ['extract', 'import', 'materialize', 'html-commit']) {
    assert.equal(names.includes(forbidden), false, `write tool ${forbidden} must not be exposed`);
  }
  for (const tool of response.result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(typeof tool.description, 'string');
  }
  assert.deepEqual(names, [...MCP_TOOL_NAMES]);
});

test('every tool rejects an argument its inputSchema does not declare', async () => {
  const f = fixture();
  const instance = server(f.root);
  await initialize(instance);

  for (const tool of MCP_TOOLS) {
    const properties = Object.keys((tool.inputSchema.properties ?? {}) as Record<string, unknown>);
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} declares no extras`);
    const response = await call(instance, tool.name, { notAnArgument: 1 });
    assert.equal(response.error.code, -32602, `${tool.name} must reject an unknown argument`);
    assert.match(response.error.message, /Unknown argument "notAnArgument"/u);
    for (const accepted of properties) {
      assert.ok(response.error.message.includes(accepted), `${tool.name} lists ${accepted}`);
    }
  }

  // A misspelled version pin must not be silently dropped into an unpinned success.
  const fakeDigest = `sha256:${'0'.repeat(64)}`;
  for (const typo of ['expectedSourceDigests', 'expectedSourcedigest']) {
    const inspect = await call(instance, 'inspect', { source: 'data/roles.csv', [typo]: fakeDigest });
    assert.equal(inspect.error.code, -32602, `inspect ${typo}`);
    const select = await call(instance, 'select', {
      source: 'data/roles.csv', table: 'Sheet1!A1:C3', [typo]: fakeDigest,
    });
    assert.equal(select.error.code, -32602, `select ${typo}`);
  }
});

test('render accepts only Markdown documents and never returns raw file content', async () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, '.env'), 'SECRET=abc\n');
  fs.writeFileSync(path.join(f.root, 'notes.txt'), 'plain text\n');
  fs.writeFileSync(path.join(f.root, 'book.xlsx'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  fs.writeFileSync(path.join(f.root, 'UPPER.MD'), '# upper\n');
  const instance = server(f.root);
  await initialize(instance);

  for (const document of ['.env', 'notes.txt', 'book.xlsx', 'data/roles.csv']) {
    for (const to of ['md', 'html']) {
      const response = await call(instance, 'render', { document, to });
      assert.equal(response.error.code, -32602, `${document} (${to})`);
      assert.match(response.error.message, /must be a Markdown file/u);
      assert.ok(!JSON.stringify(response).includes('SECRET=abc'));
    }
  }
  assert.equal((await call(instance, 'render', { document: 'spec.md' })).result.isError, false);
  assert.equal((await call(instance, 'render', { document: 'UPPER.MD' })).result.isError, false);
});

test('ping and unknown methods follow JSON-RPC errors', async () => {
  const instance = server(fixture().root);
  await initialize(instance);
  const pong = await send(instance, { jsonrpc: '2.0', id: 3, method: 'ping' });
  assert.deepEqual(pong.result, {});

  const unknown = await send(instance, { jsonrpc: '2.0', id: 4, method: 'resources/list' });
  assert.equal(unknown.error.code, -32601);

  const beforeInitialize = await send(server(fixture().root), {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/list',
  });
  assert.equal(beforeInitialize.error.code, -32002);
});

test('malformed JSON, batches, invalid ids, unknown tools and wrong args never crash', async () => {
  const instance = server(fixture().root);
  await initialize(instance);

  const parseError = JSON.parse((await instance.handleLine('{not json')) ?? '{}');
  assert.equal(parseError.error.code, -32700);

  const batch = JSON.parse((await instance.handleLine('[{"jsonrpc":"2.0","id":1,"method":"ping"}]')) ?? '{}');
  assert.equal(batch.error.code, -32600);

  const badId = await send(instance, { jsonrpc: '1.0', id: 1, method: 'ping' });
  assert.equal(badId.error.code, -32600);

  const unknownTool = await call(instance, 'extract', {});
  assert.equal(unknownTool.error.code, -32602);
  assert.match(unknownTool.error.message, /Unknown tool: extract/u);

  const wrongArgs = await call(instance, 'inspect', { source: 42 });
  assert.equal(wrongArgs.error.code, -32602);

  const nonObjectArgs = await send(instance, {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'inspect', arguments: [] },
  });
  assert.equal(nonObjectArgs.error.code, -32602);

  const stillAlive = await send(instance, { jsonrpc: '2.0', id: 7, method: 'ping' });
  assert.deepEqual(stillAlive.result, {});
});

test('oversized input is rejected without breaking the following request', async () => {
  const instance = server(fixture().root);
  await initialize(instance);
  const oversized = await instance.handleLine('x'.repeat(MCP_MAX_LINE_BYTES + 1));
  const response = JSON.parse(oversized ?? '{}');
  assert.equal(response.error.code, -32600);
  assert.match(response.error.message, /exceeds/u);

  const pong = await send(instance, { jsonrpc: '2.0', id: 2, method: 'ping' });
  assert.deepEqual(pong.result, {});
});

test('inspect returns structure only by default and values only when requested', async () => {
  const { root } = fixture();
  const instance = server(root);
  await initialize(instance);

  const structure = await call(instance, 'inspect', { source: 'data/roles.csv' });
  assert.equal(structure.result.isError, false);
  const inspected = JSON.parse(resultText(structure));
  assert.equal(inspected.candidateContract, 'mmi.semantic-candidate/v1');
  assert.equal(inspected.source, './data/roles.csv');
  assert.equal(inspected.sheets[0].regions[0].headers.join(','), 'ID,操作,備考');
  assert.equal(inspected.sheets[0].regions[0].sample, undefined);

  const withValues = await call(instance, 'inspect', { source: 'data/roles.csv', values: 1 });
  const sampled = JSON.parse(resultText(withValues));
  assert.deepEqual(sampled.sheets[0].regions[0].sample, [['OP-01', '申請', 'a|b']]);
});

test('check returns the CLI JSON shape', async () => {
  const { root } = fixture('# 仕様\n\n![[./data/missing.csv]]\n');
  const instance = server(root);
  await initialize(instance);
  const response = await call(instance, 'check', { paths: ['.'] });
  const result = JSON.parse(resultText(response));
  assert.equal(result.errors, 1);
  assert.equal(result.problems[0].code, 'MMI_FILE_NOT_FOUND');
  assert.equal(result.problems[0].file, 'spec.md');
});

test('schema returns a public contract and rejects an unknown contract', async () => {
  const instance = server(fixture().root);
  await initialize(instance);
  const candidate = await call(instance, 'schema', { contract: 'candidate' });
  const parsed = JSON.parse(resultText(candidate));
  assert.equal(parsed['x-mmi-contract'], 'mmi.semantic-candidate/v1');

  for (const contract of ['ledger', 'review-decisions']) {
    const response = await call(instance, 'schema', { contract });
    assert.equal(JSON.parse(resultText(response))['x-mmi-contract'], `mmi.${contract}/v1`);
  }

  const unknown = await call(instance, 'schema', { contract: 'other' });
  assert.equal(unknown.error.code, -32602);
});

test('workspace boundary rejects traversal, absolute escapes and symlink escapes', async (t) => {
  const { root, outside } = fixture();
  const instance = server(root);
  await initialize(instance);

  for (const source of ['../outside.csv', outside]) {
    const response = await call(instance, 'inspect', { source });
    assert.equal(response.result.isError, true, `source ${source} should be rejected`);
    assert.match(resultText(response), /outside the MCP workspace root/u);
  }

  const check = await call(instance, 'check', { paths: ['..'] });
  assert.equal(check.result.isError, true);

  const render = await call(instance, 'render', { document: '../outside.md' });
  assert.equal(render.result.isError, true);

  const find = await call(instance, 'find', { query: 'secret', from: outside });
  assert.equal(find.result.isError, true);

  let linkedSource = path.join('data', 'linked.csv');
  try {
    fs.symlinkSync(outside, path.join(root, linkedSource), 'file');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EACCES') throw error;
    // Windows often permits a directory junction where a file symlink needs
    // elevation; a junction is still a link that resolves outside the root.
    try {
      fs.symlinkSync(path.dirname(outside), path.join(root, 'linked-dir'), 'junction');
      linkedSource = path.join('linked-dir', path.basename(outside));
    } catch (junctionError) {
      const junctionCode = (junctionError as NodeJS.ErrnoException).code;
      if (junctionCode === 'EPERM' || junctionCode === 'EACCES') {
        t.skip('symlink creation is not permitted in this environment');
        return;
      }
      throw junctionError;
    }
  }
  const viaSymlink = await call(instance, 'inspect', { source: linkedSource });
  assert.equal(viaSymlink.result.isError, true);
  assert.match(resultText(viaSymlink), /symbolic link/u);

  const findAcrossLink = await call(instance, 'find', { query: 'secret' });
  assert.equal(findAcrossLink.result.isError, true);
  assert.match(resultText(findAcrossLink), /link resolves outside/u);
});

test('read-only tools do not change sources, documents or the workspace listing', async () => {
  const { root, document, csv, outside } = fixture();
  const instance = server(root);
  await initialize(instance);

  const csvBefore = fs.readFileSync(csv);
  const documentBefore = fs.readFileSync(document);
  const outsideBefore = fs.readFileSync(outside);
  const listingBefore = fs.readdirSync(root).sort();
  const dataListingBefore = fs.readdirSync(path.join(root, 'data')).sort();

  assert.equal((await call(instance, 'inspect', { source: 'data/roles.csv', values: 1 })).result.isError, false);
  assert.equal((await call(instance, 'check', { paths: ['.'] })).result.isError, false);
  assert.equal((await call(instance, 'render', { document: 'spec.md' })).result.isError, false);
  assert.equal((await call(instance, 'select', {
    source: 'data/roles.csv',
    table: 'Sheet1!A1:C3',
  })).result.isError, false);
  assert.equal((await call(instance, 'handoff', {
    source: 'data/roles.csv',
    task: '参照案を提案する',
    document: 'spec.md',
  })).result.isError, false);

  assert.deepEqual(fs.readFileSync(csv), csvBefore);
  assert.deepEqual(fs.readFileSync(document), documentBefore);
  assert.deepEqual(fs.readFileSync(outside), outsideBefore);
  assert.deepEqual(fs.readdirSync(root).sort(), listingBefore);
  assert.deepEqual(fs.readdirSync(path.join(root, 'data')).sort(), dataListingBefore);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});

test('runMcpServer reads one JSON message per line and writes one per response', async () => {
  const { root } = fixture();
  const responses: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      responses.push(chunk.toString());
      callback();
    },
  });
  const input = Readable.from([
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'pipe', version: '0' } },
    })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`,
  ]);

  await runMcpServer({ root, version: 'test-version', input, output });
  const lines = responses.join('').trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].result.protocolVersion, '2024-11-05');
  assert.equal(lines[1].result.tools.some((tool: { name: string }) => tool.name === 'inspect'), true);
});

test('runMcpServer rejects a line over the limit without buffering it and keeps serving', async () => {
  const { root } = fixture();
  const responses: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      responses.push(chunk.toString());
      callback();
    },
  });
  const piece = Buffer.alloc(1024 * 1024, 0x78);
  // About 700 MiB with no newline: far over the limit, streamed in 1 MiB pieces.
  async function* chunks(): AsyncGenerator<Buffer> {
    for (let index = 0; index < 700; index += 1) yield piece;
    yield Buffer.from(`\n${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' })}\n`);
  }
  await runMcpServer({ root, version: 'test-version', input: Readable.from(chunks()), output });
  const lines = responses.join('').trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].error.code, -32600);
  assert.equal(lines[0].id, null);
  assert.equal(lines[1].id, 7);
  assert.deepEqual(lines[1].result, {});
});

test('failed tool calls carry a structured code and no host absolute path', async () => {
  const { root, document, outside } = fixture();
  fs.writeFileSync(path.join(root, 'broken.json'), '{ not json');
  const instance = server(root);
  await initialize(instance);

  const failure = (response: any): { code: string; message: string } => {
    assert.equal(response.result.isError, true);
    const detail = response.result.structuredContent;
    assert.equal(detail.contract, 'mmi.mcp-error/v1');
    assert.deepEqual(response.result._meta['mmi/error'], detail);
    assert.equal(resultText(response), `mmi: ${detail.message}`);
    // The workspace root and the temp directory are host paths.
    assert.ok(!resultText(response).includes(root), 'root path leaked');
    assert.ok(!resultText(response).includes(path.dirname(root)), 'host path leaked');
    return detail;
  };

  const outsideRoot = failure(await call(instance, 'inspect', { source: '../outside.csv' }));
  assert.equal(outsideRoot.code, 'outside-root');
  assert.equal(failure(await call(instance, 'inspect', { source: outside })).code, 'outside-root');
  assert.equal(failure(await call(instance, 'check', { paths: ['..'] })).code, 'outside-root');

  const missing = failure(await call(instance, 'inspect', { source: 'data/nonexist.csv' }));
  assert.equal(missing.code, 'not-found');
  assert.match(missing.message, /nonexist\.csv/u);
  assert.equal(failure(await call(instance, 'render', { document: 'nonexist.md' })).code, 'not-found');
  assert.equal(failure(await call(instance, 'select', { source: 'data/nonexist.csv', table: 'A1:B2' })).code, 'not-found');

  const broken = failure(await call(instance, 'validate-selection', {
    proposal: 'broken.json',
    package: 'broken.json',
  }));
  assert.equal(broken.code, 'parse-failed');

  const stale = failure(await call(instance, 'inspect', {
    source: 'data/roles.csv',
    expectedSourceDigest: 'sha256:' + '0'.repeat(64),
  }));
  assert.equal(stale.code, 'digest-mismatch');

  // A successful call carries no error detail.
  const ok = await call(instance, 'inspect', { source: 'data/roles.csv', values: 1 });
  assert.equal(ok.result.isError, false);
  assert.equal(ok.result.structuredContent, undefined);
  assert.ok(fs.existsSync(document));

  // A broken default ledger is a ledger failure, not an anonymous tool failure
  // that looks like a problem with the source (#730). The tools that never read
  // the ledger are unaffected.
  fs.writeFileSync(path.join(root, 'mmi-ledger.json'), '{broken');
  const ledgerBroken = failure(await call(instance, 'inspect', { source: 'data/roles.csv' }));
  assert.equal(ledgerBroken.code, 'parse-failed');
  assert.match(ledgerBroken.message, /ledger mmi-ledger.json could not be applied/u);
  const select = await call(instance, 'select', { source: 'data/roles.csv', table: 'A1:B2' });
  assert.equal(select.result.isError, false);
  fs.rmSync(path.join(root, 'mmi-ledger.json'));
  assert.equal((await call(instance, 'inspect', { source: 'data/roles.csv', values: 1 })).result.isError, false);
});

test('redactHostPaths keeps root-relative paths and hides other absolute paths', () => {
  const root = path.join(os.tmpdir(), 'ws');
  assert.equal(
    redactHostPaths(`ENOENT: no such file or directory, open '${path.join(root, 'data', 'a.csv')}'`, root),
    "ENOENT: no such file or directory, open 'data" + path.sep + "a.csv'",
  );
  assert.equal(redactHostPaths("open 'C:\\Users\\y\\secret.csv'", root), "open '<path>'");
  assert.equal(redactHostPaths("open '/home/x/secret.csv'", root), "open '<path>'");
  assert.equal(redactHostPaths('Argument "source" is outside the MCP workspace root.', root),
    'Argument "source" is outside the MCP workspace root.');
});
