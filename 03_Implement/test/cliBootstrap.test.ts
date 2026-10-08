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
