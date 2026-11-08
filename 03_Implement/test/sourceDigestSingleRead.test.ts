import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';
import { inspectSource } from '../src/cli/mmi.js';
import { runFind, runSelect } from '../src/cli/navigateCommands.js';
import { createSourceIdentityFromBytes, SourceDigestMismatchError } from '../src/core/sourceIdentity.js';

// #744: sourceDigest must name the bytes the values were read from. The tests replace the
// file right after one of its reads (a stand-in for Excel saving or a sync client writing)
// and check that the digest and the content still come from the same read.

const BEFORE = '品目,数量\nりんご,1\nみかん,2\n';
const AFTER = '品目,数量\nりんご,1\nみかん,2\nぶどう,3\nもも,4\nなし,5\n';

const digestOf = (text: string): string => createSourceIdentityFromBytes(Buffer.from(text, 'utf8')).digest;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-744-'));
}

/**
 * Runs `body` while `fs.readFileSync` of `target` counts its calls and, right after the
 * `swapAfter`-th read, replaces the file with `replacement`. Returns the read count.
 */
async function withSwapAfterRead<T>(
  target: string,
  swapAfter: number,
  replacement: string,
  body: () => T | Promise<T>,
): Promise<{ value: T; reads: number }> {
  const original = fs.readFileSync;
  const resolved = path.resolve(target);
  let reads = 0;
  (fs as { readFileSync: unknown }).readFileSync = ((file: unknown, ...rest: unknown[]) => {
    const bytes = (original as (...args: unknown[]) => unknown)(file, ...rest);
    if (typeof file === 'string' && path.resolve(file) === resolved) {
      reads += 1;
      if (reads === swapAfter) fs.writeFileSync(target, replacement);
    }
    return bytes;
  }) as typeof fs.readFileSync;
  try {
    return { value: await body(), reads };
  } finally {
    (fs as { readFileSync: unknown }).readFileSync = original;
  }
}

function io(dir: string): { out: string[]; err: string[]; cwd: string; sink: { out(t: string): void; err(t: string): void; cwd: string } } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, cwd: dir, sink: { out: (t) => out.push(t), err: (t) => err.push(t), cwd: dir } };
}

test('select reads the source once and its sourceDigest matches the values it selected', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'list.csv');
  fs.writeFileSync(file, BEFORE);
  const sink = io(dir);
  const { value: code, reads } = await withSwapAfterRead(file, 1, AFTER, () =>
    runSelect([file], { table: 'Sheet1!A1:B3', json: true }, sink.sink));
  assert.equal(code, 0, sink.err.join('\n'));
  assert.equal(reads, 1, 'select must read the source file once');
  const parsed = JSON.parse(sink.out.join(''));
  assert.equal(parsed.sourceDigest, digestOf(BEFORE));
  assert.equal(parsed.result.ok, true);
});

test('select with a pinned digest checks the bytes it then parses', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'list.csv');
  fs.writeFileSync(file, BEFORE);
  const pinned = io(dir);
  const { value: code, reads } = await withSwapAfterRead(file, 1, AFTER, () =>
    runSelect([file], { table: 'Sheet1!A1:B3', json: true, 'expected-source-digest': digestOf(BEFORE) }, pinned.sink));
  assert.equal(code, 0, pinned.err.join('\n'));
  assert.equal(reads, 1);
  assert.equal(JSON.parse(pinned.out.join('')).sourceDigest, digestOf(BEFORE));

  // The pin names the bytes that arrive after the swap, but the read already happened: refused.
  fs.writeFileSync(file, BEFORE);
  const stale = io(dir);
  const refused = await withSwapAfterRead(file, 1, AFTER, () =>
    runSelect([file], { table: 'Sheet1!A1:B3', json: true, 'expected-source-digest': digestOf(AFTER) }, stale.sink));
  assert.equal(refused.value, 1);
  const body = JSON.parse(stale.out.join(''));
  assert.equal(body.result.errors[0].code, 'SOURCE_DIGEST_MISMATCH');
  assert.equal(body.sourceDigest, digestOf(BEFORE));
});

test('inspect reads a workbook once and every candidate carries the digest of that read', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'list.csv');
  fs.writeFileSync(file, BEFORE);
  const { value: result, reads } = await withSwapAfterRead(file, 1, AFTER, () => inspectSource(file, 5, undefined, undefined, undefined, dir));
  assert.equal(reads, 1, 'inspect must read the source file once');
  assert.ok(result.candidates.length > 0);
  for (const candidate of result.candidates) {
    assert.equal(candidate.locator.sourceDigest, digestOf(BEFORE));
  }
  // 2 data rows were read, not the 5 of the replacement.
  assert.equal(result.sheets[0].regions[0].rows, 3);
});

test('inspect with a pinned digest refuses bytes that do not have it, on the read it parsed', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'list.csv');
  fs.writeFileSync(file, BEFORE);
  const ok = await withSwapAfterRead(file, 1, AFTER, () => inspectSource(file, 0, undefined, undefined, undefined, dir, digestOf(BEFORE)));
  assert.equal(ok.reads, 1);
  assert.equal(ok.value.sheets[0].regions[0].rows, 3);

  fs.writeFileSync(file, BEFORE);
  await assert.rejects(
    withSwapAfterRead(file, 1, AFTER, () => inspectSource(file, 0, undefined, undefined, undefined, dir, digestOf(AFTER))),
    (error: unknown) => error instanceof SourceDigestMismatchError && /source digest mismatch/.test(error.message),
  );
});

test('inspect pins a JSON tree source on the bytes it parsed', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tree.json');
  fs.writeFileSync(file, '{"a":1}');
  const result = inspectSource(file, 0, undefined, undefined, undefined, dir, digestOf('{"a":1}'));
  assert.ok(result.candidates.length > 0);
  assert.throws(() => inspectSource(file, 0, undefined, undefined, undefined, dir, digestOf('{"a":2}')), SourceDigestMismatchError);
});

test('MCP inspect reports digest-mismatch from the read it parsed', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'list.csv');
  fs.writeFileSync(file, BEFORE);
  const server = createMcpServer({ root: fs.realpathSync(dir), version: 'test' });
  await server.handleLine(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 't', version: '0' } },
  }));
  const call = async (args: unknown): Promise<any> => JSON.parse(
    (await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'inspect', arguments: args } }))) ?? '{}',
  );
  const { value: ok, reads } = await withSwapAfterRead(file, 1, AFTER, () => call({ source: 'list.csv', expectedSourceDigest: digestOf(BEFORE) }));
  assert.equal(reads, 1);
  assert.notEqual(ok.result.isError, true, JSON.stringify(ok));

  fs.writeFileSync(file, BEFORE);
  const bad = await call({ source: 'list.csv', expectedSourceDigest: digestOf(AFTER) });
  assert.equal(bad.result.isError, true);
  assert.equal(bad.result._meta['mmi/error'].code, 'digest-mismatch');
});

test('find offers no digest or identity for a book that changed after it was indexed', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'list.csv');
  fs.writeFileSync(file, BEFORE);
  const query = ['品目', '数量'].join(' ');

  const plain = io(dir);
  assert.equal(await runFind([query], { root: dir, json: true }, plain.sink), 0, plain.err.join('\n'));
  const found = JSON.parse(plain.out.join('')).candidates;
  assert.ok(found.length > 0);
  assert.equal(found[0].sourceDigest, digestOf(BEFORE));
  assert.ok(found[0].candidate);

  // Reads of the book: indexing (1), the freshness check in query (2), then one per candidate (3).
  // Swapping after read 2 makes the per-candidate read see bytes the index never parsed.
  const swapped = io(dir);
  const { value: code } = await withSwapAfterRead(file, 2, AFTER, () => runFind([query], { root: dir, json: true }, swapped.sink));
  assert.equal(code, 0, swapped.err.join('\n'));
  const changed = JSON.parse(swapped.out.join('')).candidates;
  assert.ok(changed.length > 0);
  assert.equal(changed[0].sourceDigest, undefined);
  assert.equal(changed[0].candidate, undefined);
});
