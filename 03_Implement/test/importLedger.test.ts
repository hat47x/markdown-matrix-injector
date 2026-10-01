import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import {
  classify,
  entryFor,
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
