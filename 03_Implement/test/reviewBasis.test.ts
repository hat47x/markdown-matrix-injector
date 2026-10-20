import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  evaluateReviewBasis,
  readReviewBasis,
  recordReviewBasis,
} from '../src/application/reviewBasis.js';

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-basis-'));
}

function writeCsv(file: string, rows: readonly string[]): void {
  fs.writeFileSync(file, `${['item,value', ...rows].join('\n')}\n`);
}

function setup(): {
  root: string;
  source: string;
  document: string;
  sidecar: string;
  reference: string;
} {
  const root = workspace();
  const source = path.join(root, 'data.csv');
  const document = path.join(root, 'doc.md');
  const sidecar = path.join(root, 'mmi-review-basis.json');
  writeCsv(source, ['A,1', 'B,2']);
  const reference = '![[data.csv#Sheet1|A1:B2]]';
  fs.writeFileSync(document, `${reference}\n`);
  return { root, source, document, sidecar, reference };
}

test('recording is explicit: dry-run computes digests but leaves no sidecar', () => {
  const { root, document, sidecar } = setup();
  try {
    const preview = recordReviewBasis({
      markdownFilePath: document,
      workspaceRoot: root,
      sidecarPath: sidecar,
      dryRun: true,
    });
    assert.deepEqual(preview.problems, []);
    assert.equal(preview.written, false);
    assert.equal(preview.records.length, 1);
    assert.match(preview.records[0].logicalTableDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(fs.existsSync(sidecar), false);

    const written = recordReviewBasis({
      markdownFilePath: document,
      workspaceRoot: root,
      sidecarPath: sidecar,
    });
    assert.equal(written.written, true);
    assert.equal(fs.existsSync(sidecar), true);
    assert.equal(readReviewBasis(sidecar).documents['doc.md'].length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a logical-table change inside the range is stale; a change outside is fresh', () => {
  const { root, source, document, sidecar, reference } = setup();
  try {
    recordReviewBasis({ markdownFilePath: document, workspaceRoot: root, sidecarPath: sidecar });
    const evaluate = () => evaluateReviewBasis({
      markdownFilePath: document,
      workspaceRoot: root,
      sidecarPath: sidecar,
      references: [{ reference, source: 'data.csv' }],
    });
    assert.equal(evaluate().references[0].status, 'fresh');

    // The referenced range is A1:B2; a new row outside it does not affect the logical table.
    writeCsv(source, ['A,1', 'B,2', 'C,3']);
    assert.equal(evaluate().references[0].status, 'fresh');

    writeCsv(source, ['A,9', 'B,2', 'C,3']);
    const stale = evaluate();
    assert.equal(stale.references[0].status, 'stale');
    assert.equal(stale.stale, 1);
    assert.notEqual(
      stale.references[0].recordedDigest,
      stale.references[0].currentDigest,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unresolvable references fail closed and do not write a partial review basis', () => {
  const root = workspace();
  try {
    const document = path.join(root, 'doc.md');
    const sidecar = path.join(root, 'mmi-review-basis.json');
    fs.writeFileSync(document, '![[missing.csv#Sheet1|A1:B2]]\n');
    const result = recordReviewBasis({
      markdownFilePath: document,
      workspaceRoot: root,
      sidecarPath: sidecar,
    });
    assert.equal(result.problems.length, 1);
    assert.equal(result.problems[0].code, 'MMI_REVIEW_BASIS_UNVERIFIABLE');
    assert.equal(fs.existsSync(sidecar), false);

    const evaluation = evaluateReviewBasis({
      markdownFilePath: document,
      workspaceRoot: root,
      sidecarPath: sidecar,
      references: [{ reference: '![[missing.csv#Sheet1|A1:B2]]', source: 'missing.csv' }],
    });
    assert.equal(evaluation.status, 'not-configured');
    assert.equal(evaluation.references[0].status, 'unrecorded');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a document without recorded references is partial, not silently fresh', () => {
  const { root, document, sidecar } = setup();
  try {
    recordReviewBasis({ markdownFilePath: document, workspaceRoot: root, sidecarPath: sidecar });
    fs.writeFileSync(document, '![[data.csv#Sheet1|A1:B2]]\n![[other.csv#Sheet1|A1]]\n');
    const evaluation = evaluateReviewBasis({
      markdownFilePath: document,
      workspaceRoot: root,
      sidecarPath: sidecar,
      references: [
        { reference: '![[data.csv#Sheet1|A1:B2]]', source: 'data.csv' },
        { reference: '![[other.csv#Sheet1|A1]]', source: 'other.csv' },
      ],
    });
    assert.equal(evaluation.status, 'partial');
    assert.deepEqual(evaluation.references.map((item) => item.status), ['fresh', 'unrecorded']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
