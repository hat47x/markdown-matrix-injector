import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createMcpServer, MCP_PROTOCOL_VERSION } from '../../src/cli/mcp.js';

const CLI = fileURLToPath(new URL('../../src/cli/mmi.ts', import.meta.url));
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const QUERY = 'capzebramatch';

function runCli(root: string) {
  const run = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, CLI, 'find', QUERY, '--json', '--root', '.'],
    { cwd: root, encoding: 'utf8', timeout: 120_000 },
  );
  if (run.error) throw run.error;
  return { code: run.status, json: JSON.parse(run.stdout), stderr: run.stderr };
}

test('CLI and MCP report the real default find index cap for the same workspace', { timeout: 240_000 }, async (t) => {
  const temp = fs.realpathSync(os.tmpdir());
  const root = fs.realpathSync(fs.mkdtempSync(path.join(temp, 'mmi-find-default-cap-')));
  assert.equal(path.dirname(root), temp);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const large = path.join(root, 'a-cap.csv');
  const later = path.join(root, 'z-capzebramatch.csv');
  // Each two-row block is a separate region. The blank separator prevents
  // neighboring blocks from forming one table. No index options are overridden.
  fs.writeFileSync(large, '1\n1\n\n'.repeat(150_001));
  fs.writeFileSync(later, 'capzebramatch\nresult\n');

  const cli = runCli(root);
  assert.equal(cli.code, 1, cli.stderr);
  assert.equal(cli.json.status, 'no-match');
  assert.deepEqual(cli.json.candidates, []);
  assert.deepEqual(cli.json.coverage, {
    booksListed: 2,
    booksIndexed: 1,
    unreadable: [],
    indexCapped: true,
    cancelled: false,
    candidatesTruncated: false,
    maxCandidates: 5,
  });

  const server = createMcpServer({ root, version: 'default-cap-acceptance' });
  const send = (id: number, method: string, params: unknown) =>
    server.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  const initialized = JSON.parse(await send(1, 'initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'default-cap-acceptance', version: '0' },
  }) ?? '{}');
  assert.equal(initialized.result?.protocolVersion, MCP_PROTOCOL_VERSION);
  const response = JSON.parse(await send(2, 'tools/call', { name: 'find', arguments: { query: QUERY } }) ?? '{}');
  assert.equal(response.error, undefined);
  assert.ok(response.result);
  assert.notEqual(response.result.isError, true);
  assert.deepEqual(JSON.parse(response.result.content[0].text), cli.json);

  // With the large file removed, the same query must find the later book.
  fs.unlinkSync(large);
  const control = runCli(root);
  assert.equal(control.code, 0, control.stderr);
  assert.equal(control.json.status, 'candidates');
  assert.ok(control.json.candidates.length > 0);
  assert.equal(control.json.coverage.booksIndexed, 1);
  assert.equal(control.json.coverage.indexCapped, false);
});
