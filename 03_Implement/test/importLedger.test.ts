import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { emptyImportLedger, matchLedger, readImportLedger, recordImport, writeImportLedger } from '../src/core/importLedger.js';

function candidate(content: string, source = 'source-a'): Candidate {
  const fingerprint = fingerprintOf('image-media-bytes-v1', content);
  const sourceFingerprint = fingerprintOf('source-bytes-v1', source);
  return { kind: 'image', locator: { source: './design.xlsx', sourceDigest: sourceFingerprint.digest, sheet: '画面', range: 'B2:D8' }, status: 'observed', execution: 'deterministic', method: 'M0', claims: [{ aspect: 'digest', value: fingerprint.digest, status: 'observed', execution: 'deterministic', method: 'M0', reasonCode: 'test' }], provenance: { algorithm: 'test', run: { execution: 'deterministic', inputDigest: sourceFingerprint.digest, config: {}, implementationVersion: '1' } }, fingerprint, scores: [] };
}

function entry(first: Candidate) {
  return { locator: first.locator, fingerprint: first.fingerprint, kind: first.kind, output: 'assets/image-a.png', conversion: { mode: 'raw-image-bytes-v1' }, reviewState: 'confirmed' as const, reviewBasis: 'explicit-cli-extract', importedAt: '2026-10-01T00:00:00.000Z' };
}

test('ledger separates exact occurrence, changed occurrence, and unimported content', () => {
  const first = candidate('image-a');
  const ledger = recordImport(emptyImportLedger(), entry(first));
  assert.equal(matchLedger(first, ledger).state, 'exact-occurrence');
  assert.equal(matchLedger(candidate('image-b', 'source-b'), ledger).state, 'changed-occurrence');
  assert.equal(matchLedger({ ...candidate('image-c'), locator: { ...first.locator, range: 'J2:L8' } }, ledger).state, 'unimported');
});

test('same content at another occurrence is evidence, not inherited review state', () => {
  const first = candidate('image-a');
  const ledger = recordImport(emptyImportLedger(), entry(first));
  const duplicate = { ...first, locator: { ...first.locator, sheet: '別画面', range: 'A1:C7' } };
  assert.equal(matchLedger(duplicate, ledger).state, 'same-content');
  const both = recordImport(ledger, { ...entry(duplicate), output: 'assets/image-a-copy.png', reviewBasis: 'explicit-cli-extract-second-occurrence' });
  assert.equal(both.entries.length, 2);
  assert.equal(matchLedger(duplicate, both).state, 'exact-occurrence');
});

test('ledger is readable JSON and survives a write/read round trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const file = path.join(dir, '.mmi', 'import-ledger.json');
  const first = candidate('image-a');
  const ledger = recordImport(emptyImportLedger(), entry(first));
  writeImportLedger(file, ledger);
  assert.deepEqual(readImportLedger(file), ledger);
  assert.match(fs.readFileSync(file, 'utf8'), /"version": 1/u);
  assert.match(fs.readFileSync(file, 'utf8'), /"reviewBasis": "explicit-cli-extract"/u);
});
