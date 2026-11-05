import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';

const marker = 'SYNTHETIC_ONLY_824';

async function setup(t: import('node:test').TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-mcp-direct-'));
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'safe.csv'), 'id,value\n1,SAFE_ONLY\n');
  fs.writeFileSync(path.join(outside, 'demo.csv'), 'id,value\n1,' + marker + '\n');
  try { fs.symlinkSync(outside, path.join(root, 'link'), 'junction'); }
  catch (error) {
    fs.rmSync(base, { recursive: true, force: true });
    if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { t.skip('symlink creation is not permitted'); return undefined; }
    throw error;
  }
  t.after(() => { t.mock.restoreAll(); fs.rmSync(base, { recursive: true, force: true }); });
  const server = createMcpServer({ root, version: 'test' });
  await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } } }));
  const call = async (name: string, args: object) => {
    const response = await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }));
    assert.ok(response);
    return JSON.parse(response);
  };
  return { base, root, outside, target: path.join(root, 'link', 'demo.csv'), call };
}

function assertUnverified(response: any, base: string, outside: string) {
  assert.equal(response.result?.isError, true);
  assert.equal(response.result?.structuredContent?.code, 'tool-failed');
  const text = JSON.stringify(response);
  assert.match(text, /Unable to verify workspace/u);
  assert.doesNotMatch(text, /SYNTHETIC_ONLY_824|synthetic denied|EACCES/u);
  assert.equal(text.includes(base), false);
  assert.equal(text.includes(outside), false);
}

test('MCP inspect rejects candidate realpath failures without exposing outside content', async (t) => {
  const x = await setup(t); if (!x) return;
  const baseline = await x.call('inspect', { source: 'link/demo.csv', values: 2 });
  assert.equal(baseline.result?.structuredContent?.code, 'outside-root');
  assert.equal(JSON.stringify(baseline).includes(marker), false);
  const original = fs.realpathSync.bind(fs);
  t.mock.method(fs, 'realpathSync', ((p: fs.PathLike, options?: unknown) => {
    if (path.resolve(String(p)) === path.resolve(x.target)) throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
    return original(p, options as never);
  }) as typeof fs.realpathSync);
  assertUnverified(await x.call('inspect', { source: 'link/demo.csv', values: 2 }), x.base, x.outside);
});

test('MCP inspect rejects unverified root and lstat failures', async (t) => {
  const x = await setup(t); if (!x) return;
  const originalReal = fs.realpathSync.bind(fs);
  const mock = t.mock.method(fs, 'realpathSync', ((p: fs.PathLike, options?: unknown) => {
    if (path.resolve(String(p)) === path.resolve(x.root)) throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
    return originalReal(p, options as never);
  }) as typeof fs.realpathSync);
  assertUnverified(await x.call('inspect', { source: 'safe.csv', values: 2 }), x.base, x.outside);
  mock.mock.restore();
  const originalStat = fs.lstatSync.bind(fs);
  t.mock.method(fs, 'lstatSync', ((p: fs.PathLike, options?: unknown) => {
    if (path.resolve(String(p)) === path.resolve(x.target)) throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
    return originalStat(p, options as never);
  }) as typeof fs.lstatSync);
  assertUnverified(await x.call('inspect', { source: 'link/demo.csv', values: 2 }), x.base, x.outside);
});

test('MCP inspect rejects unverified ancestor and distinguishes known missing', async (t) => {
  const x = await setup(t); if (!x) return;
  const safe = await x.call('inspect', { source: 'safe.csv', values: 2 });
  assert.equal(safe.result?.isError, false);
  const missing = await x.call('inspect', { source: 'missing.csv' });
  assert.equal(missing.result?.structuredContent?.code, 'not-found');
  const link = path.join(x.root, 'link');
  const original = fs.realpathSync.bind(fs);
  t.mock.method(fs, 'realpathSync', ((p: fs.PathLike, options?: unknown) => {
    if (path.resolve(String(p)) === path.resolve(link)) throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
    return original(p, options as never);
  }) as typeof fs.realpathSync);
  assertUnverified(await x.call('inspect', { source: 'link/missing.csv' }), x.base, x.outside);
});

test('MCP find fails closed when workspace enumeration is unknown', async (t) => {
  const x = await setup(t); if (!x) return;
  const original = fs.readdirSync.bind(fs);
  t.mock.method(fs, 'readdirSync', ((p: fs.PathLike, options?: unknown) => {
    if (path.resolve(String(p)) === path.resolve(x.root)) throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
    return original(p, options as never);
  }) as typeof fs.readdirSync);
  assertUnverified(await x.call('find', { query: 'something' }), x.base, x.outside);
});
