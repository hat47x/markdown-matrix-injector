import test from 'node:test';
import assert from 'node:assert/strict';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { candidateLedgerView } from '../src/core/candidateLedgerView.js';
import { emptyImportLedger, recordImport } from '../src/core/importLedger.js';

function candidate(content: string, sheet: string, range: string): Candidate {
  const fingerprint = fingerprintOf('image-media-bytes-v1', content);
  return {
    kind: 'image',
    locator: { source: './book.xlsx', sourceDigest: fingerprintOf('source-bytes-v1', 'source').digest, sheet, range },
    status: 'observed', execution: 'deterministic', method: 'M0',
    claims: [{ aspect: 'digest', value: fingerprint.digest, status: 'observed', execution: 'deterministic', method: 'M0', reasonCode: 'test' }],
    provenance: { algorithm: 'test', run: { execution: 'deterministic', inputDigest: 'source', config: {}, implementationVersion: '1' } },
    fingerprint, scores: [],
  };
}

const imported = candidate('same-image', 'Sheet1', 'B2:D8');
const duplicateOccurrence = candidate('same-image', 'Sheet2', 'A1:C7');
const changedOccurrence = candidate('changed-image', 'Sheet1', 'B2:D8');
const newOccurrence = candidate('new-image', 'Sheet3', 'E2:F6');
const ledger = recordImport(emptyImportLedger(), {
  locator: imported.locator, fingerprint: imported.fingerprint, kind: imported.kind,
  output: 'assets/image.png', conversion: { mode: 'raw-image-bytes-v1' },
  reviewState: 'confirmed', reviewBasis: 'explicit-cli-extract', importedAt: '2026-10-01T00:00:00.000Z',
});

test('all exposes exact, same-content, changed and unimported as distinct evidence', () => {
  assert.deepEqual(
    candidateLedgerView([imported, duplicateOccurrence, changedOccurrence, newOccurrence], ledger).map((item) => item.ledger.state),
    ['exact-occurrence', 'same-content', 'changed-occurrence', 'unimported'],
  );
});

test('unimported hides only the reviewed occurrence, not equal content elsewhere', () => {
  const view = candidateLedgerView([imported, duplicateOccurrence, changedOccurrence, newOccurrence], ledger, 'unimported');
  assert.deepEqual(view.map((item) => item.ledger.state), ['same-content', 'changed-occurrence', 'unimported']);
});

test('exclude-exact currently has explicit occurrence semantics', () => {
  const view = candidateLedgerView([imported, duplicateOccurrence, changedOccurrence], ledger, 'exclude-exact');
  assert.deepEqual(view.map((item) => item.ledger.state), ['same-content', 'changed-occurrence']);
});
