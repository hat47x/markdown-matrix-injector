import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  clearReviewDecisionForCandidate,
  deferredDecisionForCandidate,
  readReviewDecisions,
  recordDeferredDecision,
  recordRejectedDecision,
  rejectedDecisionForCandidate,
  REVIEW_DECISIONS_SCHEMA,
} from '../src/core/candidateReviewDecisions.js';
import {
  fingerprintOf,
  type Candidate,
} from '../src/core/candidate.js';

function candidate(
  content: string,
  options: {
    sourceMaterial?: string;
    reasonCode?: string;
    implementationVersion?: string;
  } = {},
): Candidate {
  const sourceDigest = fingerprintOf(
    'source-bytes-v1',
    options.sourceMaterial ?? 'source-v1',
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
        reasonCode: options.reasonCode ?? 'blank-row-column-regions',
      },
    ],
    provenance: {
      algorithm: 'test.table-detector',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {},
        implementationVersion:
          options.implementationVersion ?? '1',
      },
    },
    fingerprint: fingerprintOf(
      'table-display-cells-v1',
      content,
    ),
    scores: [],
  };
}

test('rejected decision survives round trip for the exact reviewed Candidate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('A\u001fB\u001e1\u001f2');

  recordRejectedDecision(
    decisionsPath,
    source,
    reviewed,
    'candidate review UI',
  );
  const decisions = readReviewDecisions(decisionsPath);

  assert.equal(decisions.schema, REVIEW_DECISIONS_SCHEMA);
  assert.equal(decisions.entries.length, 1);
  assert.equal(
    rejectedDecisionForCandidate(
      decisions,
      decisionsPath,
      source,
      reviewed,
    )?.decision,
    'rejected',
  );
  assert.match(
    fs.readFileSync(decisionsPath, 'utf8'),
    /"schema": "mmi\.review-decisions\/v1"/u,
  );
});

test('deferred decision survives round trip for the exact reviewed Candidate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('A\u001fB\u001e1\u001f2');

  recordDeferredDecision(
    decisionsPath,
    source,
    reviewed,
    'candidate review UI',
  );
  const decisions = readReviewDecisions(decisionsPath);

  assert.equal(decisions.entries.length, 1);
  assert.equal(
    deferredDecisionForCandidate(
      decisions,
      decisionsPath,
      source,
      reviewed,
    )?.decision,
    'deferred',
  );
  assert.equal(
    rejectedDecisionForCandidate(
      decisions,
      decisionsPath,
      source,
      reviewed,
    ),
    undefined,
  );
});

test('changed Candidate evidence invalidates a deferred decision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('same-content');
  recordDeferredDecision(decisionsPath, source, reviewed, 'review');

  assert.equal(
    deferredDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      candidate('changed-content'),
    ),
    undefined,
  );
  assert.equal(
    deferredDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      candidate('same-content', {
        reasonCode: 'different-boundary-evidence',
      }),
    ),
    undefined,
  );
});

test('a later exact review decision replaces the previous decision at the same occurrence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('content');

  recordDeferredDecision(decisionsPath, source, reviewed, 'defer');
  recordRejectedDecision(decisionsPath, source, reviewed, 'reject');
  const decisions = readReviewDecisions(decisionsPath);

  assert.equal(decisions.entries.length, 1);
  assert.equal(decisions.entries[0].decision, 'rejected');
  assert.ok(
    rejectedDecisionForCandidate(
      decisions,
      decisionsPath,
      source,
      reviewed,
    ),
  );
  assert.equal(
    deferredDecisionForCandidate(
      decisions,
      decisionsPath,
      source,
      reviewed,
    ),
    undefined,
  );
});

test('rejection ignores unrelated source digest changes when local Candidate evidence is unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('same-local-content');
  recordRejectedDecision(decisionsPath, source, reviewed, 'review');

  const unrelatedSourceChange = candidate(
    'same-local-content',
    { sourceMaterial: 'source-v2-with-other-region-change' },
  );

  assert.ok(
    rejectedDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      unrelatedSourceChange,
    ),
  );
});

test('changed content invalidates rejection so the Candidate returns to review', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  recordRejectedDecision(
    decisionsPath,
    source,
    candidate('old-content'),
    'review',
  );

  assert.equal(
    rejectedDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      candidate('new-content'),
    ),
    undefined,
  );
});

test('changed Claim basis invalidates rejection even when content fingerprint is unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('same-content');
  recordRejectedDecision(decisionsPath, source, reviewed, 'review');

  assert.equal(
    rejectedDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      candidate('same-content', {
        reasonCode: 'different-boundary-evidence',
      }),
    ),
    undefined,
  );
  assert.equal(
    rejectedDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      candidate('same-content', {
        implementationVersion: '2',
      }),
    ),
    undefined,
  );
});

test('clearing a rejection lets an adopted Candidate leave decision state behind', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');
  const reviewed = candidate('content');
  recordRejectedDecision(decisionsPath, source, reviewed, 'review');

  const cleared = clearReviewDecisionForCandidate(
    decisionsPath,
    source,
    reviewed,
  );

  assert.deepEqual(cleared.entries, []);
  assert.equal(
    rejectedDecisionForCandidate(
      readReviewDecisions(decisionsPath),
      decisionsPath,
      source,
      reviewed,
    ),
    undefined,
  );
});


test('clearing with no prior decision does not create an empty project file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-review-decision-'));
  const source = path.join(root, 'design.csv');
  const decisionsPath = path.join(root, 'mmi-review-decisions.json');
  fs.writeFileSync(source, 'A,B\n1,2\n');

  const cleared = clearReviewDecisionForCandidate(
    decisionsPath,
    source,
    candidate('content'),
  );

  assert.deepEqual(cleared.entries, []);
  assert.equal(fs.existsSync(decisionsPath), false);
});
