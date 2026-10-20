import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';

const KIT = fileURLToPath(new URL('../../04_Documentation/kits/basic-design', import.meta.url));
const CLI = fileURLToPath(new URL('../src/cli/mmi.ts', import.meta.url));
// Resolve the loader from this package, not from the fixture directory: the
// CLI subprocess runs with cwd set to the kit, which has no node_modules.
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const SOURCE = 'masters/基本設計.xlsx';
const DOCUMENT = '基本設計書.md';

function runCli(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, CLI, ...args],
    {
      cwd: KIT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function callMcp(name: string, args: unknown): Promise<any> {
  const server = createMcpServer({ root: KIT, version: 'parity-test' });
  const initialized = await server.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'parity', version: '0' } },
  }));
  assert.equal(JSON.parse(initialized ?? '{}').result.protocolVersion, MCP_PROTOCOL_VERSION);
  const response = await server.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name, arguments: args },
  }));
  const parsed = JSON.parse(response ?? '{}');
  if (parsed.error) throw new Error(`MCP ${name} failed: ${parsed.error.message}`);
  if (parsed.result.isError) {
    throw new Error(`MCP ${name} failed: ${parsed.result.content?.[0]?.text}`);
  }
  return parsed.result.content[0].text;
}

/** mmi's stdout appends one newline only when the rendered text lacks one. */
function assertCliText(mcp: string, cliStdout: string): void {
  assert.equal(
    cliStdout === mcp || cliStdout === `${mcp}\n`,
    true,
    'MCP text must equal the CLI text, ignoring only the CLI transport newline',
  );
}

test('inspect matches mmi inspect --json', async () => {
  const cli = runCli(['inspect', SOURCE, '--root', '.', '--json']);
  assert.equal(cli.status, 0, cli.stderr);
  const mcp = await callMcp('inspect', { source: SOURCE });
  assert.deepEqual(JSON.parse(mcp), JSON.parse(cli.stdout));
});

test('check matches mmi check --json', async () => {
  const cli = runCli(['check', '.', '--root', '.', '--json']);
  assert.equal(cli.status, 0, cli.stderr);
  const mcp = await callMcp('check', { paths: ['.'] });
  assert.deepEqual(JSON.parse(mcp), JSON.parse(cli.stdout));
});

test('render md matches mmi render stdout', async () => {
  const cli = runCli(['render', DOCUMENT, '--root', '.']);
  assert.equal(cli.status, 0, cli.stderr);
  const mcp = await callMcp('render', { document: DOCUMENT });
  assertCliText(mcp, cli.stdout);

  const html = runCli(['render', DOCUMENT, '--to', 'html', '--root', '.']);
  assert.equal(html.status, 0, html.stderr);
  const mcpHtml = await callMcp('render', { document: DOCUMENT, to: 'html' });
  assertCliText(mcpHtml, html.stdout);
});

test('schema matches mmi schema for candidate, ledger and review-decisions', async () => {
  for (const contract of ['candidate', 'ledger', 'review-decisions']) {
    const cli = runCli(['schema', contract]);
    assert.equal(cli.status, 0, cli.stderr);
    const mcp = await callMcp('schema', { contract });
    assertCliText(mcp, cli.stdout);
  }
});

test('select matches mmi select --json', async () => {
  const cli = runCli(['select', SOURCE, '--table', '機能一覧!A1:F11', '--json', '--root', '.']);
  assert.equal(cli.status, 0, cli.stderr);
  const mcp = await callMcp('select', { source: SOURCE, table: '機能一覧!A1:F11' });
  assert.deepEqual(JSON.parse(mcp), JSON.parse(cli.stdout));
});

test('find matches mmi find --json', async () => {
  const cli = runCli(['find', '機能一覧', '--json', '--root', '.']);
  assert.equal(cli.status, 0, cli.stderr);
  const mcp = await callMcp('find', { query: '機能一覧' });
  assert.deepEqual(JSON.parse(mcp), JSON.parse(cli.stdout));
});

test('handoff matches mmi handoff --json and omits values by default', async () => {
  const cli = runCli([
    'handoff',
    SOURCE,
    '--task',
    '参照案を提案する',
    '--document',
    DOCUMENT,
    '--root',
    '.',
    '--json',
  ]);
  assert.equal(cli.status, 0, cli.stderr);
  const mcp = await callMcp('handoff', {
    source: SOURCE,
    task: '参照案を提案する',
    document: DOCUMENT,
  });
  assert.deepEqual(JSON.parse(mcp), JSON.parse(cli.stdout));
  assert.equal(JSON.parse(mcp).privacy.sourceValues, 'omitted');
});

test('parity fixture stays unchanged', () => {
  const source = path.join(KIT, SOURCE);
  const document = path.join(KIT, DOCUMENT);
  const before = fs.readFileSync(source);
  const documentBefore = fs.readFileSync(document);
  runCli(['check', '.', '--root', '.', '--json']);
  runCli(['render', DOCUMENT, '--root', '.']);
  assert.deepEqual(fs.readFileSync(source), before);
  assert.deepEqual(fs.readFileSync(document), documentBefore);
});
