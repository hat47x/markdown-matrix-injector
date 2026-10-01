import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { candidateLedgerView } from '../src/core/candidateLedgerView.js';
import { emptyLedger, entryFor, type Ledger } from '../src/core/importLedger.js';

const ledgerPath = path.resolve('/workspace/mmi-ledger.json');
const sourcePath = path.resolve('/workspace/data/design.xlsx');

function candidate(content: string, sheet: string, range: string): Candidate {
  const fingerprint = fingerprintOf('image-media-bytes-v1', content);
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'image',
    locator: { source: './data/design.xlsx', sourceDigest, sheet, range },
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

const imported = candidate('same-image', 'Sheet1', 'B2:D8');
const duplicateOccurrence = candidate('same-image', 'Sheet2', 'A1:C7');
const changedOccurrence = candidate('changed-image', 'Sheet1', 'B2:D8');
const newOccurrence = candidate('new-image', 'Sheet3', 'E2:F6');
const ledger: Ledger = {
  ...emptyLedger(),
  entries: [entryFor(ledgerPath, sourcePath, imported, '/workspace/assets/image.png', 'mmi extract')],
};

test('all distinguishes imported, duplicate, changed and unimported evidence', () => {
  assert.deepEqual(
    candidateLedgerView(
      [imported, duplicateOccurrence, changedOccurrence, newOccurrence],
      ledger,
      ledgerPath,
      sourcePath,
    ).map((item) => item.ledgerState),
    ['imported', 'duplicate', 'changed', 'unimported'],
  );
});

test('unimported includes never-imported duplicate occurrences but not changed ones', () => {
  const view = candidateLedgerView(
    [imported, duplicateOccurrence, changedOccurrence, newOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
    'unimported',
  );
  assert.deepEqual(view.map((item) => item.ledgerState), ['duplicate', 'unimported']);
});

test('exclude-imported retains changed occurrences for review', () => {
  const view = candidateLedgerView(
    [imported, duplicateOccurrence, changedOccurrence, newOccurrence],
    ledger,
    ledgerPath,
    sourcePath,
    'exclude-imported',
  );
  assert.deepEqual(view.map((item) => item.ledgerState), ['duplicate', 'changed', 'unimported']);
});
