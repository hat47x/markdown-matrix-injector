import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_NODE_MAJOR,
  nodeMajor,
  supportsNodeVersion,
  bootstrap,
} from '../src/cli/bootstrap.js';

test('CLI bootstrap accepts Node 20+ and rejects older or malformed versions', () => {
  assert.equal(MINIMUM_NODE_MAJOR, 20);
  assert.equal(nodeMajor('18.20.8'), 18);
  assert.equal(nodeMajor('20.20.2'), 20);
  assert.equal(nodeMajor('22.11.0'), 22);
  assert.equal(nodeMajor('not-a-version'), undefined);

  assert.equal(supportsNodeVersion('18.20.8'), false);
  assert.equal(supportsNodeVersion('19.9.0'), false);
  assert.equal(supportsNodeVersion('20.0.0'), true);
  assert.equal(supportsNodeVersion('22.11.0'), true);
  assert.equal(supportsNodeVersion('not-a-version'), false);
});

test('unsupported Node exits before loading the MMI runtime graph', async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };
  try {
    assert.equal(await bootstrap(['--help'], '18.20.8'), 2);
  } finally {
    console.error = original;
  }

  assert.equal(errors.length, 1);
  assert.match(errors[0], /Node\.js 20 or newer is required/u);
  assert.match(errors[0], /current runtime is 18\.20\.8/u);
});

test('mmi-mcp bootstrap exits 2 on stderr only before loading the MCP runtime graph', async () => {
  const { bootstrapMcp } = await import('../src/cli/mcp-bootstrap.js');
  const errors: string[] = [];
  const writes: string[] = [];
  const originalError = console.error;
  const originalWrite = process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };
  process.stdout.write = ((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    assert.equal(await bootstrapMcp(['--help'], '18.20.8'), 2);
    assert.equal(await bootstrapMcp([], '19.9.0'), 2);
    assert.equal(await bootstrapMcp([], 'not-a-version'), 2);
  } finally {
    console.error = originalError;
    process.stdout.write = originalWrite;
  }

  assert.deepEqual(writes, []);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /^mmi-mcp: Node\.js 20 or newer is required/u);
  assert.match(errors[0], /current runtime is 18\.20\.8/u);
});
