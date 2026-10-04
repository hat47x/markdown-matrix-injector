import test from 'node:test';
import assert from 'node:assert/strict';

import { candidateProblem } from '../src/core/candidate.js';
import {
  readFlatTextTree,
  type FlatTextTreeMethod,
} from '../src/adapters/flatTextTreeStructuralizer.js';

const sourceDigest = 'sha256:' + 'a'.repeat(64);

function read(
  text: string,
  methods: readonly FlatTextTreeMethod[],
) {
  return readFlatTextTree(
    text,
    './data/outline.txt',
    sourceDigest,
    { methods },
  );
}

test('indent method infers hierarchy while preserving source lines as observed M0 claims', () => {
  const document = read([
    'Root',
    '  Child A',
    '    Grandchild',
    '  Child B',
  ].join('\n'), ['indent']);

  assert.equal(document.ambiguous, false);
  assert.equal(document.hypotheses.length, 1);
  const hypothesis = document.hypotheses[0];
  assert.equal(hypothesis.method, 'indent');
  assert.equal(hypothesis.status, 'inferred');
  assert.deepEqual(
    hypothesis.nodes.map((node) => ({
      line: node.line,
      parentLine: node.parentLine,
      depth: node.depth,
      children: node.childLines,
    })),
    [
      { line: 1, parentLine: undefined, depth: 0, children: [2, 4] },
      { line: 2, parentLine: 1, depth: 1, children: [3] },
      { line: 3, parentLine: 2, depth: 2, children: [] },
      { line: 4, parentLine: 1, depth: 1, children: [] },
    ],
  );

  const child = hypothesis.nodes[1].candidate;
  assert.equal(child.kind, 'tree');
  assert.equal(child.status, 'inferred');
  assert.equal(child.execution, 'deterministic');
  assert.equal(child.method, 'M1');
  assert.equal(child.locator.structuralPath, 'text:indent:line:2');
  assert.equal(candidateProblem(child), undefined);
  assert.equal(
    child.claims.find((claim) => claim.aspect === 'source-line')?.status,
    'observed',
  );
  assert.equal(
    child.claims.find((claim) => claim.aspect === 'source-line')?.method,
    'M0',
  );
  assert.equal(
    child.claims.find((claim) => claim.aspect === 'parent-line')?.status,
    'inferred',
  );
});

test('heading-number method uses dotted numbering without enabling indentation inference', () => {
  const document = read([
    '1. Overview',
    '1.1 Scope',
    '1.2 Data',
    '2. Operations',
    '2.1 Deploy',
  ].join('\n'), ['heading-number']);

  assert.deepEqual(
    document.hypotheses.map((item) => item.method),
    ['heading-number'],
  );
  assert.deepEqual(
    document.hypotheses[0].nodes.map((node) => [
      node.line,
      node.parentLine ?? null,
      node.label,
    ]),
    [
      [1, null, 'Overview'],
      [2, 1, 'Scope'],
      [3, 1, 'Data'],
      [4, null, 'Operations'],
      [5, 4, 'Deploy'],
    ],
  );
  assert.equal(
    document.hypotheses[0].nodes[1].candidate.provenance.algorithm,
    'mmi.flat-text-tree.heading-number',
  );
});

test('prefix-code method infers parent codes independently from heading numbers', () => {
  const document = read([
    'REQ-1 Account',
    'REQ-1-1 Create',
    'REQ-1-2 Disable',
    'REQ-2 Audit',
    'REQ-2-1 Export',
  ].join('\n'), ['prefix-code']);

  assert.deepEqual(
    document.hypotheses[0].nodes.map((node) => [
      node.line,
      node.parentLine ?? null,
      node.label,
    ]),
    [
      [1, null, 'Account'],
      [2, 1, 'Create'],
      [3, 1, 'Disable'],
      [4, null, 'Audit'],
      [5, 4, 'Export'],
    ],
  );
  assert.equal(
    document.hypotheses[0].nodes[4].candidate.provenance.algorithm,
    'mmi.flat-text-tree.prefix-code',
  );
});

test('different enabled rules remain separate hypotheses instead of being merged', () => {
  const document = read([
    '1. Root',
    '  1.1 Child',
    '    1.1.1 Grandchild',
    '  2. Peer',
  ].join('\n'), ['indent', 'heading-number']);

  assert.equal(document.hypotheses.length, 2);
  assert.equal(document.hypotheses.every((item) => item.status === 'inferred'), true);
  assert.equal(document.ambiguous, true);
  assert.notEqual(
    document.hypotheses[0].edgeSignature,
    document.hypotheses[1].edgeSignature,
  );
  assert.equal(
    document.candidates.every((candidate) => candidate.status === 'inferred'),
    true,
  );
});

test('missing numbered parent yields an abstained M1 hypothesis, not a fabricated hierarchy', () => {
  const document = read([
    '1. Root',
    '1.1 Child',
    '2.1 Orphan',
  ].join('\n'), ['heading-number']);

  assert.equal(document.hypotheses.length, 1);
  const hypothesis = document.hypotheses[0];
  assert.equal(hypothesis.status, 'abstained');
  assert.equal(
    hypothesis.reasonCode,
    'flat-text-heading-number-parent-missing',
  );
  assert.equal(hypothesis.nodes.length, 0);
  assert.equal(hypothesis.candidates.length, 1);
  assert.equal(hypothesis.candidates[0].status, 'abstained');
  assert.equal(hypothesis.candidates[0].method, 'M1');
  assert.equal(candidateProblem(hypothesis.candidates[0]), undefined);
});

test('duplicate prefix codes abstain instead of selecting one occurrence', () => {
  const document = read([
    'REQ-1 Root',
    'REQ-1-1 First',
    'REQ-1-1 Second',
  ].join('\n'), ['prefix-code']);

  assert.equal(document.hypotheses[0].status, 'abstained');
  assert.equal(
    document.hypotheses[0].reasonCode,
    'flat-text-prefix-code-duplicate',
  );
});

test('plain text with no enabled structural signal yields no inferred Tree Candidate', () => {
  const document = read([
    'This is a paragraph.',
    'This is another paragraph.',
  ].join('\n'), ['indent', 'heading-number', 'prefix-code']);

  assert.deepEqual(document.hypotheses, []);
  assert.deepEqual(document.candidates, []);
  assert.equal(document.ambiguous, false);
});

test('method configuration is explicit and rejects invalid or empty configuration', () => {
  assert.throws(
    () => readFlatTextTree(
      'Root\n  Child\n',
      './data/a.txt',
      sourceDigest,
      { methods: [] },
    ),
    /needs at least one enabled method/u,
  );
  assert.throws(
    () => readFlatTextTree(
      'Root\n  Child\n',
      './data/a.txt',
      sourceDigest,
      { methods: ['indent'], tabWidth: 0 },
    ),
    /tabWidth/u,
  );
});

test('subtree fingerprints depend on inferred structure/content, not source line position alone', () => {
  const first = read('Root\n  Child\n', ['indent']);
  const moved = read('\n\nRoot\n  Child\n', ['indent']);

  assert.equal(
    first.hypotheses[0].nodes[0].candidate.fingerprint.digest,
    moved.hypotheses[0].nodes[0].candidate.fingerprint.digest,
  );
  assert.notEqual(
    first.hypotheses[0].nodes[0].candidate.locator.structuralPath,
    moved.hypotheses[0].nodes[0].candidate.locator.structuralPath,
  );
});


test('ambiguity includes node-set differences even when parent-child edges coincide', () => {
  const document = read([
    '1. Root',
    '  1.1 Child',
    'Additional unnumbered root',
  ].join('\n'), ['indent', 'heading-number']);

  assert.equal(document.hypotheses.length, 2);
  assert.deepEqual(
    document.hypotheses.map((item) => [
      item.method,
      item.nodes.map((node) => node.line),
      item.edgeSignature,
    ]),
    [
      ['indent', [1, 2, 3], '1<-root,2<-1,3<-root'],
      ['heading-number', [1, 2], '1<-root,2<-1'],
    ],
  );
  assert.equal(document.ambiguous, true);
});
