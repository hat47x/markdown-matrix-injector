import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main, inspectSource } from '../src/cli/mmi.js';
import { extractYamlTree } from '../src/cli/extractTree.js';
import { readLedger } from '../src/core/importLedger.js';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-yaml-tree-'));
  const source = path.join(root, 'service.yaml');
  const outDir = path.join(root, 'assets');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  fs.writeFileSync(
    source,
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      '    - path: /refund',
      '      method: POST',
      'enabled: true',
      '',
    ].join('\n'),
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

test('inspect exposes YAML hierarchy through the shared Tree Candidate contract', () => {
  const f = workspace();
  const result = inspectSource(f.source, 0);

  assert.deepEqual(result.sheets, []);
  assert.deepEqual(result.images, []);
  assert.deepEqual(
    result.trees?.map((tree) => tree.pointer),
    ['', '/service', '/service/endpoints', '/service/endpoints/0', '/service/endpoints/1'],
  );
  assert.equal(
    result.trees?.every((tree) => tree.format === 'yaml'),
    true,
  );
  assert.equal(
    result.candidates.every(
      (candidate) =>
        candidate.kind === 'tree'
        && candidate.status === 'observed'
        && candidate.execution === 'deterministic'
        && candidate.method === 'M0'
        && candidate.provenance.algorithm === 'mmi.yaml-tree-adapter',
    ),
    true,
  );
});

test('extractYamlTree writes one reviewed subtree and records shared ledger provenance', () => {
  const f = workspace();
  const sourceBefore = digest(f.source);
  const result = extractYamlTree({
    sourcePath: f.source,
    pointer: '/service',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
  });

  assert.deepEqual(result.problems, []);
  assert.ok(result.extracted);
  assert.match(
    result.extracted.markdown,
    /projection="yaml-nested-list-v1"/u,
  );
  assert.match(result.extracted.markdown, /- "name": "billing"/u);
  assert.equal(digest(f.source), sourceBefore);

  const ledger = readLedger(f.ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'tree');
  assert.equal(ledger.entries[0].place, 'path:/service');
  assert.equal(ledger.entries[0].reviewState, 'accepted');
  assert.equal(
    ledger.entries[0].conversion.mode,
    'yaml-nested-list-v1',
  );
});

test('CLI inspect/extract supports YAML Pointer selection and scalar paths fail closed', async () => {
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

test('review-bound YAML extraction rejects changed subtree but tolerates unrelated edits', () => {
  const f = workspace();
  const reviewed = inspectSource(f.source, 0).candidates.find(
    (candidate) =>
      candidate.kind === 'tree'
      && candidate.locator.structuralPath === '/service',
  );
  assert.ok(reviewed);

  fs.writeFileSync(
    f.source,
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      '    - path: /refund',
      '      method: POST',
      'enabled: false',
      '',
    ].join('\n'),
  );
  const unrelated = extractYamlTree({
    sourcePath: f.source,
    pointer: '/service',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });
  assert.deepEqual(unrelated.problems, []);
  assert.ok(unrelated.extracted);

  fs.writeFileSync(
    f.source,
    [
      'service:',
      '  name: payments',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      'enabled: false',
      '',
    ].join('\n'),
  );
  const changed = extractYamlTree({
    sourcePath: f.source,
    pointer: '/service',
    outDir: path.join(f.root, 'changed-assets'),
    ledgerPath: path.join(f.root, 'changed-ledger.json'),
    expectedCandidateFingerprint: reviewed.fingerprint.digest,
  });
  assert.equal(changed.extracted, undefined);
  assert.deepEqual(
    changed.problems.map((problem) => problem.code),
    ['MMI_TREE_CANDIDATE_CHANGED'],
  );
});

test('CLI and extraction fail closed on malformed YAML features', async () => {
  const f = workspace();
  fs.writeFileSync(
    f.source,
    'base: &base\n  name: billing\ncopy: *base\n',
  );

  assert.throws(
    () => inspectSource(f.source, 0),
    /unsupported aliases or values/u,
  );

  const extracted = extractYamlTree({
    sourcePath: f.source,
    pointer: '',
    outDir: f.outDir,
    ledgerPath: f.ledgerPath,
  });
  assert.equal(extracted.extracted, undefined);
  assert.deepEqual(
    extracted.problems.map((problem) => problem.code),
    ['MMI_TREE_YAML_INVALID'],
  );
  assert.equal(fs.existsSync(f.outDir), false);
});
