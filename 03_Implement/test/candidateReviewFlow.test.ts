import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { imageCandidates, type ExcelImage } from '../src/adapters/excelImageAdapter.js';
import { candidateLedgerView } from '../src/core/candidateLedgerView.js';
import { emptyLedger, entryFor } from '../src/core/importLedger.js';

const sourcePath = path.resolve('/workspace/design.xlsx');
const ledgerPath = path.resolve('/workspace/mmi-ledger.json');
const sourceDigest = 'sha256:' + '1'.repeat(64);
function image(ordinal: number, sheet: string, range: string, digestChar: string): ExcelImage {
  return { ordinal, sheet, name: `Picture ${ordinal}`, anchor: { kind: 'twoCellAnchor', from: { row: 0, col: 0 }, to: { row: 1, col: 1 } }, range, mediaPart: `xl/media/image${ordinal}.png`, format: 'png', bytes: 4, digest: 'sha256:' + digestChar.repeat(64), extractable: true };
}
test('candidate review attention view exposes changed and unimported images', () => {
  const first = imageCandidates({ source: 'design.xlsx', sourceDigest, images: [image(1, 'Sheet1', 'A1:B2', 'a')] })[0];
  const changed = imageCandidates({ source: 'design.xlsx', sourceDigest, images: [image(1, 'Sheet1', 'A1:B2', 'b')] })[0];
  const fresh = imageCandidates({ source: 'design.xlsx', sourceDigest, images: [image(2, 'Sheet2', 'C3:D4', 'c')] })[0];
  const ledger = emptyLedger();
  ledger.entries.push(entryFor(ledgerPath, sourcePath, first, '/workspace/assets/first.png', 'mmi extract'));
  const view = candidateLedgerView([changed, fresh], ledger, ledgerPath, sourcePath, 'exclude-imported');
  assert.deepEqual(view.map((item) => item.ledgerState), ['changed', 'unimported']);
  assert.equal(view[0].candidate.status, 'observed');
  assert.equal(view[0].candidate.execution, 'deterministic');
  assert.deepEqual(view[0].researchScores, []);
});
