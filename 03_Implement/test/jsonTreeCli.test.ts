import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main, inspectSource } from '../src/cli/mmi.js';
import { extractJsonTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-json-tree-'));
  const source = path.join(root, 'service.json');
  const outDir = path.join(root, 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(
    source,
    JSON.stringify({
      service: {
        name: 'billing',
        endpoints: [
          { path: '/pay', method: 'POST' },
          { path: '/refund', method: 'POST' },
        ],
      },
      enabled: true,
    }, null, 2),
  );
  return { root, source, outDir, ledgerPath };
}

const digest = (file: string): string =>
  'sha256:' + createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function captureMain(argv: string[]): Promise<{ code: number; output: string; error: string }> {
  const output: string[] = [];
  const errors: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  const error = console.error;
  process.stdout.write = ((chunk: string) => (output.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      output: output.join(''),
      error: errors.join('\n'),
    };
  } finally {
    process.stdout.write = write;
    console.error = error;
  }
}

test('inspect exposes JSON hierarchy as Tree Candidates without treating it as a workbook', () => {
  const f = workspace();
  const result = inspectSource(f.source, 0);

  assert.deepEqual(result.sheets, []);
  assert.deepEqual(result.images, []);
  assert.deepEqual(
    result.trees?.map((tree) => tree.pointer),
    ['', '/service', '/service/endpoints', '/service/endpoints/0', '/service/endpoints/1'],
  );
  assert.equal(result.candidates.every((candidate) => candidate.kind === 'tree'), true);
  assert.equal(result.candidates.every((candidate) => candidate.status === 'observed'), true);
});

test('extractJsonTree projects one explicit subtree to nested Markdown and records it in the shared ledger', () => {
  const f = workspace();
  const sourceBefore = digest(f.source);
  const result = extractJsonTree({
    sourcePath: f.source,
    pointer: '/service',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(path.basename(result.extracted.file), /^tree-[0-9a-f]{12}\.md$/u);
  assert.equal(digest(result.extracted.file), result.extracted.digest);
  assert.match(result.extracted.markdown, /^- "service" \(object\)/u);
  assert.match(result.extracted.markdown, /- "name": "billing"/u);
  assert.match(result.extracted.markdown, /- "endpoints" \(array\)/u);
  assert.match(
    result.extracted.markdown,
    /<!-- mmi:extracted-tree .* path="\/service" .* projection="json-nested-list-v1" -->$/u,
  );
  assert.equal(digest(f.source), sourceBefore);

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'tree');
  assert.equal(ledger.entries[0].place, 'path:/service');
  assert.equal(ledger.entries[0].reviewState, 'accepted');
  assert.equal(ledger.entries[0].conversion.mode, 'json-nested-list-v1');
  assert.equal(ledger.entries[0].conversion.pointer, '/service');
});

test('CLI inspect and extract support JSON Pointer selection while scalar paths fail closed', async () => {
  const f = workspace();
  const inspected = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(inspected.code, 0);
  const payload = JSON.parse(inspected.output);
  assert.equal(
    payload.candidates.some(
      (candidate: any) =>
        candidate.kind === 'tree'
        && candidate.locator.structuralPath === '/service',
    ),
    true,
  );

  const extracted = await captureMain([
    'extract',
    f.source,
    '--tree',
    '/service',
    '--out-dir',
    f.outDir,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(extracted.code, 0);
  assert.equal(JSON.parse(extracted.output).extracted.pointer, '/service');

  const scalar = await captureMain([
    'extract',
    f.source,
    '--tree',
    '/enabled',
    '--out-dir',
    f.outDir,
    '--root',
    f.root,
  ]);
  assert.equal(scalar.code, 1);
  assert.match(scalar.error, /MMI_TREE_CANDIDATE_NOT_FOUND/u);
});
