import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { commitHtmlDecomposition } from '../src/application/commitHtmlDecomposition.js';
import { main as cliMain } from '../src/cli/mmi.js';
import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';

const html = fs.readFileSync(
  new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url),
  'utf8',
);
const digest = createSourceIdentityFromBytes(Buffer.from(html, 'utf8')).digest;

interface Workspace {
  root: string;
  source: string;
  plan: string;
  ledger: string;
  selections: { id: string; output: string; expectedFingerprint: string }[];
}

async function withWorkspace(fn: (ctx: Workspace) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-html-audit-mcp-'));
  const source = path.join(root, 'source.html');
  const ledger = path.join(root, 'mmi-ledger.json');
  const plan = path.join(root, 'reviewed.json');
  fs.writeFileSync(source, html);
  const parsed = readHtmlFragments(html, 'source.html', digest);
  const selections = ['overview', 'api'].map((id) => ({
    id, output: `docs/${id}.html`,
    expectedFingerprint: selectHtmlFragmentById(parsed, id).candidate.fingerprint.digest,
  }));
  fs.writeFileSync(plan, JSON.stringify({ sourceDigest: digest, fragments: selections }));
  try {
    await fn({ root, source, plan, ledger, selections });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function commit(ctx: Workspace): void {
  commitHtmlDecomposition({
    workspaceRoot: ctx.root,
    sourcePath: ctx.source,
    ledgerPath: ctx.ledger,
    selections: ctx.selections,
    expectedSourceDigest: digest,
  });
}

async function mcp(root: string, name: string, args: unknown): Promise<any> {
  const instance = createMcpServer({ root, version: 'html-audit-test' });
  const initialized = JSON.parse((await instance.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '0' } },
  }))) ?? '{}');
  assert.equal(initialized.result.protocolVersion, MCP_PROTOCOL_VERSION);
  const result = await instance.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name, arguments: args },
  }));
  return JSON.parse(result ?? '{}');
}

test('MCP tools/list contains only the read-only html-audit entry, never html-commit', async () => {
  await withWorkspace(async ({ root }) => {
    const instance = createMcpServer({ root });
    await instance.handleLine(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_VERSION },
    }));
    const response = JSON.parse((await instance.handleLine(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    }))) ?? '{}');
    const tools = response.result.tools;
    const audit = tools.find((entry: { name: string }) => entry.name === 'html-audit');
    assert.ok(audit);
    assert.deepEqual(audit.inputSchema.required, ['source', 'plan']);
    assert.equal(audit.inputSchema.additionalProperties, false);
    assert.equal(tools.some((entry: { name: string }) => entry.name === 'html-commit'), false);
  });
});

test('MCP html-audit mirrors CLI JSON for complete batch and does not write', async () => {
  await withWorkspace(async (ctx) => {
    commit(ctx);
    const paths = [ctx.source, ctx.plan, ctx.ledger,
      path.join(ctx.root, 'docs/overview.html'), path.join(ctx.root, 'docs/api.html')];
    const before = paths.map((file) => fs.readFileSync(file));
    const response = await mcp(ctx.root, 'html-audit', {
      source: 'source.html', plan: 'reviewed.json',
    });
    assert.equal(response.result.isError, false);
    const mcpReport = JSON.parse(response.result.content[0].text);
    assert.equal(mcpReport.status, 'complete');
    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      assert.equal(await cliMain([
        'html-audit', ctx.source, '--plan', ctx.plan,
        '--root', ctx.root, '--json',
      ]), 0);
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.deepEqual(mcpReport, JSON.parse(output));
    assert.deepEqual(paths.map((file) => fs.readFileSync(file)), before);
  });
});

test('MCP html-audit returns structured incomplete result when output is missing', async () => {
  await withWorkspace(async (ctx) => {
    commit(ctx);
    const api = path.join(ctx.root, 'docs/api.html');
    fs.unlinkSync(api);
    const beforeLedger = fs.readFileSync(ctx.ledger);
    const response = await mcp(ctx.root, 'html-audit', {
      source: 'source.html', plan: 'reviewed.json',
    });
    assert.equal(response.result.isError, false);
    const report = JSON.parse(response.result.content[0].text);
    assert.equal(report.status, 'incomplete');
    assert.ok(report.problems.includes('MMI_HTML_OUTPUT_MISSING'));
    assert.equal(report.files[1].file, 'missing');
    assert.equal(fs.existsSync(api), false);
    assert.deepEqual(fs.readFileSync(ctx.ledger), beforeLedger);
  });
});

test('MCP html-audit reports stale original as data and rejects forged review manifest', async () => {
  await withWorkspace(async (ctx) => {
    fs.appendFileSync(ctx.source, '<!-- changed -->');
    const response = await mcp(ctx.root, 'html-audit', {
      source: 'source.html', plan: 'reviewed.json',
    });
    assert.equal(response.result.isError, false);
    assert.equal(JSON.parse(response.result.content[0].text).status, 'stale');
    fs.writeFileSync(ctx.plan, '{"fragments":[]}');
    const malformed = await mcp(ctx.root, 'html-audit', {
      source: 'source.html', plan: 'reviewed.json',
    });
    assert.equal(malformed.error?.code, -32602);
  });
});

test('MCP html-audit rejects outside-root paths and unknown write arguments', async () => {
  await withWorkspace(async (ctx) => {
    const outside = await mcp(ctx.root, 'html-audit', {
      source: '../outside.html', plan: 'reviewed.json',
    });
    assert.equal(outside.result.isError, true);
    assert.match(outside.result.content[0].text, /outside the MCP workspace root/u);
    const unsupported = await mcp(ctx.root, 'html-audit', {
      source: 'source.html', plan: 'reviewed.json', commit: true,
    });
    // The MCP inputSchema disallows the extra property. Never interpret it as
    // authorization for a side-effecting operation.
    assert.ok(unsupported.result?.isError || unsupported.error);
    assert.equal(fs.existsSync(ctx.ledger), false);
  });
});
