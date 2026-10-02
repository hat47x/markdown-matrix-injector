import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  recordDeferredDecision,
  recordRejectedDecision,
} from '../src/core/candidateReviewDecisions.js';
import { candidateReviewView } from '../src/core/candidateReviewView.js';
import {
  emptyLedger,
  entryFor,
  readLedger,
  recordEntries,
} from '../src/core/importLedger.js';
import {
  fingerprintOf,
  type Candidate,
} from '../src/core/candidate.js';

function candidate(content: string): Candidate {
  const sourceDigest = fingerprintOf(
    'source-bytes-v1',
    'source',
  ).digest;
  return {
    kind: 'table-range',
    locator: {
      source: 'design.csv',
      sourceDigest,
      sheet: 'Sheet1',
      range: 'A1:B3',
    },
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    claims: [
      {
        aspect: 'boundary',
        value: 'A1:B3',
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: 'blank-row-column-regions',
      },
    ],
    provenance: {
      algorithm: 'test.table-detector',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {},
        implementationVersion: '1',
      },
    },
    fingerprint: fingerprintOf(
      'table-display-cells-v1',
      content,
    ),
    scores: [],
  };
}

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-view-'));
  const source = path.join(root, 'design.csv');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const decisionPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  return { root, source, ledgerPath, decisionPath };
}

test('active review queues hide an exact rejected Candidate while all keeps it restorable', () => {
  const f = workspace();
  const reviewed = candidate('same-content');
  const decisions = recordRejectedDecision(
    f.decisionPath,
    f.source,
    reviewed,
    'test',
  );

  for (const filter of ['unimported', 'exclude-imported'] as const) {
    assert.deepEqual(
      candidateReviewView(
        [reviewed],
        emptyLedger(),
        decisions,
        f.ledgerPath,
        f.decisionPath,
        f.source,
        filter,
      ),
      [],
    );
  }

  const all = candidateReviewView(
    [reviewed],
    emptyLedger(),
    decisions,
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'all',
  );
  assert.equal(all.length, 1);
  assert.equal(all[0].reviewState, 'rejected');
  assert.equal(all[0].rejected, true);
  assert.equal(all[0].ledgerState, 'unimported');
});

test('deferred Candidate stays out of active queues but remains restorable in all', () => {
  const f = workspace();
  const deferred = candidate('same-content');
  const decisions = recordDeferredDecision(
    f.decisionPath,
    f.source,
    deferred,
    'review later',
  );

  for (const filter of ['unimported', 'exclude-imported'] as const) {
    assert.deepEqual(
      candidateReviewView(
        [deferred],
        emptyLedger(),
        decisions,
        f.ledgerPath,
        f.decisionPath,
        f.source,
        filter,
      ),
      [],
    );
  }

  const all = candidateReviewView(
    [deferred],
    emptyLedger(),
    decisions,
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'all',
  );
  assert.equal(all.length, 1);
  assert.equal(all[0].reviewState, 'deferred');
  assert.equal(all[0].deferred, true);
  assert.equal(all[0].rejected, false);
  assert.equal(all[0].ledgerState, 'unimported');
});

test('changed Candidate returns from deferred state as unreviewed', () => {
  const f = workspace();
  const reviewed = candidate('old-content');
  const decisions = recordDeferredDecision(
    f.decisionPath,
    f.source,
    reviewed,
    'review later',
  );
  const changed = candidate('new-content');

  const view = candidateReviewView(
    [changed],
    emptyLedger(),
    decisions,
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'unimported',
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].reviewState, 'unreviewed');
  assert.equal(view[0].deferred, false);
  assert.equal(view[0].rejected, false);
});

test('changed Candidate returns to active review because the old rejection no longer matches', () => {
  const f = workspace();
  const reviewed = candidate('old-content');
  const decisions = recordRejectedDecision(
    f.decisionPath,
    f.source,
    reviewed,
    'test',
  );
  const changed = candidate('new-content');

  const view = candidateReviewView(
    [changed],
    emptyLedger(),
    decisions,
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'unimported',
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].reviewState, 'unreviewed');
  assert.equal(view[0].rejected, false);
  assert.equal(view[0].ledgerState, 'unimported');
});

test('stale validation preserves accepted review history without changing origin', () => {
  const f = workspace();
  const accepted = candidate('same-content');
  const output = path.join(f.root, 'assets', 'table.md');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '| A | B |\n');
  recordEntries(f.ledgerPath, [
    entryFor(
      f.ledgerPath,
      f.source,
      accepted,
      output,
      'test import',
    ),
  ]);

  const current: Candidate = {
    ...accepted,
    claims: accepted.claims.map((claim) => ({
      ...claim,
      reasonCode: 'changed-inference-basis',
    })),
  };
  const view = candidateReviewView(
    [current],
    readLedger(f.ledgerPath),
    { schema: 'mmi.review-decisions/v1', entries: [] },
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'all',
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].ledgerState, 'stale');
  assert.equal(view[0].reviewState, 'accepted');
  assert.equal(view[0].candidate.status, 'inferred');
});

test('content-changed Candidate does not inherit acceptance from the previous content', () => {
  const f = workspace();
  const accepted = candidate('old-content');
  const output = path.join(f.root, 'assets', 'table.md');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '| A | B |\n');
  recordEntries(f.ledgerPath, [
    entryFor(
      f.ledgerPath,
      f.source,
      accepted,
      output,
      'test import',
    ),
  ]);

  const current = candidate('new-content');
  const view = candidateReviewView(
    [current],
    readLedger(f.ledgerPath),
    { schema: 'mmi.review-decisions/v1', entries: [] },
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'all',
  );

  assert.equal(view.length, 1);
  assert.equal(view[0].ledgerState, 'changed');
  assert.equal(view[0].reviewState, 'unreviewed');
  assert.equal(view[0].candidate.status, 'inferred');
});

test('imported Candidate is accepted even when an old deferred decision exists', () => {
  const f = workspace();
  const reviewed = candidate('content');
  const output = path.join(f.root, 'assets', 'table.md');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '| A | B |\n');
  recordEntries(f.ledgerPath, [
    entryFor(
      f.ledgerPath,
      f.source,
      reviewed,
      output,
      'test import',
    ),
  ]);
  const decisions = recordDeferredDecision(
    f.decisionPath,
    f.source,
    reviewed,
    'old defer',
  );

  const all = candidateReviewView(
    [reviewed],
    readLedger(f.ledgerPath),
    decisions,
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'all',
  );

  assert.equal(all.length, 1);
  assert.equal(all[0].ledgerState, 'imported');
  assert.equal(all[0].reviewState, 'accepted');
  assert.equal(all[0].deferred, false);
  assert.equal(all[0].rejected, false);
});

test('imported Candidate is governed by the import ledger, not an old rejection', () => {
  const f = workspace();
  const reviewed = candidate('content');
  const output = path.join(f.root, 'assets', 'table.md');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '| A | B |\n');
  recordEntries(f.ledgerPath, [
    entryFor(
      f.ledgerPath,
      f.source,
      reviewed,
      output,
      'test import',
    ),
  ]);
  const decisions = recordRejectedDecision(
    f.decisionPath,
    f.source,
    reviewed,
    'old rejection',
  );

  const ledger = readLedger(f.ledgerPath);
  const all = candidateReviewView(
    [reviewed],
    ledger,
    decisions,
    f.ledgerPath,
    f.decisionPath,
    f.source,
    'all',
  );

  assert.equal(all.length, 1);
  assert.equal(all[0].ledgerState, 'imported');
  assert.equal(all[0].reviewState, 'accepted');
  assert.equal(all[0].candidate.status, 'inferred');
  assert.equal(all[0].rejected, false);
  assert.deepEqual(
    candidateReviewView(
      [reviewed],
      ledger,
      decisions,
      f.ledgerPath,
      f.decisionPath,
      f.source,
      'exclude-imported',
    ),
    [],
  );
});
