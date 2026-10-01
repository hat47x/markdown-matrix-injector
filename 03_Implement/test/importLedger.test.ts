import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import {
  assessLedger,
  classify,
  entryFor,
  lineageCandidates,
  readLedger,
  recordEntries,
} from '../src/core/importLedger.js';

function candidate(content: string, sheet = '画面', range = 'B2:D8'): Candidate {
  const fingerprint = fingerprintOf('image-media-bytes-v1', content);
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'image',
    locator: { source: './design.xlsx', sourceDigest, sheet, range },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims: [{
      aspect: 'digest',
      value: fingerprint.digest,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'test',
    }],
    provenance: {
      algorithm: 'test',
      run: { execution: 'deterministic', inputDigest: sourceDigest, config: {}, implementationVersion: '1' },
    },
    fingerprint,
    scores: [],
  };
}

test('ledger classifies occurrence identity separately from content identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const output = path.join(root, 'assets', 'image.png');
  const first = candidate('image-a');

  recordEntries(ledgerPath, [entryFor(ledgerPath, source, first, output, 'mmi extract')]);
  const ledger = readLedger(ledgerPath);

  assert.equal(classify(ledger, ledgerPath, source, first), 'imported');
  assert.equal(classify(ledger, ledgerPath, source, candidate('image-b')), 'changed');
  assert.equal(classify(ledger, ledgerPath, source, candidate('image-a', '別画面', 'A1:C7')), 'duplicate');
  assert.equal(classify(ledger, ledgerPath, source, candidate('image-c', '別画面', 'A1:C7')), 'unimported');
});

test('recording equal content at another occurrence keeps both review records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  const duplicate = candidate('image-a', '別画面', 'A1:C7');

  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'a.png'), 'mmi extract'),
  ]);
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, duplicate, path.join(root, 'assets', 'a.png'), 'mmi extract'),
  ]);

  const ledger = readLedger(ledgerPath);
  assert.equal(ledger.entries.length, 2);
  assert.equal(classify(ledger, ledgerPath, source, first), 'imported');
  assert.equal(classify(ledger, ledgerPath, source, duplicate), 'imported');
});

test('ledger is readable JSON and survives a write/read round trip', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'nested', 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');

  const recorded = recordEntries(ledgerPath, [
    entryFor(
      ledgerPath,
      source,
      first,
      path.join(root, 'assets', 'image-a.png'),
      'mmi extract',
      { mode: 'raw-image-bytes-v1', format: 'png' },
    ),
  ]);

  assert.deepEqual(readLedger(ledgerPath), recorded);
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  assert.match(raw, /"schema": "mmi\.ledger\/v1"/u);
  assert.match(raw, /"reviewState": "confirmed"/u);
  assert.match(raw, /"basis": "mmi extract"/u);
  assert.match(raw, /"mode": "raw-image-bytes-v1"/u);
  assert.match(raw, /"sourceDigest": "sha256:/u);
  assert.match(raw, /"reviewedAt": "/u);
});


test('same digest under a different fingerprint representation is changed, not imported', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');

  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);
  const ledger = readLedger(ledgerPath);
  const changedRepresentation: Candidate = {
    ...first,
    fingerprint: {
      ...first.fingerprint,
      representation: 'image-media-bytes-v2',
    },
  };

  assert.equal(classify(ledger, ledgerPath, source, changedRepresentation), 'changed');
});


test('same content becomes stale when a recorded Claim basis changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const changedClaim: Candidate = {
    ...first,
    claims: first.claims.map((claim) => ({
      ...claim,
      reasonCode: 'different-evidence-rule',
    })),
  };
  const assessment = assessLedger(readLedger(ledgerPath), ledgerPath, source, changedClaim);

  assert.equal(assessment.state, 'stale');
  assert.deepEqual(assessment.staleClaims, ['digest']);
  assert.equal(classify(readLedger(ledgerPath), ledgerPath, source, changedClaim), 'stale');
});

test('whole-source digest changes do not stale unchanged local Claim basis', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const newSourceDigest = fingerprintOf('source-bytes-v1', 'source-with-unrelated-sheet-change').digest;
  const sameLocalEvidence: Candidate = {
    ...first,
    locator: { ...first.locator, sourceDigest: newSourceDigest },
    provenance: {
      ...first.provenance,
      run: {
        ...first.provenance.run,
        inputDigest: newSourceDigest,
      },
    },
  };

  assert.equal(
    classify(readLedger(ledgerPath), ledgerPath, source, sameLocalEvidence),
    'imported',
  );
});

test('method/config changes stale a reviewed Claim even when value and content fingerprint match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  assert.equal(first.provenance.run.execution, 'deterministic');
  const changedMethod: Candidate = {
    ...first,
    provenance: {
      ...first.provenance,
      run: {
        ...first.provenance.run,
        implementationVersion: '2',
      },
    },
  };

  const assessment = assessLedger(readLedger(ledgerPath), ledgerPath, source, changedMethod);
  assert.equal(assessment.state, 'stale');
  assert.deepEqual(assessment.staleClaims, ['digest']);
});

test('legacy v1 entries without claimBasis remain fingerprint-compatible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  const legacyEntry = entryFor(
    ledgerPath,
    source,
    first,
    path.join(root, 'assets', 'image-a.png'),
    'mmi extract',
  );
  delete legacyEntry.claimBasis;

  fs.writeFileSync(
    ledgerPath,
    JSON.stringify({ schema: 'mmi.ledger/v1', entries: [legacyEntry] }, null, 2) + '\n',
    'utf8',
  );

  assert.equal(classify(readLedger(ledgerPath), ledgerPath, source, first), 'imported');
});

test('Claim basis canonicalization ignores object key insertion order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  assert.equal(first.provenance.run.execution, 'deterministic');
  const reviewed: Candidate = {
    ...first,
    provenance: {
      ...first.provenance,
      run: {
        ...first.provenance.run,
        config: { beta: 2, alpha: 1 },
      },
    },
  };
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, reviewed, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const reordered: Candidate = {
    ...reviewed,
    provenance: {
      ...reviewed.provenance,
      run: {
        ...reviewed.provenance.run,
        config: { alpha: 1, beta: 2 },
      },
    },
  };

  assert.equal(classify(readLedger(ledgerPath), ledgerPath, source, reordered), 'imported');
});


test('changed content reports which reviewed Claims became stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const changed = candidate('image-b');
  const assessment = assessLedger(readLedger(ledgerPath), ledgerPath, source, changed);
  assert.equal(assessment.state, 'changed');
  assert.deepEqual(assessment.staleClaims, ['digest']);
});

test('lineage proposals keep moved same-content occurrences as evidence only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const first = candidate('image-a', '画面', 'B2:D8');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const moved = candidate('image-a', '画面', 'J2:L8');
  assert.equal(classify(readLedger(ledgerPath), ledgerPath, source, moved), 'duplicate');
  const lineage = lineageCandidates(readLedger(ledgerPath), ledgerPath, source, moved);
  assert.equal(lineage.length, 1);
  assert.equal(lineage[0].place, 'B2:D8');
  assert.deepEqual(lineage[0].reasons, ['same-content', 'same-sheet']);
});

test('lineage can propose changed moved content from source-object hints without auto-importing it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const withObjectHints = (content: string, range: string): Candidate => {
    const base = candidate(content, '画面', range);
    return {
      ...base,
      claims: [
        ...base.claims,
        {
          aspect: 'name',
          value: 'Login Screenshot',
          status: 'observed',
          execution: 'deterministic',
          method: 'M0',
          reasonCode: 'drawing-property',
        },
        {
          aspect: 'media',
          value: 'xl/media/image1.png',
          status: 'observed',
          execution: 'deterministic',
          method: 'M0',
          reasonCode: 'package-relationship',
        },
      ],
    };
  };

  const first = withObjectHints('image-a', 'B2:D8');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, first, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const movedAndChanged = withObjectHints('image-b', 'J2:L8');
  assert.equal(classify(readLedger(ledgerPath), ledgerPath, source, movedAndChanged), 'unimported');
  const lineage = lineageCandidates(readLedger(ledgerPath), ledgerPath, source, movedAndChanged);
  assert.equal(lineage.length, 1);
  assert.deepEqual(
    lineage[0].reasons,
    ['same-sheet', 'same-object-name', 'same-source-object'],
  );
});


test('newly discovered Claims do not retroactively stale an earlier review basis', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const source = path.join(root, 'design.xlsx');
  const reviewed = candidate('image-a');
  recordEntries(ledgerPath, [
    entryFor(ledgerPath, source, reviewed, path.join(root, 'assets', 'image-a.png'), 'mmi extract'),
  ]);

  const richerCandidate: Candidate = {
    ...reviewed,
    claims: [
      ...reviewed.claims,
      {
        aspect: 'nearby-table',
        value: 'A1:B3',
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: 'geometry-right',
        evidence: [{ code: 'right', detail: 'gap=1 cells' }],
      },
    ],
  };

  assert.equal(
    classify(readLedger(ledgerPath), ledgerPath, source, richerCandidate),
    'imported',
  );
});
