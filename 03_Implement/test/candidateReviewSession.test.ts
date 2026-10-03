import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { imageCandidates, type ExcelImage } from '../src/adapters/excelImageAdapter.js';
import { candidateReviewFacetFilter } from '../src/application/candidateReviewFilter.js';
import {
  candidateReviewSessionKey,
  remainingCandidateReviewItems,
} from '../src/application/candidateReviewSession.js';
import { emptyReviewDecisions } from '../src/core/candidateReviewDecisions.js';
import { candidateReviewView } from '../src/core/candidateReviewView.js';
import { emptyLedger } from '../src/core/importLedger.js';

const sourcePath = path.resolve('/workspace/design.xlsx');
const ledgerPath = path.resolve('/workspace/mmi-ledger.json');
const decisionsPath = path.resolve('/workspace/mmi-review-decisions.json');
const sourceDigest = 'sha256:' + '1'.repeat(64);

function image(
  ordinal: number,
  sheet: string,
  range: string,
  digestChar: string,
): ExcelImage {
  return {
    ordinal,
    sheet,
    name: `Picture ${ordinal}`,
    anchor: {
      kind: 'twoCellAnchor',
      from: { row: 0, col: 0 },
      to: { row: 1, col: 1 },
    },
    range,
    mediaPart: `xl/media/image${ordinal}.png`,
    format: 'png',
    bytes: 4,
    digest: 'sha256:' + digestChar.repeat(64),
    extractable: true,
  };
}

test('continuous review excludes Candidates already handled in the session', () => {
  const candidates = imageCandidates({
    source: 'design.xlsx',
    sourceDigest,
    images: [
      image(1, 'Sheet1', 'A1:B2', 'a'),
      image(2, 'Sheet1', 'C1:D2', 'b'),
    ],
  });
  const view = candidateReviewView(
    candidates,
    emptyLedger(),
    emptyReviewDecisions(),
    ledgerPath,
    decisionsPath,
    sourcePath,
    'all',
  );
  const processed = new Set([
    candidateReviewSessionKey(candidates[0]),
  ]);

  const remaining = remainingCandidateReviewItems(
    view,
    candidateReviewFacetFilter([]),
    processed,
  );

  assert.deepEqual(
    remaining.map((item) => item.candidate.fingerprint.digest),
    [candidates[1].fingerprint.digest],
  );
});

test('continuous review preserves the selected facets between actions', () => {
  const candidates = imageCandidates({
    source: 'design.xlsx',
    sourceDigest,
    images: [
      image(1, 'Sheet1', 'A1:B2', 'a'),
      image(2, 'Sheet1', 'C1:D2', 'b'),
    ],
  });
  candidates[1] = {
    ...candidates[1],
    status: 'inferred',
    claims: candidates[1].claims.map((claim, index) =>
      index === 0 ? { ...claim, status: 'inferred' } : claim),
  };
  const view = candidateReviewView(
    candidates,
    emptyLedger(),
    emptyReviewDecisions(),
    ledgerPath,
    decisionsPath,
    sourcePath,
    'all',
  );

  const remaining = remainingCandidateReviewItems(
    view,
    candidateReviewFacetFilter([
      { axis: 'status', value: 'inferred' },
    ]),
    new Set(),
  );

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].candidate.status, 'inferred');
});
