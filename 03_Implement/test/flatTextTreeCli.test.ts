import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main, inspectSource } from '../src/cli/mmi.js';
import { extractFlatTextTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

async function captureMain(argv: string[]): Promise<{
  code: number;
  output: string;
  error: string;
}> {
  const output: string[] = [];
  const errors: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  const error = console.error;
  process.stdout.write = ((chunk: string) => (
    output.push(String(chunk)),
    true
  )) as typeof process.stdout.write;
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

function workspace(text: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-flat-tree-'));
  const source = path.join(root, 'outline.txt');
  fs.writeFileSync(source, text);
  return { root, source };
}

test('inspect exposes independent flat-text hierarchy hypotheses and M1 Tree Candidates', async () => {
  const f = workspace([
    '1. Root',
    '  1.1 Child',
    '    1.1.1 Grandchild',
    '  2. Peer',
  ].join('\n'));

  const result = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(result.code, 0);

  const payload = JSON.parse(result.output);
  assert.equal(payload.treeAmbiguous, true);
  assert.deepEqual(
    payload.treeHypotheses.map((item: any) => [
      item.method,
      item.status,
    ]),
    [
      ['indent', 'inferred'],
      ['heading-number', 'inferred'],
    ],
  );
  assert.equal(
    payload.candidates.every((candidate: any) =>
      candidate.kind === 'tree'
      && candidate.execution === 'deterministic'
      && candidate.method === 'M1'),
    true,
  );
  assert.equal(
    payload.trees.some((tree: any) =>
      tree.method === 'indent'
      && tree.pointer === 'text:indent:line:2'),
    true,
  );
  assert.equal(
    payload.trees.some((tree: any) =>
      tree.method === 'heading-number'
      && tree.pointer === 'text:heading-number:line:2'),
    true,
  );
});

test('inspect --tree-method enables one flat-text structuralizer independently', async () => {
  const f = workspace([
    'REQ-1 Account',
    'REQ-1-1 Create',
    'REQ-1-2 Disable',
  ].join('\n'));

  const result = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--tree-method',
    'prefix-code',
    '--json',
  ]);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.output);
  assert.deepEqual(
    payload.treeHypotheses.map((item: any) => item.method),
    ['prefix-code'],
  );
  assert.equal(payload.treeAmbiguous, false);
  assert.equal(
    payload.candidates.every((candidate: any) =>
      candidate.provenance.algorithm
        === 'mmi.flat-text-tree.prefix-code'),
    true,
  );
});

test('inspect prints abstention instead of inventing a missing numbered parent', async () => {
  const f = workspace([
    '1. Root',
    '1.1 Child',
    '2.1 Orphan',
  ].join('\n'));

  const result = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--tree-method',
    'heading-number',
  ]);
  assert.equal(result.code, 0);
  assert.match(
    result.output,
    /heading-number: abstained \(flat-text-heading-number-parent-missing, 0 nodes\)/u,
  );
  assert.doesNotMatch(result.output, /text:heading-number:line:/u);

  const inspected = inspectSource(
    f.source,
    0,
    undefined,
    ['heading-number'],
  );
  assert.equal(inspected.candidates.length, 1);
  assert.equal(inspected.candidates[0].status, 'abstained');
});

test('inspect rejects unsupported flat-text hierarchy methods', async () => {
  const f = workspace('Root\n  Child\n');
  const result = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--tree-method',
    'indent,magic',
  ]);
  assert.equal(result.code, 2);
  assert.match(
    result.error,
    /--tree-method supports: indent,heading-number,prefix-code/u,
  );
});

test('flat-text sources fail closed on invalid UTF-8 bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-flat-tree-'));
  const source = path.join(root, 'invalid.txt');
  fs.writeFileSync(source, Buffer.from([0xff, 0xfe, 0xfd]));

  assert.throws(
    () => inspectSource(source, 0),
    /flat-text Tree sources must be valid UTF-8/u,
  );
});

test('plain text without a configured hierarchy signal remains an empty Candidate set', async () => {
  const f = workspace('This is a paragraph.\nAnother paragraph.\n');

  const result = await captureMain([
    'inspect',
    f.source,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.output);
  assert.deepEqual(payload.treeHypotheses, []);
  assert.deepEqual(payload.trees, []);
  assert.deepEqual(payload.candidates, []);
  assert.equal(payload.treeAmbiguous, false);
});


test('extract writes one reviewed flat-text subtree as nested Markdown and records the shared ledger', async () => {
  const f = workspace([
    '1. Overview',
    '1.1 Scope',
    '1.2 Data',
    '2. Operations',
    '2.1 Deploy',
  ].join('\n'));
  const outDir = path.join(f.root, 'assets');
  const ledger = path.join(f.root, 'mmi-ledger.json');

  const inspected = inspectSource(
    f.source,
    0,
    undefined,
    ['heading-number'],
  );
  const root = inspected.candidates.find((candidate) =>
    candidate.locator.structuralPath === 'text:heading-number:line:1');
  assert.ok(root);

  const result = extractFlatTextTree({
    sourcePath: f.source,
    pointer: 'text:heading-number:line:1',
    outDir,
    ledgerPath: ledger,
    expectedCandidateFingerprint: root.fingerprint.digest,
  });
  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(result.extracted.markdown, /^- Overview\n  - Scope\n  - Data/mu);
  assert.doesNotMatch(result.extracted.markdown, /Operations/u);
  assert.match(
    result.extracted.markdown,
    /projection="flat-text-nested-list-v1"/u,
  );

  const stored = readLedger(ledger);
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].kind, 'tree');
  assert.equal(stored.entries[0].place, 'path:text:heading-number:line:1');
  assert.equal(stored.entries[0].reviewState, 'accepted');
  assert.equal(
    stored.entries[0].conversion.mode,
    'flat-text-nested-list-v1',
  );
  assert.equal(
    stored.entries[0].conversion.method,
    'heading-number',
  );
});

test('CLI extract accepts a flat-text structural path shown by inspect', async () => {
  const f = workspace([
    'REQ-1 Account',
    'REQ-1-1 Create',
    'REQ-1-2 Disable',
  ].join('\n'));
  const outDir = path.join(f.root, 'assets');

  const result = await captureMain([
    'extract',
    f.source,
    '--tree',
    'text:prefix-code:line:1',
    '--out-dir',
    outDir,
    '--root',
    f.root,
    '--json',
  ]);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.output);
  assert.equal(payload.extracted.pointer, 'text:prefix-code:line:1');
  assert.match(payload.extracted.markdown, /^- Account\n  - Create\n  - Disable/mu);
});

test('review-bound flat-text extraction rejects a changed reviewed subtree', () => {
  const f = workspace([
    '1. Overview',
    '1.1 Scope',
    '2. Operations',
  ].join('\n'));
  const reviewed = inspectSource(
    f.source,
    0,
    undefined,
    ['heading-number'],
  ).candidates.find((candidate) =>
    candidate.locator.structuralPath === 'text:heading-number:line:1');
  assert.ok(reviewed);

  fs.writeFileSync(f.source, [
    '1. Overview',
    '1.1 Scope changed',
    '2. Operations',
  ].join('\n'));

  const result = extractFlatTextTree({
    sourcePath: f.source,
    pointer: 'text:heading-number:line:1',
    outDir: path.join(f.root, 'assets'),
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });
  assert.equal(result.extracted, undefined);
  assert.deepEqual(
    result.problems.map((problem) => problem.code),
    ['MMI_TREE_CANDIDATE_CHANGED'],
  );
});

test('review-bound flat-text extraction tolerates unrelated root changes outside the reviewed subtree', () => {
  const f = workspace([
    '1. Overview',
    '1.1 Scope',
    '2. Operations',
    '2.1 Deploy',
  ].join('\n'));
  const reviewed = inspectSource(
    f.source,
    0,
    undefined,
    ['heading-number'],
  ).candidates.find((candidate) =>
    candidate.locator.structuralPath === 'text:heading-number:line:1');
  assert.ok(reviewed);

  fs.writeFileSync(f.source, [
    '1. Overview',
    '1.1 Scope',
    '2. Operations changed',
    '2.1 Deploy',
  ].join('\n'));

  const result = extractFlatTextTree({
    sourcePath: f.source,
    pointer: 'text:heading-number:line:1',
    outDir: path.join(f.root, 'assets'),
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });
  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
});

test('flat-text extraction fails closed when the selected method now abstains', () => {
  const f = workspace([
    '1. Root',
    '1.1 Child',
    '2.1 Orphan',
  ].join('\n'));

  const result = extractFlatTextTree({
    sourcePath: f.source,
    pointer: 'text:heading-number:line:1',
    outDir: path.join(f.root, 'assets'),
  });
  assert.equal(result.extracted, undefined);
  assert.deepEqual(
    result.problems.map((problem) => problem.code),
    ['MMI_TREE_CANDIDATE_NOT_FOUND'],
  );
  assert.equal(fs.existsSync(path.join(f.root, 'assets')), false);
});
