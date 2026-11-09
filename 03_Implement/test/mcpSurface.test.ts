import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MCP_SURFACE, MCP_TOOLS, MCP_TOOL_NAMES, createMcpServer } from '../src/cli/mcp.js';
import { buildMcpSurface, mcpSurfaceDigest } from '../src/cli/mcpSurface.js';

/** Issue #721: tools/list declares read-only and a digest of the public surface. */

async function rpc(server: ReturnType<typeof createMcpServer>, id: number, method: string, params?: unknown): Promise<any> {
  const line = await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  return JSON.parse(line!);
}

function newServer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-surface-'));
  return createMcpServer({ root, version: 'test-version' });
}

test('tools/list _meta declares every tool read-only with a digest, and initialize repeats the digest', async () => {
  const server = newServer();
  const init = await rpc(server, 1, 'initialize', { protocolVersion: '2024-11-05' });
  const listed = await rpc(server, 2, 'tools/list');
  const surface = listed.result._meta['mmi/surface'];

  assert.equal(surface.contract, 'mmi.mcp-surface/v1');
  assert.equal(surface.readOnly, true);
  assert.deepEqual(surface.tools.map((t: { name: string }) => t.name), [...MCP_TOOL_NAMES]);
  for (const tool of surface.tools) assert.equal(tool.readOnly, true, `${tool.name} must be declared read-only`);
  assert.match(surface.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(surface.digestScope, 'name+inputSchema');
  assert.deepEqual(init.result._meta['mmi/surface'], {
    contract: surface.contract,
    readOnly: true,
    digest: surface.digest,
  });
  // Existing readers: each tool keeps exactly the three published keys.
  for (const tool of listed.result.tools) {
    assert.deepEqual(Object.keys(tool).sort(), ['description', 'inputSchema', 'name']);
  }
});

test('the surface digest is stable across calls and servers, ignores description and key order', () => {
  const a = mcpSurfaceDigest(MCP_TOOLS);
  assert.equal(a, mcpSurfaceDigest(MCP_TOOLS));
  assert.equal(a, MCP_SURFACE.digest);

  const reworded = MCP_TOOLS.map((tool) => ({ ...tool, description: `${tool.description} (reworded)` }));
  assert.equal(mcpSurfaceDigest(reworded), a);

  // Reverse the key order of every object recursively. JSON.stringify's
  // replacer array would drop keys that are not in the array at each level,
  // which changes the schema instead of only reordering it.
  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).reverse()) {
        out[key] = reverseKeys((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };
  const reordered = [...MCP_TOOLS].reverse().map((tool) => ({
    name: tool.name,
    inputSchema: reverseKeys(tool.inputSchema),
  }));
  assert.equal(mcpSurfaceDigest(reordered), a);
});

test('the surface digest changes when a tool or an argument is added', () => {
  const base = mcpSurfaceDigest(MCP_TOOLS);
  const extraTool = [...MCP_TOOLS, { name: 'extra', description: 'x', inputSchema: { type: 'object' } }];
  assert.notEqual(mcpSurfaceDigest(extraTool), base);

  const extraArg = MCP_TOOLS.map((tool, index) => index === 0
    ? { ...tool, inputSchema: { ...tool.inputSchema, properties: { ...(tool.inputSchema.properties as object), added: { type: 'string' } } } }
    : tool);
  assert.notEqual(mcpSurfaceDigest(extraArg), base);
});

test('a tool outside the audited read-only list makes the declaration false', () => {
  const surface = buildMcpSurface(
    [...MCP_TOOLS, { name: 'writer', description: 'x', inputSchema: { type: 'object' } }],
    (name) => MCP_TOOL_NAMES.includes(name),
  );
  assert.equal(surface.readOnly, false);
  assert.equal(surface.tools.find((t) => t.name === 'writer')?.readOnly, false);
  // The published surface must stay all-true: adding a tool without auditing it fails here.
  assert.equal(MCP_SURFACE.readOnly, true);
});

// Issue #804: the digest covers name+inputSchema only. These tests fix what it
// does NOT detect, so a later change of the scope must update the documentation
// (mcp-server.md) and `digestScope` together.
test('changing a tool readOnly value does not change the digest, but is visible in tools[]', () => {
  const allReadOnly = buildMcpSurface(MCP_TOOLS, () => true);
  const oneWritable = buildMcpSurface(MCP_TOOLS, (name) => name !== MCP_TOOLS[0].name);
  assert.equal(oneWritable.digest, allReadOnly.digest);
  assert.equal(oneWritable.digestScope, 'name+inputSchema');
  assert.equal(oneWritable.readOnly, false);
  assert.equal(oneWritable.tools[0].readOnly, false);
  assert.notDeepEqual(oneWritable.tools, allReadOnly.tools);
});

test('changing a tool description or adding a result-shape field outside inputSchema does not change the digest', () => {
  const base = mcpSurfaceDigest(MCP_TOOLS);
  const withExtraKeys = MCP_TOOLS.map((tool) => ({ ...tool, resultContract: 'mmi.selection/v1', failureCodes: ['x'] }));
  assert.equal(mcpSurfaceDigest(withExtraKeys), base);
});
