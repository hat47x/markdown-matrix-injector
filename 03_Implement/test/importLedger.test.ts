import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Candidate } from '../src/core/candidate.js';
import { emptyImportLedger, matchLedger, readImportLedger, recordImport, writeImportLedger } from '../src/core/importLedger.js';

function candidate(digest: string, sourceDigest = 'sha256:source-a'): Candidate {
  return {
    kind: 'image',
    locator: { source: './design.xlsx', sourceDigest, sheet: '画面', range: 'B2:D8' },
    status: 'observed', execution: 'deterministic', method: 'M0', claims: [{ aspect: 'digest', value: digest, status: 'observed', execution: 'deterministic', method: 'M0', reasonCode: 'test' }],
    provenance: { algorithm: 'test', run: { execution: 'deterministic', inputDigest: sourceDigest, config: {}, implementationVersion: '1' } },
    fingerprint: { algorithm: 'sha256', representation: 'image-media-bytes-v1', digest },
    scores: [],
  };
}

test('ledger distinguishes exact content, changed content at the same locator, and unimported content', () => {
  const first = candidate('sha256:image-a');
  const ledger = recordImport(emptyImportLedger(), {
    locator: first.locator, fingerprint: first.fingerprint, kind: first.kind,
    output: 'assets/image-a.png', conversion: { mode: 'raw-image-bytes-v1' }, confirmation: 'confirmed', importedAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(matchLedger(first, ledger).state, 'exact');
  assert.equal(matchLedger(candidate('sha256:image-b', 'sha256:source-b'), ledger).state, 'changed');
  assert.equal(matchLedger({ ...candidate('sha256:image-c'), locator: { ...first.locator, range: 'J2:L8' } }, ledger).state, 'unimported');
});

test('the same fingerprint at another source location is exact, not a duplicate candidate to import', () => {
  const first = candidate('sha256:image-a');
  const ledger = recordImport(emptyImportLedger(), {
    locator: first.locator, fingerprint: first.fingerprint, kind: first.kind,
    output: 'assets/image-a.png', conversion: {}, confirmation: 'confirmed', importedAt: '2026-10-01T00:00:00.000Z',
  });
  const duplicate = { ...first, locator: { ...first.locator, sheet: '別画面', range: 'A1:C7' } };
  assert.equal(matchLedger(duplicate, ledger).state, 'exact');
});

test('ledger is readable JSON and survives a write/read round trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ledger-'));
  const file = path.join(dir, '.mmi', 'import-ledger.json');
  const first = candidate('sha256:image-a');
  const ledger = recordImport(emptyImportLedger(), {
    locator: first.locator, fingerprint: first.fingerprint, kind: first.kind,
    output: 'assets/image-a.png', conversion: { mode: 'raw-image-bytes-v1' }, confirmation: 'confirmed', importedAt: '2026-10-01T00:00:00.000Z',
  });
  writeImportLedger(file, ledger);
  assert.deepEqual(readImportLedger(file), ledger);
  assert.match(fs.readFileSync(file, 'utf8'), /"version": 1/u);
});
